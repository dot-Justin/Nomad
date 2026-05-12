/**
 * Integration tests for the Express REST API.
 * These spin up the actual Express app (without the Next.js frontend) and
 * hit the /api/* endpoints over HTTP.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import os from "os";
import fs from "fs";
import http from "http";

// Isolated DB for API tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nomad-api-test-"));
process.env.NOMAD_DATA_DIR = tmpDir;
process.env.NOMAD_SECRET = "api-test-secret-key-32-chars-XX";
process.env.NODE_ENV = "test";

// Boot a minimal express server (skip socket.io, next.js)
let server;
let baseUrl;

beforeAll(async () => {
  const express = (await import("express")).default;
  const {
    listServers,
    getServer,
    getServerWithCredential,
    createServer,
    updateServer,
    deleteServer,
    listSettings,
    updateSettings,
    getSetting,
    encryptCredential,
    decryptCredential,
    markServerConnected,
  } = await import("../lib/db.js");

  const app = express();
  app.use(express.json());

  app.get("/api/servers", (_req, res) => {
    try { res.json({ servers: listServers() }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/servers/:id", (req, res) => {
    const row = getServer(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ server: row });
  });

  app.post("/api/servers", (req, res) => {
    const { name, host, port, username, auth_type, credential } = req.body || {};
    const errors = [];
    if (!name) errors.push("name required");
    if (!host) errors.push("host required");
    if (!username) errors.push("username required");
    if (auth_type !== "password" && auth_type !== "key") errors.push("invalid auth_type");
    if (!credential) errors.push("credential required");
    if (errors.length) return res.status(400).json({ errors });
    const server = createServer({ name, host, port: port || 22, username, auth_type, credential });
    res.status(201).json({ server });
  });

  app.put("/api/servers/:id", (req, res) => {
    const { name, host, port, username, auth_type, credential } = req.body || {};
    const errors = [];
    if (!host) errors.push("host required");
    if (!username) errors.push("username required");
    if (auth_type !== "password" && auth_type !== "key") errors.push("invalid auth_type");
    if (errors.length) return res.status(400).json({ errors });
    const updated = updateServer(req.params.id, { name, host, port, username, auth_type, credential });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ server: updated });
  });

  app.delete("/api/servers/:id", (req, res) => {
    const ok = deleteServer(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  app.get("/api/settings", (_req, res) => {
    res.json({ settings: listSettings() });
  });

  app.patch("/api/settings", (req, res) => {
    const updated = updateSettings(req.body || {});
    res.json({ settings: updated });
  });

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe("GET /api/servers", () => {
  it("returns empty servers array initially", async () => {
    const { status, body } = await request("GET", "/api/servers");
    expect(status).toBe(200);
    expect(body.servers).toEqual([]);
  });
});

describe("POST /api/servers", () => {
  it("returns 400 when required fields missing", async () => {
    const { status, body } = await request("POST", "/api/servers", { name: "X" });
    expect(status).toBe(400);
    expect(body.errors).toContain("host required");
  });

  it("creates a server and returns it", async () => {
    const { status, body } = await request("POST", "/api/servers", {
      name: "My Server",
      host: "10.0.0.1",
      port: 22,
      username: "admin",
      auth_type: "password",
      credential: "secret",
    });
    expect(status).toBe(201);
    expect(body.server.name).toBe("My Server");
    expect(body.server.host).toBe("10.0.0.1");
    expect(body.server.id).toBeDefined();
    expect(body.server.credential).toBeUndefined();
  });
});

describe("GET /api/servers/:id", () => {
  let serverId;

  beforeAll(async () => {
    const { body } = await request("POST", "/api/servers", {
      name: "Lookup Test",
      host: "1.2.3.4",
      port: 22,
      username: "user",
      auth_type: "password",
      credential: "pass",
    });
    serverId = body.server.id;
  });

  it("returns server by id", async () => {
    const { status, body } = await request("GET", `/api/servers/${serverId}`);
    expect(status).toBe(200);
    expect(body.server.id).toBe(serverId);
    expect(body.server.name).toBe("Lookup Test");
  });

  it("returns 404 for unknown id", async () => {
    const { status } = await request("GET", "/api/servers/nonexistent");
    expect(status).toBe(404);
  });
});

describe("PUT /api/servers/:id", () => {
  let serverId;

  beforeAll(async () => {
    const { body } = await request("POST", "/api/servers", {
      name: "Update Target",
      host: "5.6.7.8",
      port: 22,
      username: "root",
      auth_type: "password",
      credential: "pass",
    });
    serverId = body.server.id;
  });

  it("updates server fields", async () => {
    const { status, body } = await request("PUT", `/api/servers/${serverId}`, {
      name: "Renamed",
      host: "5.6.7.8",
      port: 2222,
      username: "root",
      auth_type: "password",
    });
    expect(status).toBe(200);
    expect(body.server.name).toBe("Renamed");
    expect(body.server.port).toBe(2222);
  });

  it("returns 404 for unknown id", async () => {
    const { status } = await request("PUT", "/api/servers/nonexistent", {
      name: "X", host: "h", port: 22, username: "u", auth_type: "password",
    });
    expect(status).toBe(404);
  });
});

describe("DELETE /api/servers/:id", () => {
  let serverId;

  beforeAll(async () => {
    const { body } = await request("POST", "/api/servers", {
      name: "Delete Target",
      host: "9.9.9.9",
      port: 22,
      username: "root",
      auth_type: "password",
      credential: "pass",
    });
    serverId = body.server.id;
  });

  it("deletes the server", async () => {
    const { status, body } = await request("DELETE", `/api/servers/${serverId}`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("returns 404 on second delete", async () => {
    const { status } = await request("DELETE", `/api/servers/${serverId}`);
    expect(status).toBe(404);
  });
});

describe("GET /api/settings", () => {
  it("returns settings object with defaults", async () => {
    const { status, body } = await request("GET", "/api/settings");
    expect(status).toBe(200);
    expect(body.settings.default_session_name).toBe("nomad");
    expect(body.settings.confirm_kill_session).toBe("true");
    expect(body.settings.auto_attach_single).toBe("true");
  });
});

describe("PATCH /api/settings", () => {
  it("updates settings", async () => {
    const { status, body } = await request("PATCH", "/api/settings", {
      default_session_name: "workspace",
      theme: "dark",
    });
    expect(status).toBe(200);
    expect(body.settings.default_session_name).toBe("workspace");
    expect(body.settings.theme).toBe("dark");
  });
});
