const state = {
  me: null,
  conversations: [],
  activeConversationId: null,
  users: []
};

const el = {
  authSection: document.getElementById("authSection"),
  dashboardSection: document.getElementById("dashboardSection"),
  registerForm: document.getElementById("registerForm"),
  loginForm: document.getElementById("loginForm"),
  whoami: document.getElementById("whoami"),
  logoutBtn: document.getElementById("logoutBtn"),
  clientComposer: document.getElementById("clientComposer"),
  newConversationForm: document.getElementById("newConversationForm"),
  agentSelect: document.getElementById("agentSelect"),
  initialMessageInput: document.getElementById("initialMessageInput"),
  adminUserManager: document.getElementById("adminUserManager"),
  adminCreateUserForm: document.getElementById("adminCreateUserForm"),
  usersTableBody: document.querySelector("#usersTable tbody"),
  conversationList: document.getElementById("conversationList"),
  chatTitle: document.getElementById("chatTitle"),
  messagesBox: document.getElementById("messagesBox"),
  messageForm: document.getElementById("messageForm"),
  messageInput: document.getElementById("messageInput"),
  toast: document.getElementById("toast")
};

function showToast(message, isError = false) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.remove("hidden");
  el.toast.style.background = isError ? "#b91c1c" : "#166534";
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    el.toast.classList.add("hidden");
  }, 3000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function setAppVisible(isAuthenticated) {
  el.authSection.classList.toggle("hidden", isAuthenticated);
  el.dashboardSection.classList.toggle("hidden", !isAuthenticated);
}

function conversationLabel(conv) {
  if (!state.me) return "";
  if (state.me.role === "client") return `Agent: ${conv.agent_name}`;
  if (state.me.role === "agent") return `Client: ${conv.client_name}`;
  return `${conv.client_name} ↔ ${conv.agent_name}`;
}

function renderConversations() {
  if (!state.conversations.length) {
    el.conversationList.innerHTML = "<li class=\"conversation-item\">No conversations yet.</li>";
    return;
  }

  el.conversationList.innerHTML = state.conversations
    .map((conv) => {
      const activeClass = conv.id === state.activeConversationId ? "active" : "";
      const preview = conv.last_message ? escapeHtml(conv.last_message) : "No messages yet";
      return `
        <li>
          <button type="button" class="conversation-item ${activeClass}" data-conversation-id="${conv.id}">
            <h4>${escapeHtml(conversationLabel(conv))}</h4>
            <p>${escapeHtml(preview)}</p>
            <small>${escapeHtml(formatDate(conv.last_message_at || conv.created_at))}</small>
          </button>
        </li>
      `;
    })
    .join("");
}

function renderMessages(messages) {
  if (!messages.length) {
    el.messagesBox.innerHTML = "<p>No messages in this conversation yet.</p>";
    return;
  }

  el.messagesBox.innerHTML = messages
    .map((message) => {
      const own = message.sender_id === state.me.id ? "self" : "";
      return `
        <div class="message ${own}">
          <div>
            <strong>${escapeHtml(message.sender_name || "Deleted user")}</strong>
            <small>(${escapeHtml(message.sender_role || "unknown")}) - ${escapeHtml(
        formatDate(message.created_at)
      )}</small>
          </div>
          <div>${escapeHtml(message.content)}</div>
        </div>
      `;
    })
    .join("");
  el.messagesBox.scrollTop = el.messagesBox.scrollHeight;
}

async function loadAgentsForClient() {
  if (!state.me || state.me.role !== "client") return;
  const data = await api("/api/agents");
  if (!data.agents.length) {
    el.agentSelect.innerHTML = "<option value=\"\">No active agents available</option>";
    return;
  }
  el.agentSelect.innerHTML = data.agents
    .map((agent) => `<option value="${agent.id}">${escapeHtml(agent.username)}</option>`)
    .join("");
}

async function openConversation(conversationId) {
  state.activeConversationId = conversationId;
  renderConversations();
  const data = await api(`/api/conversations/${conversationId}/messages`);
  el.chatTitle.textContent = conversationLabel(data.conversation);
  renderMessages(data.messages);
}

async function loadConversations(keepSelected = true) {
  const data = await api("/api/conversations");
  state.conversations = data.conversations;

  if (!keepSelected || !state.conversations.some((conv) => conv.id === state.activeConversationId)) {
    state.activeConversationId = state.conversations[0]?.id || null;
  }

  renderConversations();
  if (!state.activeConversationId) {
    el.chatTitle.textContent = "Select a conversation";
    el.messagesBox.innerHTML = "<p>Choose or create a conversation.</p>";
    return;
  }

  await openConversation(state.activeConversationId);
}

