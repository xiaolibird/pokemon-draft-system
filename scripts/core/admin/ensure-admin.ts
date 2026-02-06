import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Get credentials from environment variables
  const username = process.env.ADMIN_USERNAME
  const password = process.env.ADMIN_PASSWORD

  // If no credentials provided, do nothing (or fallback to create-admin behavior if you prefer,
  // but for "ensure-admin" we specifically want to enforce state if provided)
  if (!username || !password) {
    console.log(
      'No ADMIN_USERNAME or ADMIN_PASSWORD provided. Skipping admin upsert.',
    )
    return
  }

  try {
    console.log(
      `Ensuring admin user "${username}" exists and has correct credentials...`,
    )

    const passwordHash = await bcrypt.hash(password, 10)

    const admin = await prisma.admin.upsert({
      where: { username },
      update: {
        passwordHash,
      },
      create: {
        username,
        passwordHash,
      },
    })

    console.log('✅ Admin user synced successfully.')
  } catch (error) {
    console.error('Error ensuring admin:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
