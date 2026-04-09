require("dotenv").config();
const bcrypt = require("bcryptjs");
const {
  initDb,
  getUserByEmail,
  createUser,
  updateUserProfile,
  closeDb,
} = require("../db");

async function main() {
  await initDb();

  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "Admin@123";
  const fullName = process.env.ADMIN_NAME || "Platform Admin";
  const company = process.env.ADMIN_COMPANY || "Support Team";
  const bio = process.env.ADMIN_BIO || "Default administrator account";

  const existing = await getUserByEmail(email);
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await createUser({
      email,
      passwordHash,
      role: "admin",
      fullName,
      bio,
      company,
    });
    console.log(`Created admin user ${email}`);
  } else {
    await updateUserProfile(existing.id, { fullName, bio, company });
    console.log(`Updated admin profile for ${email}`);
  }
}

main()
  .catch((error) => {
    console.error("Failed to seed admin:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDb();
  });
