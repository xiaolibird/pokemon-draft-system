import { prisma } from '../db/prisma'

export async function updatePlayerActivity(playerId: string) {
  try {
    await prisma.player.update({
      where: { id: playerId },
      data: { lastSeenAt: new Date() },
    })
  } catch (error) {
    console.error(`Failed to update activity for player ${playerId}:`, error)
  }
}
