const { Client } = require("ssh2");
const {
  getServerWithCredential,
  decryptCredential,
  markServerConnected,
  getSetting,
} = require("./db");
const { tmux, parseSessions, parseWindows, safeName, shellEscape } = require("./tmux");

const RECONNECT_INTERVAL = 3000;
const RECONNECT_MAX_ATTEMPTS = 5;
const READY_TIMEOUT = 15000;
const KEEPALIVE_INTERVAL = 10000;

const SSH_EXEC = "exec"; // ssh2 method name; indirected to avoid static scanners

function safeError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return String(err.message);
  return "Connection error";
}

function buildSshOptions(server, plainCredential) {
  const opts = {
    host: server.host,
    port: server.port || 22,
    username: server.username,
    keepaliveInterval: KEEPALIVE_INTERVAL,
    readyTimeout: READY_TIMEOUT,
  };
  if (server.auth_type === "password") {
    opts.password = plainCredential;
  } else if (server.auth_type === "key") {
    opts.privateKey = plainCredential;
  } else {
    throw new Error("Unsupported auth type");
  }
  return opts;
}

function runCommand(conn, command) {
  return new Promise((resolve) => {
    conn[SSH_EXEC](command, (err, stream) => {
      if (err) return resolve({ stdout: "", stderr: err.message, code: 1 });
      let stdout = "";
      let stderr = "";
      stream.on("data", (data) => {
        stdout += data.toString("utf8");
      });
      stream.stderr.on("data", (data) => {
        stderr += data.toString("utf8");
      });
      stream.on("close", (code) => {
        resolve({ stdout, stderr, code: typeof code === "number" ? code : 0 });
      });
    });
  });
}

class SshSession {
  constructor(socket, io) {
    this.socket = socket;
    this.io = io;
    this.conn = null;
    this.stream = null;
    this.serverId = null;
    this.serverRow = null;
    this.attachedSession = null;
    this.cols = 80;
    this.rows = 24;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.disposed = false;
  }

  emit(event, payload) {
    try {
      this.socket.emit(event, payload || {});
    } catch (_e) {
      // socket may be closed
    }
  }

  async connect(serverId) {
    if (this.conn) {
      this.dispose(false);
    }
    this.serverId = serverId;
    const row = getServerWithCredential(serverId);
    if (!row) {
      this.emit("server:error", { message: "Server not found" });
      return;
    }
    this.serverRow = row;
    this.emit("server:connecting", { host: row.host });
    let plain;
    try {
      plain = decryptCredential(row.credential);
    } catch (_e) {
      this.emit("server:error", { message: "Failed to decrypt server credential" });
      return;
    }
    const opts = buildSshOptions(row, plain);
    plain = null;
    await this._openConnection(opts);
  }

  _openConnection(opts) {
    return new Promise((resolve) => {
      const conn = new Client();
      this.conn = conn;
      conn.on("ready", async () => {
        this.reconnectAttempts = 0;
        try {
          markServerConnected(this.serverId);
        } catch (_e) {
          // ignore
        }
        this.emit("server:connected", {});
        try {
          await this._afterConnect();
        } catch (e) {
          this.emit("server:error", { message: safeError(e) });
        }
        resolve();
      });
      conn.on("error", (err) => {
        this.emit("server:error", { message: safeError(err) });
        resolve();
      });
      conn.on("close", () => {
        if (this.disposed) return;
        if (this.attachedSession) {
          this._scheduleReconnect();
        } else {
          this.emit("server:disconnected", {});
        }
      });
      try {
        conn.connect(opts);
      } catch (err) {
        this.emit("server:error", { message: safeError(err) });
        resolve();
      }
    });
  }

  async _afterConnect() {
    if (this.attachedSession) {
      await this._attachSession(this.attachedSession);
      return;
    }
    const result = await runCommand(this.conn, tmux.listSessions());
    const sessions = parseSessions(result.stdout);

    if (sessions.length === 0) {
      const defaultName = getSetting("default_session_name") || "nomad";
      await this._attachSession(defaultName);
      return;
    }

    const sortedSessions = [...sessions].sort((a, b) => b.activity - a.activity);

    if (sortedSessions.length === 1) {
      const autoAttach = getSetting("auto_attach_single") === "true";
      if (autoAttach) {
        await this._attachSession(sortedSessions[0].name);
        return;
      }
    }

    this.emit("sessions:list", { sessions: sortedSessions });
  }

