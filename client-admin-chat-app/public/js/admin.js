async function loadClients() {
  const state = document.getElementById("clients-state");
  const list = document.getElementById("clients-list");
  state.textContent = "Loading clients...";
  list.innerHTML = "";
  try {
    const { clients } = await apiFetch("/api/admin/clients");
    if (!clients.length) {
      state.textContent = "No clients registered yet.";
      return;
    }
    state.textContent = "Select a client to chat from the chat page.";
    clients.forEach((client) => {
      const li = document.createElement("li");
      li.className = "client-item";
      li.innerHTML = `
        <strong>${client.fullName}</strong>
        <div>${client.email}</div>
        <div>${client.company ? `Company: ${client.company}` : "No company"}</div>
      `;
      list.appendChild(li);
    });
  } catch (error) {
    state.textContent = error.message;
  }
}

async function initAdmin() {
  try {
    const user = await requireAuth("admin");
    const badge = document.getElementById("meBadge");
    if (badge) {
      badge.textContent = `${user.fullName} (admin)`;
    }
    loadClients();
  } catch (error) {
    const state = document.getElementById("clients-state");
    if (state) {
      state.textContent = error.message;
    }
  }
}

const refreshBtn = document.getElementById("refresh-btn");
const logoutBtn = document.getElementById("logout-btn");
if (refreshBtn) {
  refreshBtn.addEventListener("click", loadClients);
}
if (logoutBtn) {
  logoutBtn.addEventListener("click", logout);
}

initAdmin();
