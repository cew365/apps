const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-this";

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function authRequired(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  return next();
}

function socketAuth(socket, next) {
  let token = socket.handshake.auth?.token;
  if (!token && socket.handshake.headers?.cookie) {
    const match = socket.handshake.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }
  if (!token) {
    return next(new Error("Unauthorized"));
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload;
    return next();
  } catch (error) {
    return next(new Error("Unauthorized"));
  }
}

module.exports = {
  authRequired,
  adminOnly,
  signToken,
  socketAuth,
};
