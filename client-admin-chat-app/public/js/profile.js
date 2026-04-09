const form = document.getElementById("profileForm");
const email = document.getElementById("email");
const fullName = document.getElementById("fullName");
const company = document.getElementById("company");
const bio = document.getElementById("bio");
const statusMessage = document.getElementById("statusMessage");
const adminLink = document.getElementById("adminLink");
const logoutBtn = document.getElementById("logoutBtn");

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = isError ? "error" : "muted";
}

async function loadProfile() {
  try {
    const me = await fetchJson("/api/me");
    const user = me.user;
    email.value = user.email || "";
    fullName.value = user.fullName || "";
    company.value = user.company || "";
    bio.value = user.bio || "";
    adminLink.classList.toggle("hidden", user.role !== "admin");
  } catch (error) {
    setStatus(error.message || "Unable to load profile.", true);
    window.location.href = "/";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving profile...");
  try {
    await fetchJson("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        fullName: fullName.value.trim(),
        company: company.value.trim(),
        bio: bio.value.trim(),
      }),
    });
    setStatus("Profile updated.");
  } catch (error) {
    setStatus(error.message || "Failed to update profile.", true);
  }
});

logoutBtn.addEventListener("click", async () => {
  await logout();
});

loadProfile();
