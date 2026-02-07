import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error(
      "ADMIN_PASSWORD is required. Set it in .env or: ADMIN_PASSWORD=xxx npx tsx scripts/core/admin/create-admin.ts",
    );
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const existing = await prisma.admin.findUnique({
      where: { username },
    });

    if (existing) {
      console.log(`Admin user "${username}" already exists.`);
      return;
    }

    await prisma.admin.create({
      data: {
        username,
        passwordHash,
      },
    });

    console.log("========================================");
    console.log("✅ Default Admin Created!");
    console.log(`Username: ${username}`);
    console.log("Password: (set by ADMIN_PASSWORD)");
    console.log("Please change this password after login!");
    console.log("========================================");
  } catch (error) {
    console.error("Error creating admin:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
