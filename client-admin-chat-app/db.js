const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "app.db");
fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(dbPath);

function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function get(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function initDb() {
  await run("PRAGMA foreign_keys = ON");

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('client', 'admin')),
      full_name TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'admin')),
      message_text TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

async function createUser({
  email,
  passwordHash,
  role,
  fullName,
  bio = "",
  company = "",
}) {
  const result = await run(
    `INSERT INTO users (email, password_hash, role, full_name, bio, company)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [email.toLowerCase(), passwordHash, role, fullName, bio, company],
  );
  return getUserById(result.lastID);
}

function getUserByEmail(email) {
  return get("SELECT * FROM users WHERE email = ?", [String(email).toLowerCase()]);
}

function getUserById(id) {
  return get("SELECT * FROM users WHERE id = ?", [id]);
}

async function updateUserProfile(id, { fullName, bio, company }) {
  await run(
    `UPDATE users
     SET full_name = ?, bio = ?, company = ?
     WHERE id = ?`,
    [fullName, bio || "", company || "", id],
  );
  return getUserById(id);
}

function listClients() {
  return all(
    `SELECT id, email, full_name, bio, company, created_at
     FROM users
     WHERE role = 'client'
     ORDER BY created_at DESC`,
  );
}

function listMessagesForClient(clientId) {
  return all(
    `SELECT
       m.id,
       m.client_id AS clientId,
       m.sender_id AS senderId,
       m.sender_role AS senderRole,
       u.full_name AS senderName,
       m.message_text AS text,
       m.created_at AS createdAt
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.client_id = ?
     ORDER BY m.id ASC`,
    [clientId],
  );
}

async function saveMessage({ clientId, senderId, senderRole, messageText }) {
  const result = await run(
    `INSERT INTO messages (client_id, sender_id, sender_role, message_text)
     VALUES (?, ?, ?, ?)`,
    [clientId, senderId, senderRole, messageText],
  );
  return get(
    `SELECT
       m.id,
       m.client_id AS clientId,
       m.sender_id AS senderId,
       m.sender_role AS senderRole,
       u.full_name AS senderName,
       m.message_text AS text,
       m.created_at AS createdAt
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.id = ?`,
    [result.lastID],
  );
}

function closeDb() {
  db.close();
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
  createUser,
  getUserByEmail,
  getUserById,
  updateUserProfile,
  listClients,
  listMessagesForClient,
  saveMessage,
  closeDb,
};
