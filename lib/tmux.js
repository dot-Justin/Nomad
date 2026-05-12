// tmux helper command builders. Caller is responsible for executing them
// via an SSH connection (typically conn.exec).

function shellEscape(value) {
  if (value == null) return "''";
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function safeName(value) {
  return String(value || "").replace(/[^A-Za-z0-9_.\-]/g, "");
}

const tmux = {
  listSessions() {
    return `tmux list-sessions -F '#{session_name}|#{session_windows}|#{session_activity}|#{session_attached}' 2>/dev/null`;
  },

  listWindows(sessionName) {
    return `tmux list-windows -t ${shellEscape(sessionName)} -F '#{window_index}|#{window_name}|#{window_active}|#{window_panes}' 2>/dev/null`;
  },

  attachOrCreate(sessionName) {
    const name = safeName(sessionName);
    return `exec tmux new-session -A -s ${shellEscape(name)}`;
  },

  newSession(sessionName) {
    const name = safeName(sessionName);
    return `tmux new-session -d -s ${shellEscape(name)}`;
  },

  killSession(sessionName) {
    return `tmux kill-session -t ${shellEscape(sessionName)}`;
  },

  killWindow(sessionName, index) {
    const idx = Number(index);
    if (!Number.isFinite(idx)) throw new Error("invalid window index");
    return `tmux kill-window -t ${shellEscape(sessionName)}:${idx}`;
  },

  renameWindow(sessionName, index, name) {
    const idx = Number(index);
    if (!Number.isFinite(idx)) throw new Error("invalid window index");
    const safe = safeName(name);
    return `tmux rename-window -t ${shellEscape(sessionName)}:${idx} ${shellEscape(safe)}`;
  },

  newWindow(sessionName) {
    return `tmux new-window -t ${shellEscape(sessionName)}`;
  },

  prevWindow(sessionName) {
    return `tmux previous-window -t ${shellEscape(sessionName)}`;
  },

  nextWindow(sessionName) {
    return `tmux next-window -t ${shellEscape(sessionName)}`;
  },

  selectWindow(sessionName, index) {
    const idx = Number(index);
    if (!Number.isFinite(idx)) throw new Error("invalid window index");
    return `tmux select-window -t ${shellEscape(sessionName)}:${idx}`;
  },

  copyMode(sessionName) {
    return `tmux copy-mode -t ${shellEscape(sessionName)}`;
  },

  copyModeKey(sessionName, key) {
    return `tmux send-keys -X -t ${shellEscape(sessionName)}: ${shellEscape(key)}`;
  },
};

function parseSessions(stdout) {
  if (!stdout) return [];
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, windows, activity, attached] = line.split("|");
      return {
        name,
        windows: Number(windows) || 0,
        activity: Number(activity) || 0,
        attached: attached === "1",
      };
    });
}

function parseWindows(stdout) {
  if (!stdout) return [];
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [index, name, active, panes] = line.split("|");
      return {
        index: Number(index) || 0,
        name,
        active: active === "1",
        panes: Number(panes) || 1,
      };
    });
}

module.exports = {
  tmux,
  parseSessions,
  parseWindows,
  shellEscape,
  safeName,
};
