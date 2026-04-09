const conversationList = document.getElementById("conversationList");
const messagesEl = document.getElementById("messages");
const conversationTitle = document.getElementById("conversationTitle");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const logoutBtn = document.getElementById("logoutBtn");
const adminLink = document.getElementById("adminLink");
const sidebarHint = document.getElementById("sidebarHint");

let me = null;
let socket = null;
let activeClientId = null;
let joinedClientRoom = null;

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function renderMessage(message) {
  const div = document.createElement("div");
  const mine =
    message.senderId === me.id &&
    message.senderRole === me.role;
  div.className = `message${mine ? " mine" : ""}`;
  div.innerHTML = `
    <div class="message-meta">${message.senderName} (${message.senderRole}) - ${formatDateTime(
      message.createdAt
    )}</div>
    <div>${message.text}</div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function clearMessages() {
  messagesEl.innerHTML = "";
}

async function loadHistory(clientId) {
  const query = me.role === "admin" ? `?clientId=${clientId}` : "";
  const data = await fetchJson(`/api/chat/messages${query}`);
  clearMessages();
  data.messages.forEach(renderMessage);
}

async function ensureSocket() {
  if (socket) return;
  socket = io({
    withCredentials: true,
  });

  socket.on("connect_error", () => {
    showMessage("Realtime chat unavailable.", "error");
  });

  socket.on("chat-message", (message) => {
    if (message.clientId === activeClientId) {
      renderMessage(message);
    }
  });
}

async function openClientConversation(client) {
  activeClientId = client.id;
  conversationTitle.textContent = `Chat with ${client.fullName}`;
  messageForm.classList.remove("hidden");
  await ensureSocket();
  if (me.role === "admin" && joinedClientRoom !== client.id) {
    socket.emit("join-client-room", client.id);
    joinedClientRoom = client.id;
  }
  await loadHistory(client.id);
}

function renderClientEntry(client) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.className = "room-item";
  button.type = "button";
  button.textContent = `${client.fullName} (${client.email})`;
  button.addEventListener("click", () => {
    openClientConversation(client).catch((error) => {
      showMessage(error.message, "error");
    });
  });
  li.appendChild(button);
  return li;
}

async function loadConversations() {
  conversationList.innerHTML = "";
  if (me.role === "client") {
    sidebarHint.textContent = "You are connected to support.";
    await openClientConversation({
      id: me.id,
      fullName: "Support Team",
      email: "admins",
    });
    return;
  }

  sidebarHint.textContent = "Select a client to start chatting.";
  const data = await fetchJson("/api/admin/clients");
  if (!data.clients.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No clients registered yet.";
    conversationList.appendChild(li);
    return;
  }
  data.clients.forEach((client) => {
    conversationList.appendChild(renderClientEntry(client));
  });
}

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activeClientId || !socket) return;
  socket.emit("chat-message", {
    text,
    clientId: activeClientId,
  });
  messageInput.value = "";
});

logoutBtn.addEventListener("click", async () => {
  await logout();
});

async function init() {
  try {
    const result = await getCurrentUser();
    me = result.user;
    if (me.role === "admin") {
      adminLink.classList.remove("hidden");
    }
    await loadConversations();
  } catch (error) {
    window.location.href = "/";
  }
}

init();
