import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { basePrice } = await req.json()
    const { id: contestId } = await params

    if (typeof basePrice !== 'number' || basePrice < 1) {
      return NextResponse.json({ error: '底价必须为正整数' }, { status: 400 })
    }

    // Verify contest exists and is in PENDING status
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
    })

    if (!contest) {
      return NextResponse.json({ error: '比赛不存在' }, { status: 404 })
    }

    if (contest.status !== 'PENDING') {
      return NextResponse.json(
        { error: '只能在比赛开始前调整底价' },
        { status: 400 },
      )
    }

    if (contest.draftMode !== 'AUCTION') {
      return NextResponse.json(
        { error: '只有竞拍模式支持底价设置' },
        { status: 400 },
      )
    }

    // Update base price
    const updated = await prisma.contest.update({
      where: { id: contestId },
      data: { auctionBasePrice: basePrice },
    })

    return NextResponse.json({
      success: true,
      auctionBasePrice: updated.auctionBasePrice,
    })
  } catch {
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
