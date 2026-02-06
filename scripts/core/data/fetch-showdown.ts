import * as fs from 'fs'
import * as path from 'path'

/**
 * Stage 1: 拉取 Showdown 原始数据（事实源）
 *
 * 功能：
 * - 拉取 rulesets.ts（图鉴列表）
 * - 拉取 pokedex.ts（宝可梦数据）
 * - 拉取 formats-data.ts（合法性数据）
 * - 保存快照到 showdown-snapshot.json
 *
 * 输出：
 * - app/lib/data/showdown-snapshot.json（包含所有原始数据）
 */

const SHOWDOWN_URL_RULESETS =
  'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/rulesets.ts'
const SHOWDOWN_URL_POKEDEX =
  'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts'
const SHOWDOWN_URL_FORMATS =
  'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/formats-data.ts'

const SNAPSHOT_PATH = path.join(
  process.cwd(),
  'app/lib/data/showdown-snapshot.json',
)

interface ShowdownSnapshot {
  rulesets: {
    content: string
    fetchedAt: string
    url: string
  }
  pokedex: {
    content: string
    fetchedAt: string
    url: string
  }
  formats: {
    content: string
    fetchedAt: string
    url: string
  }
  updatedAt: string
}

async function fetchShowdown() {
  try {
    console.log('📥 Stage 1: 拉取 Showdown 原始数据...\n')

    // 1. 拉取 rulesets.ts
    console.log(`[1/3] Fetching rulesets.ts from ${SHOWDOWN_URL_RULESETS}...`)
    const rulesetsResponse = await fetch(SHOWDOWN_URL_RULESETS)
    if (!rulesetsResponse.ok) {
      throw new Error(
        `Failed to fetch rulesets.ts: ${rulesetsResponse.statusText}`,
      )
    }
    const rulesetsContent = await rulesetsResponse.text()
    console.log(`  ✓ Fetched rulesets.ts: ${rulesetsContent.length} bytes`)

    // 2. 拉取 pokedex.ts
    console.log(`[2/3] Fetching pokedex.ts from ${SHOWDOWN_URL_POKEDEX}...`)
    const pokedexResponse = await fetch(SHOWDOWN_URL_POKEDEX)
    if (!pokedexResponse.ok) {
      throw new Error(
        `Failed to fetch pokedex.ts: ${pokedexResponse.statusText}`,
      )
    }
    const pokedexContent = await pokedexResponse.text()
    console.log(`  ✓ Fetched pokedex.ts: ${pokedexContent.length} bytes`)

    // 3. 拉取 formats-data.ts
    console.log(
      `[3/3] Fetching formats-data.ts from ${SHOWDOWN_URL_FORMATS}...`,
    )
    const formatsResponse = await fetch(SHOWDOWN_URL_FORMATS)
    if (!formatsResponse.ok) {
      throw new Error(
        `Failed to fetch formats-data.ts: ${formatsResponse.statusText}`,
      )
    }
    const formatsContent = await formatsResponse.text()
    console.log(`  ✓ Fetched formats-data.ts: ${formatsContent.length} bytes`)

    // 4. 保存快照
    const snapshot: ShowdownSnapshot = {
      rulesets: {
        content: rulesetsContent,
        fetchedAt: new Date().toISOString(),
        url: SHOWDOWN_URL_RULESETS,
      },
      pokedex: {
        content: pokedexContent,
        fetchedAt: new Date().toISOString(),
        url: SHOWDOWN_URL_POKEDEX,
      },
      formats: {
        content: formatsContent,
        fetchedAt: new Date().toISOString(),
        url: SHOWDOWN_URL_FORMATS,
      },
      updatedAt: new Date().toISOString(),
    }

    // 确保目录存在
    const snapshotDir = path.dirname(SNAPSHOT_PATH)
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true })
    }

    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf-8')
    console.log(`\n💾 Saved snapshot to ${SNAPSHOT_PATH}`)
    console.log(`   Total size: ${JSON.stringify(snapshot).length} bytes`)
    console.log(`\n✅ Stage 1 complete: Showdown 原始数据已拉取并保存`)
  } catch (err) {
    console.error('❌ Error fetching Showdown data:', err)
    process.exit(1)
  }
}

// 执行
fetchShowdown()