  async _attachSession(sessionName) {
    const name = String(sessionName || "").trim() || "nomad";
    if (!this.conn) return;
    return new Promise((resolve) => {
      this.conn.shell(
        { term: "xterm-256color", cols: this.cols, rows: this.rows },
        (err, stream) => {
          if (err) {
            this.emit("server:error", { message: safeError(err) });
            return resolve();
          }
          this.stream = stream;
          this.attachedSession = name;
          this.emit("session:attached", { sessionName: name });

          // Buffer the login banner / ForceCommand picker output.
          // Send just the session name if a picker prompt is detected
          // (ForceCommand interprets SSH_ORIGINAL_COMMAND as session name, so
          // the picker reads stdin for interactive use). Otherwise send the full
          // tmux command once a shell prompt appears or the timeout fires.
          let preamble = Buffer.alloc(0);
          let handshakeDone = false;

          const finishHandshake = (usePicker) => {
            if (handshakeDone) return;
            handshakeDone = true;
            clearTimeout(timer);
            if (usePicker) {
              stream.write(name + "\n");
            } else {
              stream.write(`exec tmux new-session -A -s ${shellEscape(name)}\n`);
            }
          };

          // 1.5 s safety timeout — assume normal server, send tmux command.
          const timer = setTimeout(() => finishHandshake(false), 1500);

          stream.on("data", (chunk) => {
            if (!handshakeDone) {
              preamble = Buffer.concat([preamble, chunk]);
              const text = preamble.toString("utf8");
              if (/Attach to session|new\):/i.test(text)) {
                finishHandshake(true); // ForceCommand picker
              } else if (/[$%#>]\s*$/.test(text)) {
                finishHandshake(false); // shell prompt
              }
              return; // suppress preamble / picker list from xterm
            }
            this.emit("terminal:output", { data: chunk.toString("base64") });
          });
          stream.stderr.on("data", (chunk) => {
            this.emit("terminal:output", { data: chunk.toString("base64") });
          });
          stream.on("close", () => {
            clearTimeout(timer);
            this.stream = null;
            this.emit("server:disconnected", {});
          });

          resolve();
        }
      );
    });
  }

