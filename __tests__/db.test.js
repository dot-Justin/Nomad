import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";
import fs from "fs";

// Use a temp directory so tests don't touch the real DB
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nomad-test-"));
process.env.NOMAD_DATA_DIR = tmpDir;
process.env.NOMAD_SECRET = "test-secret-key-32-chars-longXXX";

const {
  getSetting,
  updateSettings,
  listSettings,
  listServers,
  createServer,
  updateServer,
  deleteServer,
  getServerWithCredential,
} = await import("../lib/db.js");

describe("getSetting", () => {
  it("returns default value for known key", () => {
    expect(getSetting("default_session_name")).toBe("nomad");
    expect(getSetting("auto_attach_single")).toBe("true");
    expect(getSetting("confirm_kill_session")).toBe("true");
  });

  it("returns null for unknown key", () => {
    expect(getSetting("nonexistent_key")).toBeNull();
  });
});

describe("updateSettings / getSetting round-trip", () => {
  it("persists setting value", () => {
    updateSettings({ default_session_name: "myteam" });
    expect(getSetting("default_session_name")).toBe("myteam");
  });

  it("updates existing setting", () => {
    updateSettings({ theme: "dark" });
    updateSettings({ theme: "light" });
    expect(getSetting("theme")).toBe("light");
  });

  it("listSettings returns all keys", () => {
    const settings = listSettings();
    expect(typeof settings).toBe("object");
    expect(settings.default_session_name).toBeDefined();
  });

  it("can update multiple settings at once", () => {
    updateSettings({ terminal_font_size: "16", terminal_cursor_blink: "false" });
    expect(getSetting("terminal_font_size")).toBe("16");
    expect(getSetting("terminal_cursor_blink")).toBe("false");
  });
});

describe("server CRUD", () => {
  let server;

  it("createServer returns server object with id", () => {
    server = createServer({
      name: "Test Server",
      host: "192.168.1.1",
      port: 22,
      username: "admin",
      auth_type: "password",
      credential: "secret",
    });
    expect(server).toBeDefined();
    expect(typeof server.id).toBe("string");
    expect(server.id.length).toBeGreaterThan(0);
    expect(server.name).toBe("Test Server");
    expect(server.host).toBe("192.168.1.1");
    expect(server.username).toBe("admin");
  });

  it("credential is not exposed in sanitized server", () => {
    expect(server.credential).toBeUndefined();
  });

  it("lists the created server", () => {
    const servers = listServers();
    const found = servers.find((s) => s.id === server.id);
    expect(found).toBeDefined();
    expect(found.name).toBe("Test Server");
    expect(found.host).toBe("192.168.1.1");
    expect(found.credential).toBeUndefined();
  });

  it("getServerWithCredential returns row with encrypted credential", () => {
    const row = getServerWithCredential(server.id);
    expect(row).toBeDefined();
    expect(row.id).toBe(server.id);
    expect(typeof row.credential).toBe("string");
    expect(row.credential.length).toBeGreaterThan(0);
  });

  it("getServerWithCredential returns undefined for nonexistent id", () => {
    const row = getServerWithCredential("nonexistent-id");
    expect(row).toBeUndefined();
  });

  it("updateServer returns updated server object", () => {
    const updated = updateServer(server.id, { name: "Renamed Server", port: 2222 });
    expect(updated).toBeDefined();
    expect(updated.name).toBe("Renamed Server");
    expect(updated.port).toBe(2222);
  });

  it("updateServer returns null for nonexistent server", () => {
    const result = updateServer("nonexistent-id", { name: "X" });
    expect(result).toBeNull();
  });

  it("deleteServer returns true", () => {
    const ok = deleteServer(server.id);
    expect(ok).toBe(true);
  });

  it("deleted server no longer in list", () => {
    const servers = listServers();
    expect(servers.find((s) => s.id === server.id)).toBeUndefined();
  });

  it("deleteServer returns false for nonexistent server", () => {
    const ok = deleteServer("nonexistent-id");
    expect(ok).toBe(false);
  });
});