function renderUsersTable() {
  if (!state.users.length) {
    el.usersTableBody.innerHTML = "<tr><td colspan=\"5\">No users found.</td></tr>";
    return;
  }

  el.usersTableBody.innerHTML = state.users
    .map((user) => {
      return `
      <tr>
        <td>${user.id}</td>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.role)}</td>
        <td>${escapeHtml(user.status)}</td>
        <td>
          <div class="actions">
            <button type="button" class="secondary" data-user-action="activate" data-user-id="${
              user.id
            }">Activate</button>
            <button type="button" class="warn" data-user-action="halt" data-user-id="${user.id}">Halt</button>
            <button type="button" class="warn" data-user-action="suspend" data-user-id="${
              user.id
            }">Suspend</button>
            <button type="button" class="danger" data-user-action="delete" data-user-id="${
              user.id
            }">Delete</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
}

async function loadUsers() {
  if (!state.me || state.me.role !== "admin") return;
  const data = await api("/api/admin/users");
  state.users = data.users;
  renderUsersTable();
}

async function refreshApp() {
  const meResult = await api("/api/me");
  if (!meResult.authenticated) {
    state.me = null;
    setAppVisible(false);
    return;
  }

  state.me = meResult.user;
  el.whoami.innerHTML = `Logged in as <strong>${escapeHtml(state.me.username)}</strong> (${escapeHtml(
    state.me.role
  )})`;
  setAppVisible(true);

  const isClient = state.me.role === "client";
  const isAdmin = state.me.role === "admin";
  el.clientComposer.classList.toggle("hidden", !isClient);
  el.adminUserManager.classList.toggle("hidden", !isAdmin);

  if (isClient) {
    await loadAgentsForClient();
  }
  await loadConversations();
  if (isAdmin) {
    await loadUsers();
  }
}

el.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    username: el.registerForm.username.value.trim(),
    password: el.registerForm.password.value,
    role: el.registerForm.role.value
  };

  try {
    await api("/api/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    el.registerForm.reset();
    showToast("Registration successful. Please login.");
  } catch (error) {
    showToast(error.message, true);
  }
});

el.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    username: el.loginForm.username.value.trim(),
    password: el.loginForm.password.value
  };

  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    el.loginForm.reset();
    await refreshApp();
  } catch (error) {
    showToast(error.message, true);
  }
});

el.logoutBtn.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
  } finally {
    state.me = null;
    state.conversations = [];
    state.users = [];
    state.activeConversationId = null;
    setAppVisible(false);
  }
});

el.newConversationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        agentId: Number(el.agentSelect.value),
        initialMessage: el.initialMessageInput.value.trim()
      })
    });
    el.initialMessageInput.value = "";
    await loadConversations(false);
    showToast("Conversation started.");
  } catch (error) {
    showToast(error.message, true);
  }
});

el.conversationList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-conversation-id]");
  if (!button) return;
  const conversationId = Number(button.getAttribute("data-conversation-id"));
  if (!Number.isInteger(conversationId)) return;
  try {
    await openConversation(conversationId);
  } catch (error) {
    showToast(error.message, true);
  }
});

el.messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.activeConversationId) return;
  const content = el.messageInput.value.trim();
  if (!content) return;

  try {
    await api(`/api/conversations/${state.activeConversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content })
    });
    el.messageInput.value = "";
    await loadConversations(true);
  } catch (error) {
    showToast(error.message, true);
  }
});

el.adminCreateUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    username: el.adminCreateUserForm.username.value.trim(),
    password: el.adminCreateUserForm.password.value,
    role: el.adminCreateUserForm.role.value,
    status: el.adminCreateUserForm.status.value
  };

  try {
    await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    el.adminCreateUserForm.reset();
    await loadUsers();
    showToast("User created.");
  } catch (error) {
    showToast(error.message, true);
  }
});

el.usersTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-action]");
  if (!button) return;
  const action = button.getAttribute("data-user-action");
  const userId = Number(button.getAttribute("data-user-id"));
  if (!Number.isInteger(userId)) return;

  try {
    if (action === "delete") {
      if (!window.confirm("Delete this user? Their conversations and messages will also be removed.")) {
        return;
      }
      await api(`/api/admin/users/${userId}`, { method: "DELETE" });
      showToast("User deleted.");
    } else {
      const statusMap = {
        activate: "active",
        halt: "halted",
        suspend: "suspended"
      };
      const status = statusMap[action];
      if (!status) return;
      await api(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      showToast(`User ${status}.`);
    }
    await loadUsers();
    await loadConversations(true);
  } catch (error) {
    showToast(error.message, true);
  }
});

setInterval(async () => {
  if (!state.me) return;
  try {
    await loadConversations(true);
    if (state.me.role === "admin") {
      await loadUsers();
    }
  } catch (_error) {
    // Ignore transient polling failures.
  }
}, 8000);

refreshApp().catch((error) => showToast(error.message, true));
