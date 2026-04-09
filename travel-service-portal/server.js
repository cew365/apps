const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "portal.sqlite");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('client', 'agent', 'admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'halted', 'suspended')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, agent_id),
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
  );
`);

const adminCount = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get().total;
if (adminCount === 0) {
  const defaultAdminPassword = bcrypt.hashSync("admin123", 10);
  db.prepare(
    "INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, 'admin', 'active')"
  ).run("admin", defaultAdminPassword);
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "travel-service-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);
app.use(express.static(path.join(__dirname, "public")));

const getUserById = db.prepare("SELECT id, username, role, status, created_at FROM users WHERE id = ?");
const getUserByUsername = db.prepare("SELECT * FROM users WHERE username = ?");

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    created_at: user.created_at
  };
}

function isAllowedRole(role) {
  return ["client", "agent", "admin"].includes(role);
}

function isAllowedStatus(status) {
  return ["active", "halted", "suspended"].includes(status);
}

function requireAuth(req, res, next) {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: "You must be logged in." });
  }

  const user = getUserById.get(userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Session is invalid." });
  }

  if (user.status !== "active") {
    req.session.destroy(() => {});
    return res.status(403).json({ error: "Your account is not active." });
  }

  req.user = user;
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You are not authorized to do this." });
    }
    return next();
  };
}

function getConversationForUser(conversationId, user) {
  const conversation = db
    .prepare(
      `
      SELECT
        c.id,
        c.client_id,
        c.agent_id,
        c.created_at,
        client.username AS client_name,
        agent.username AS agent_name
      FROM conversations c
      JOIN users client ON client.id = c.client_id
      JOIN users agent ON agent.id = c.agent_id
      WHERE c.id = ?
      `
    )
    .get(conversationId);

  if (!conversation) {
    return null;
  }

  if (user.role === "admin") {
    return conversation;
  }
  if (user.role === "client" && conversation.client_id === user.id) {
    return conversation;
  }
  if (user.role === "agent" && conversation.agent_id === user.id) {
    return conversation;
  }
  return null;
}

app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }

  const user = getUserById.get(req.session.userId);
  if (!user || user.status !== "active") {
    req.session.destroy(() => {});
    return res.json({ authenticated: false });
  }

  return res.json({ authenticated: true, user: sanitizeUser(user) });
});

app.post("/api/register", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "").trim();

  if (username.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  if (!["client", "agent"].includes(role)) {
    return res.status(400).json({ error: "You can only register as client or agent." });
  }

  const existing = getUserByUsername.get(username);
  if (existing) {
    return res.status(409).json({ error: "Username already exists." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const insert = db.prepare(
    "INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, 'active')"
  );
  const result = insert.run(username, passwordHash, role);
  const user = getUserById.get(result.lastInsertRowid);

  return res.status(201).json({ message: "Registration successful.", user: sanitizeUser(user) });
});

app.post("/api/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = getUserByUsername.get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  if (user.status !== "active") {
    return res.status(403).json({ error: `Account is ${user.status}. Contact admin.` });
  }

  req.session.userId = user.id;
  return res.json({ message: "Logged in successfully.", user: sanitizeUser(user) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out." });
  });
});

app.get("/api/agents", requireAuth, (req, res) => {
  const agents = db
    .prepare("SELECT id, username FROM users WHERE role = 'agent' AND status = 'active' ORDER BY username ASC")
    .all();
  return res.json({ agents });
});

app.get("/api/conversations", requireAuth, (req, res) => {
  let query = `
    SELECT
      c.id,
      c.client_id,
      c.agent_id,
      c.created_at,
      client.username AS client_name,
      agent.username AS agent_name,
      (
        SELECT m.content
        FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.id DESC
        LIMIT 1
      ) AS last_message,
      (
        SELECT m.created_at
        FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.id DESC
        LIMIT 1
      ) AS last_message_at
    FROM conversations c
    JOIN users client ON client.id = c.client_id
    JOIN users agent ON agent.id = c.agent_id
  `;

  const params = [];
  if (req.user.role === "client") {
    query += " WHERE c.client_id = ? ";
    params.push(req.user.id);
  } else if (req.user.role === "agent") {
    query += " WHERE c.agent_id = ? ";
    params.push(req.user.id);
  }

  query += " ORDER BY COALESCE(last_message_at, c.created_at) DESC ";
  const conversations = db.prepare(query).all(...params);

  return res.json({ conversations });
});

app.post("/api/conversations", requireAuth, requireRole("client"), (req, res) => {
  const agentId = Number(req.body.agentId);
  const initialMessage = String(req.body.initialMessage || "").trim();

  if (!Number.isInteger(agentId)) {
    return res.status(400).json({ error: "Valid agentId is required." });
  }

  const agent = db.prepare("SELECT id, role, status FROM users WHERE id = ?").get(agentId);
  if (!agent || agent.role !== "agent" || agent.status !== "active") {
    return res.status(400).json({ error: "Selected agent is not available." });
  }

  const transaction = db.transaction(() => {
    let conversation = db
      .prepare("SELECT id FROM conversations WHERE client_id = ? AND agent_id = ?")
      .get(req.user.id, agentId);

    if (!conversation) {
      const createResult = db
        .prepare("INSERT INTO conversations (client_id, agent_id) VALUES (?, ?)")
        .run(req.user.id, agentId);
      conversation = { id: createResult.lastInsertRowid };
    }

    if (initialMessage) {
      db.prepare("INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)").run(
        conversation.id,
        req.user.id,
        initialMessage
      );
    }

    return conversation.id;
  });

  const conversationId = transaction();
  return res.status(201).json({ message: "Conversation ready.", conversationId });
});

app.get("/api/conversations/:id/messages", requireAuth, (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isInteger(conversationId)) {
    return res.status(400).json({ error: "Invalid conversation id." });
  }

  const conversation = getConversationForUser(conversationId, req.user);
  if (!conversation) {
    return res.status(403).json({ error: "You cannot access this conversation." });
  }

  const messages = db
    .prepare(
      `
      SELECT
        m.id,
        m.content,
        m.created_at,
        m.sender_id,
        sender.username AS sender_name,
        sender.role AS sender_role
      FROM messages m
      LEFT JOIN users sender ON sender.id = m.sender_id
      WHERE m.conversation_id = ?
      ORDER BY m.id ASC
      `
    )
    .all(conversationId);

  return res.json({ conversation, messages });
});

app.post("/api/conversations/:id/messages", requireAuth, (req, res) => {
  const conversationId = Number(req.params.id);
  const content = String(req.body.content || "").trim();

  if (!Number.isInteger(conversationId)) {
    return res.status(400).json({ error: "Invalid conversation id." });
  }
  if (!content || content.length > 2000) {
    return res.status(400).json({ error: "Message must be 1-2000 characters." });
  }

  const conversation = getConversationForUser(conversationId, req.user);
  if (!conversation) {
    return res.status(403).json({ error: "You cannot send messages here." });
  }

  const result = db
    .prepare("INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)")
    .run(conversationId, req.user.id, content);

  const inserted = db
    .prepare(
      `
      SELECT
        m.id,
        m.content,
        m.created_at,
        m.sender_id,
        sender.username AS sender_name,
        sender.role AS sender_role
      FROM messages m
      JOIN users sender ON sender.id = m.sender_id
      WHERE m.id = ?
      `
    )
    .get(result.lastInsertRowid);

  return res.status(201).json({ message: "Message sent.", data: inserted });
});

app.get("/api/admin/users", requireAuth, requireRole("admin"), (req, res) => {
  const users = db
    .prepare("SELECT id, username, role, status, created_at FROM users ORDER BY created_at DESC")
    .all();
  return res.json({ users });
});

app.post("/api/admin/users", requireAuth, requireRole("admin"), (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "").trim();
  const status = String(req.body.status || "active").trim();

  if (username.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  if (!isAllowedRole(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }
  if (!isAllowedStatus(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }

  if (getUserByUsername.get(username)) {
    return res.status(409).json({ error: "Username already exists." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare("INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, ?)")
    .run(username, passwordHash, role, status);
  const user = getUserById.get(result.lastInsertRowid);

  return res.status(201).json({ message: "User created.", user: sanitizeUser(user) });
});

app.patch("/api/admin/users/:id/status", requireAuth, requireRole("admin"), (req, res) => {
  const userId = Number(req.params.id);
  const status = String(req.body.status || "").trim();

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  if (!isAllowedStatus(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  if (req.user.id === userId && status !== "active") {
    return res.status(400).json({ error: "Admin cannot deactivate themselves." });
  }

  const target = getUserById.get(userId);
  if (!target) {
    return res.status(404).json({ error: "User not found." });
  }

  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, userId);
  const updated = getUserById.get(userId);
  return res.json({ message: "Status updated.", user: sanitizeUser(updated) });
});

app.delete("/api/admin/users/:id", requireAuth, requireRole("admin"), (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  if (req.user.id === userId) {
    return res.status(400).json({ error: "Admin cannot delete themselves." });
  }

  const target = getUserById.get(userId);
  if (!target) {
    return res.status(404).json({ error: "User not found." });
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return res.json({ message: "User deleted." });
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Travel Service Portal is running on http://localhost:${PORT}`);
});
