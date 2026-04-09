async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "include",
    ...options,
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : {};
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function showMessage(message, type = "ok") {
  const node = document.getElementById("status");
  if (!node) return;
  node.className = `status ${type}`;
  node.textContent = message;
}

async function getCurrentUser() {
  return fetchJson("/api/me");
}

function redirectForRole(role) {
  if (role === "admin") {
    window.location.href = "/admin.html";
    return;
  }
  window.location.href = "/chat.html";
}

async function logout() {
  await fetchJson("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
}

const apiFetch = fetchJson;

async function requireAuth(requiredRole) {
  const { user } = await getCurrentUser();
  if (!user) {
    window.location.href = "/";
    return null;
  }
  if (requiredRole && user.role !== requiredRole) {
    throw new Error("You are not authorized for this page.");
  }
  return user;
}
