const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authFeedback = document.getElementById("status");

function setFeedback(message, isError = false) {
  if (!authFeedback) {
    return;
  }
  authFeedback.textContent = message;
  authFeedback.className = `status ${isError ? "error" : "ok"}`;
}

async function handleAuthSuccess() {
  const data = await getCurrentUser();
  const me = data.user;
  if (!me) {
    window.location.href = "/chat.html";
    return;
  }
  if (me.role === "admin") {
    window.location.href = "/admin.html";
    return;
  }
  window.location.href = "/chat.html";
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFeedback("Signing in...");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await fetchJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await handleAuthSuccess();
  } catch (error) {
    setFeedback(error.message, true);
  }
});

registerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFeedback("Creating account...");
  const fullName = document.getElementById("register-fullname").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  try {
    await fetchJson("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ fullName, email, password }),
    });
    await handleAuthSuccess();
  } catch (error) {
    setFeedback(error.message, true);
  }
});
