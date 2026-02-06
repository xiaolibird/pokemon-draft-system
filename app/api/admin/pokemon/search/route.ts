import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db/prisma'
import { verifyToken } from '@/app/lib/auth/jwt'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('admin_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query || query.length < 2) {
      return NextResponse.json([])
    }

    const pokemon = await prisma.pokemon.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { nameCn: { contains: query } },
            ],
          },
          // Filter out non-viable Pokemon (SV Viable only)
          { isNonstandard: null },
        ],
      },
      take: 20,
      orderBy: { num: 'asc' },
    })

    return NextResponse.json(pokemon)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
