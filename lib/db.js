const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3-multiple-ciphers");

const PROD_DATA_DIR = "/app/data";
const DEV_DATA_DIR = path.join(process.cwd(), "data");

const isProd = process.env.NODE_ENV === "production";
const dataDir = process.env.NOMAD_DATA_DIR || (isProd ? PROD_DATA_DIR : DEV_DATA_DIR);
const dbPath = path.join(dataDir, "nomad.db");
const keyPath = path.join(dataDir, ".nomad-key");

let dbInstance = null;
let encryptionKey = null;

const DEFAULT_SETTINGS = {
  default_session_name: "nomad",
  auto_attach_single: "true",
  haptics_enabled: "true",
  theme: "system",
  terminal_font_size: "13",
  terminal_font_family: "JetBrains Mono",
  terminal_cursor_style: "block",
  terminal_cursor_blink: "true",
  terminal_scrollback: "5000",
  terminal_theme: "nomad",
  confirm_kill_session: "true",
  confirm_kill_window: "true",
  confirm_delete_server: "true",
  confirm_detach: "true",
};

const SERVERS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT NOT NULL,
    credential TEXT NOT NULL,
    last_connected INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

const SETTINGS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getDbSecret() {
  if (process.env.NOMAD_SECRET) {
    return process.env.NOMAD_SECRET;
  }
  ensureDir(dataDir);
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, "utf8").trim();
  }
  const generated = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(keyPath, generated, { mode: 0o600 });
  return generated;
}

function getEncryptionKey() {
  if (encryptionKey) return encryptionKey;
  const secret = getDbSecret();
  encryptionKey = crypto.createHash("sha256").update(String(secret)).digest();
  return encryptionKey;
}

function initDB() {
  if (dbInstance) return dbInstance;
  ensureDir(dataDir);
  const secret = getDbSecret();

  const conn = new Database(dbPath);
  conn.pragma(`key='${secret.replace(/'/g, "''")}'`);
  conn.pragma("journal_mode = WAL");

  conn.prepare(SERVERS_SCHEMA).run();
  conn.prepare(SETTINGS_SCHEMA).run();

  const insertSetting = conn.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  const tx = conn.transaction(() => {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      insertSetting.run(k, v);
    }
  });
  tx();

  dbInstance = conn;
  return conn;
}

function getDB() {
  return initDB();
}

function encryptCredential(plaintext) {
  if (plaintext == null) {
    throw new Error("Credential required");
  }
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

function decryptCredential(encoded) {
  if (!encoded) throw new Error("No credential to decrypt");
  const key = getEncryptionKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

function sanitizeServer(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    auth_type: row.auth_type,
    last_connected: row.last_connected,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function listServers() {
  const rows = getDB().prepare("SELECT * FROM servers ORDER BY name COLLATE NOCASE").all();
  return rows.map(sanitizeServer);
}

function getServer(id) {
  const row = getDB().prepare("SELECT * FROM servers WHERE id = ?").get(id);
  return sanitizeServer(row);
}

function getServerWithCredential(id) {
  return getDB().prepare("SELECT * FROM servers WHERE id = ?").get(id);
}

function createServer(input) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const port = Number(input.port) || 22;
  const credential = encryptCredential(input.credential);
  getDB()
    .prepare(
      `INSERT INTO servers (id, name, host, port, username, auth_type, credential, last_connected, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(
      id,
      String(input.name),
      String(input.host),
      port,
      String(input.username),
      String(input.auth_type),
      credential,
      now,
      now
    );
  return getServer(id);
}

function updateServer(id, input) {
  const existing = getServerWithCredential(id);
  if (!existing) return null;
  const port = Number(input.port) || existing.port || 22;
  const credential =
    input.credential && String(input.credential).length > 0
      ? encryptCredential(input.credential)
      : existing.credential;
  const authType = input.auth_type || existing.auth_type;
  const name = input.name ?? existing.name;
  const host = input.host ?? existing.host;
  const username = input.username ?? existing.username;
  const now = Date.now();
  getDB()
    .prepare(
      `UPDATE servers
       SET name = ?, host = ?, port = ?, username = ?, auth_type = ?, credential = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(String(name), String(host), port, String(username), String(authType), credential, now, id);
  return getServer(id);
}

function deleteServer(id) {
  const result = getDB().prepare("DELETE FROM servers WHERE id = ?").run(id);
  return result.changes > 0;
}

function markServerConnected(id) {
  getDB().prepare("UPDATE servers SET last_connected = ? WHERE id = ?").run(Date.now(), id);
}

function listSettings() {
  const rows = getDB().prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

function updateSettings(patch) {
  const stmt = getDB().prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const tx = getDB().transaction((entries) => {
    for (const [k, v] of entries) {
      stmt.run(String(k), String(v));
    }
  });
  tx(Object.entries(patch));
  return listSettings();
}

function getSetting(key) {
  const row = getDB().prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

module.exports = {
  initDB,
  getDB,
  listServers,
  getServer,
  getServerWithCredential,
  createServer,
  updateServer,
  deleteServer,
  markServerConnected,
  listSettings,
  updateSettings,
  getSetting,
  encryptCredential,
  decryptCredential,
};
