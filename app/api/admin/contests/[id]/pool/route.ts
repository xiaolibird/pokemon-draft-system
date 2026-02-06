import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db/prisma'

export async function GET(_request: Request, context: any) {
  const { id } = await context.params

  try {
    const pool = await prisma.pokemonPool.findMany({
      where: { contestId: id },
      include: { pokemon: true },
      orderBy: { pokemon: { num: 'asc' } },
    })

    return NextResponse.json(pool)
  } catch {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: any) {
  const { id } = await context.params
  const { searchParams } = new URL(request.url)
  const poolId = searchParams.get('poolId')

  if (!poolId) {
    return NextResponse.json({ error: 'Missing poolId' }, { status: 400 })
  }

  try {
    const { verifyToken } = await import('@/app/lib/auth/jwt')
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const token = cookieStore.get('admin_token')?.value

    if (!token)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contest = await prisma.contest.findUnique({
      where: { id },
      select: { status: true, priceTiers: true },
    })
    if (!contest)
      return NextResponse.json({ error: '比赛未找到' }, { status: 404 })
    if (contest.status !== 'PENDING') {
      return NextResponse.json(
        { error: '比赛已开始，不可删除宝可梦' },
        { status: 403 },
      )
    }

    const poolItem = await prisma.pokemonPool.findFirst({
      where: { id: poolId, contestId: id },
      select: { pokemonId: true },
    })
    if (!poolItem)
      return NextResponse.json({ error: '池中未找到该宝可梦' }, { status: 404 })

    await prisma.pokemonPool.delete({
      where: {
        id: poolId,
        contestId: id,
      },
    })

    // 从 priceTiers 中移除该 pokemonId，使分级页与池子一致
    const rawTiers = contest.priceTiers as any
    if (
      rawTiers &&
      (Array.isArray(rawTiers)
        ? rawTiers.length > 0
        : rawTiers.tiers?.length > 0)
    ) {
      const tiers = Array.isArray(rawTiers) ? rawTiers : rawTiers.tiers
      const pokemonId = poolItem.pokemonId
      const newTiers = tiers.map((t: any) => ({
        ...t,
        pokemonIds: Array.isArray(t.pokemonIds)
          ? t.pokemonIds.filter((pid: string) => pid !== pokemonId)
          : [],
      }))
      const newPriceTiers = Array.isArray(rawTiers)
        ? newTiers
        : { ...rawTiers, tiers: newTiers }
      await prisma.contest.update({
        where: { id },
        data: { priceTiers: newPriceTiers as any },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}

export async function POST(request: Request, context: any) {
  const { id } = await context.params

  try {
    const { verifyToken } = await import('@/app/lib/auth/jwt')
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const token = cookieStore.get('admin_token')?.value

    if (!token)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { pokemonId } = body

    if (!pokemonId) {
      return NextResponse.json({ error: 'Missing pokemonId' }, { status: 400 })
    }

    const contest = await prisma.contest.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!contest)
      return NextResponse.json({ error: '比赛未找到' }, { status: 404 })
    if (contest.status !== 'PENDING') {
      return NextResponse.json(
        { error: '比赛已开始，不可再添加宝可梦' },
        { status: 403 },
      )
    }

    // Check if already in pool
    const existing = await prisma.pokemonPool.findFirst({
      where: {
        contestId: id,
        pokemonId: pokemonId,
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Pokemon already in pool' },
        { status: 400 },
      )
    }

    const newPoolItem = await prisma.pokemonPool.create({
      data: {
        contestId: id,
        pokemonId: pokemonId,
        status: 'AVAILABLE',
      },
      include: {
        pokemon: true,
      },
    })

    return NextResponse.json(newPoolItem)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Add failed' }, { status: 500 })
  }
}
