const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const express = require("express");
const { Server } = require("socket.io");

const {
  initDB,
  listServers,
  getServer,
  createServer: createServerRow,
  updateServer: updateServerRow,
  deleteServer: deleteServerRow,
  listSettings,
  updateSettings,
} = require("./lib/db");
const { handleSocket } = require("./lib/ssh");

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

function validateServerInput(body, requireCredential) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { errors: ["Invalid body"] };
  }
  if (!body.name || String(body.name).trim().length === 0) errors.push("name required");
  if (!body.host || String(body.host).trim().length === 0) errors.push("host required");
  if (!body.username || String(body.username).trim().length === 0)
    errors.push("username required");
  const port = body.port == null ? 22 : Number(body.port);
  if (!Number.isFinite(port) || port < 1 || port > 65535) errors.push("invalid port");
  if (!["password", "key"].includes(body.auth_type)) errors.push("invalid auth_type");
  if (requireCredential && (!body.credential || String(body.credential).length === 0)) {
    errors.push("credential required");
  }
  return { errors, normalized: errors.length ? null : { ...body, port } };
}

app.prepare().then(() => {
  initDB();

  const expressApp = express();
  expressApp.use(express.json({ limit: "1mb" }));

  expressApp.get("/api/servers", (_req, res) => {
    try {
      res.json({ servers: listServers() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  expressApp.get("/api/servers/:id", (req, res) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Not found" });
      res.json({ server });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  expressApp.post("/api/servers", (req, res) => {
    const { errors, normalized } = validateServerInput(req.body, true);
    if (errors.length) return res.status(400).json({ errors });
    try {
      const created = createServerRow(normalized);
      res.status(201).json({ server: created });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  expressApp.put("/api/servers/:id", (req, res) => {
    const { errors, normalized } = validateServerInput(req.body, false);
    if (errors.length) return res.status(400).json({ errors });
    try {
      const updated = updateServerRow(req.params.id, normalized);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json({ server: updated });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  expressApp.delete("/api/servers/:id", (req, res) => {
    try {
      const ok = deleteServerRow(req.params.id);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  expressApp.get("/api/settings", (_req, res) => {
    try {
      res.json({ settings: listSettings() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  expressApp.put("/api/settings", (req, res) => {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid body" });
    }
    try {
      const settings = updateSettings(req.body);
      res.json({ settings });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  expressApp.all(/.*/, (req, res) => {
    return handle(req, res, parse(req.url, true));
  });

  const httpServer = createServer(expressApp);

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    handleSocket(socket, io);
  });

  httpServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Nomad listening on http://localhost:${port}`);
  });
});
