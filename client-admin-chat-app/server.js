const path = require("path");
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
require("dotenv").config();

const {
  initDb,
  createUser,
  getUserByEmail,
  getUserById,
  updateUserProfile,
  listClients,
  listMessagesForClient,
  saveMessage,
} = require("./db");
const { authRequired, adminOnly, signToken, socketAuth } = require("./middleware/auth");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
    bio: user.bio || "",
    company: user.company || "",
  };
}

function roomForClient(clientId) {
  return `chat-client-${clientId}`;
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await getUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({
      email: normalizedEmail,
      passwordHash,
      role: "client",
      fullName: String(fullName).trim(),
    });
    const token = signToken(user);

    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to register" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = signToken(user);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to login" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  return res.json({ ok: true });
});

app.get("/api/me", authRequired, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({ user: sanitizeUser(user) });
});

app.put("/api/profile", authRequired, async (req, res) => {
  try {
    const { fullName, bio, company } = req.body;
    if (!String(fullName || "").trim()) {
      return res.status(400).json({ error: "Full name is required" });
    }
    const updated = await updateUserProfile(req.user.id, {
      fullName: String(fullName || "").trim(),
      bio: String(bio || "").trim(),
      company: String(company || "").trim(),
    });
    return res.json({ user: sanitizeUser(updated) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

app.get("/api/admin/clients", authRequired, adminOnly, async (req, res) => {
  const clients = await listClients();
  return res.json({
    clients: clients.map((c) => ({
      id: c.id,
      email: c.email,
      fullName: c.full_name,
      bio: c.bio || "",
      company: c.company || "",
    })),
  });
});

app.get("/api/chat/messages", authRequired, async (req, res) => {
  const queryClientId = req.query.clientId ? Number(req.query.clientId) : null;
  let clientId = req.user.id;
  if (req.user.role === "admin" && queryClientId) {
    clientId = queryClientId;
  }
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return res.status(400).json({ error: "Invalid client id" });
  }
  if (req.user.role === "admin" && queryClientId) {
    const target = await getUserById(clientId);
    if (!target || target.role !== "client") {
      return res.status(404).json({ error: "Client not found" });
    }
  }
  const messages = await listMessagesForClient(clientId);
  return res.json({ messages });
});

io.use(socketAuth);

io.on("connection", (socket) => {
  if (socket.user.role === "client") {
    socket.join(roomForClient(socket.user.id));
  }

  socket.on("join-client-room", async (clientIdRaw) => {
    if (socket.user.role !== "admin") {
      return;
    }
    const clientId = Number(clientIdRaw);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return;
    }
    const client = await getUserById(clientId);
    if (!client || client.role !== "client") {
      return;
    }
    socket.join(roomForClient(clientId));
  });

  socket.on("chat-message", async (payload) => {
    const text = String(payload?.text || "").trim();
    if (!text) {
      return;
    }

    let clientId = socket.user.id;
    if (socket.user.role === "admin") {
      clientId = Number(payload?.clientId);
      if (!Number.isInteger(clientId) || clientId <= 0) {
        return;
      }
      const client = await getUserById(clientId);
      if (!client || client.role !== "client") {
        return;
      }
    }

    const message = await saveMessage({
      clientId,
      senderId: socket.user.id,
      senderRole: socket.user.role,
      messageText: text,
    });
    io.to(roomForClient(clientId)).emit("chat-message", message);
  });
});

app.get(/^(?!\/api).*/, (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  await initDb();
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
