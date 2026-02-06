import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db/prisma'
import { verifyToken } from '@/app/lib/auth/jwt'
import { cookies } from 'next/headers'

export async function GET(request: Request, context: any) {
  const { id } = await context.params

  try {
    const cookieStore = await cookies()
    const adminToken = cookieStore.get('admin_token')?.value
    const playerToken = cookieStore.get('player_token')?.value

    if (!adminToken && !playerToken) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const actions = await prisma.draftAction.findMany({
      where: { contestId: id },
      include: {
        player: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 100, // Limit to last 100 actions
    })

    // Manual join for Pokemon details since we don't have a direct relation to avoid cyclic dependencies or migration overhead
    const pokemonIds = actions
      .map((a) => a.pokemonId)
      .filter((id): id is string => id !== null)

    const pokemonMap = new Map()
    if (pokemonIds.length > 0) {
      const pokemons = await prisma.pokemon.findMany({
        where: { id: { in: pokemonIds } },
        select: { id: true, num: true, name: true, nameCn: true },
      })
      pokemons.forEach((p) => pokemonMap.set(p.id, p))
    }

    const enrichedActions = actions.map((action) => ({
      ...action,
      pokemon: action.pokemonId ? pokemonMap.get(action.pokemonId) : null,
    }))

    return NextResponse.json(enrichedActions)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