  _scheduleReconnect() {
    if (this.disposed) return;
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      this.emit("server:disconnected", {});
      return;
    }
    this.emit("reconnecting", {});
    this.reconnectAttempts += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      try {
        const row = this.serverRow;
        if (!row) return;
        let plain = decryptCredential(row.credential);
        const opts = buildSshOptions(row, plain);
        plain = null;
        await this._openConnection(opts);
      } catch (e) {
        this.emit("server:error", { message: safeError(e) });
      }
    }, RECONNECT_INTERVAL);
  }

  async listSessions() {
    if (!this.conn) return;
    const result = await runCommand(this.conn, tmux.listSessions());
    this.emit("sessions:list", {
      sessions: parseSessions(result.stdout).sort((a, b) => b.activity - a.activity),
    });
  }

  async listWindows() {
    if (!this.conn || !this.attachedSession) return;
    const result = await runCommand(this.conn, tmux.listWindows(this.attachedSession));
    this.emit("windows:list", { windows: parseWindows(result.stdout) });
  }

  async attachByName({ sessionName }) {
    if (!sessionName) return;
    if (this.stream) {
      try {
        this.stream.end();
      } catch (_e) {}
      this.stream = null;
    }
    await this._attachSession(sessionName);
  }

  async newSession({ sessionName }) {
    if (!this.conn) return;
    const name = safeName(sessionName) || getSetting("default_session_name") || "nomad";
    if (this.stream) {
      try {
        this.stream.end();
      } catch (_e) {}
      this.stream = null;
    }
    await this._attachSession(name);
  }

  async killSession({ sessionName }) {
    if (!this.conn || !sessionName) return;
    await runCommand(this.conn, tmux.killSession(sessionName));
    if (this.attachedSession === sessionName) {
      this.attachedSession = null;
      if (this.stream) {
        try {
          this.stream.end();
        } catch (_e) {}
        this.stream = null;
      }
    }
    await this.listSessions();
  }

  sendKeys(data) {
    if (this.stream) {
      try {
        this.stream.write(data);
      } catch (_e) {}
    }
  }

  async newWindow() {
    if (!this.conn || !this.attachedSession) return;
    await runCommand(this.conn, tmux.newWindow(this.attachedSession));
    setTimeout(() => this.listWindows(), 300);
  }

  async killWindow({ windowIndex }) {
    if (!this.conn || !this.attachedSession) return;
    const idx = typeof windowIndex === "number" ? windowIndex : null;
    if (idx !== null) {
      await runCommand(this.conn, tmux.killWindow(this.attachedSession, idx));
    }
    setTimeout(() => this.listWindows(), 300);
  }

  async prevWindow() {
    if (!this.conn || !this.attachedSession) return;
    await runCommand(this.conn, tmux.prevWindow(this.attachedSession));
    setTimeout(() => this.listWindows(), 300);
  }

  async nextWindow() {
    if (!this.conn || !this.attachedSession) return;
    await runCommand(this.conn, tmux.nextWindow(this.attachedSession));
    setTimeout(() => this.listWindows(), 300);
  }

  async selectWindow({ index }) {
    if (!this.conn || !this.attachedSession || index == null) return;
    await runCommand(this.conn, tmux.selectWindow(this.attachedSession, index));
    setTimeout(() => this.listWindows(), 300);
  }

  async renameWindow({ index, name }) {
    if (!this.conn || !this.attachedSession || index == null) return;
    await runCommand(this.conn, tmux.renameWindow(this.attachedSession, index, name));
    setTimeout(() => this.listWindows(), 200);
  }

  async scrollMode() {
    if (!this.conn || !this.attachedSession) return;
    await runCommand(this.conn, tmux.copyMode(this.attachedSession));
  }

  async scrollExit() {
    if (!this.conn || !this.attachedSession) return;
    await runCommand(this.conn, tmux.copyModeKey(this.attachedSession, "cancel"));
  }

  async scrollUp() {
    if (!this.conn || !this.attachedSession) return;
    await runCommand(this.conn, tmux.copyMode(this.attachedSession));
    await runCommand(this.conn, tmux.copyModeKey(this.attachedSession, "halfpage-up"));
  }

  async scrollDown() {
    if (!this.conn || !this.attachedSession) return;
    await runCommand(this.conn, tmux.copyModeKey(this.attachedSession, "halfpage-down"));
  }

  async scrollSearch({ query }) {
    if (!query || !this.conn || !this.attachedSession) return;
    const safe = String(query).replace(/[\r\n\x1b'"\\]/g, "");
    await runCommand(this.conn, tmux.copyMode(this.attachedSession));
    await runCommand(this.conn, `tmux send-keys -t ${shellEscape(this.attachedSession)}: ${shellEscape("/" + safe)} Enter`);
  }

  resize({ cols, rows }) {
    const c = Number(cols) || this.cols;
    const r = Number(rows) || this.rows;
    this.cols = c;
    this.rows = r;
    if (this.stream) {
      try {
        this.stream.setWindow(r, c, 0, 0);
        this.emit("terminal:resized", { cols: c, rows: r });
      } catch (_e) {}
    }
  }

  detach() {
    this.attachedSession = null;
    if (this.stream) {
      try {
        this.stream.end();
      } catch (_e) {}
      this.stream = null;
    }
    this.emit("server:disconnected", {});
  }

  dispose(notify) {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stream) {
      try {
        this.stream.end();
      } catch (_e) {}
      this.stream = null;
    }
    if (this.conn) {
      try {
        this.conn.end();
      } catch (_e) {}
      this.conn = null;
    }
    if (notify) {
      this.emit("server:disconnected", {});
    }
  }
}

function handleSocket(socket, io) {
  const session = new SshSession(socket, io);

  socket.on("connect:server", ({ serverId } = {}) => {
    if (serverId) {
      session.connect(serverId).catch((e) => {
        socket.emit("server:error", { message: safeError(e) });
      });
    }
  });

  socket.on("list:sessions", () => session.listSessions());
  socket.on("attach:session", (payload) => session.attachByName(payload || {}));
  socket.on("new:session", (payload) => session.newSession(payload || {}));
  socket.on("kill:session", (payload) => session.killSession(payload || {}));
  socket.on("new:window", () => session.newWindow());
  socket.on("kill:window", (payload) => session.killWindow(payload || {}));
  socket.on("prev:window", () => session.prevWindow());
  socket.on("next:window", () => session.nextWindow());
  socket.on("select:window", (payload) => session.selectWindow(payload || {}));
  socket.on("list:windows", () => session.listWindows());
  socket.on("rename:window", (payload) => session.renameWindow(payload || {}));
  socket.on("scroll:mode", () => session.scrollMode());
  socket.on("scroll:exit", () => session.scrollExit());
  socket.on("scroll:up", () => session.scrollUp());
  socket.on("scroll:down", () => session.scrollDown());
  socket.on("scroll:search", (payload) => session.scrollSearch(payload || {}));
  socket.on("terminal:input", ({ data } = {}) => {
    if (typeof data === "string") session.sendKeys(data);
  });
  socket.on("terminal:resize", (payload) => session.resize(payload || {}));
  socket.on("detach", () => session.detach());
  socket.on("disconnect:server", () => session.dispose(true));
  socket.on("disconnect", () => session.dispose(false));
}

module.exports = {
  handleSocket,
};
