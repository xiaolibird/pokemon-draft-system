import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import {
  BLUEBERRY_DEX,
  KITAKAMI_DEX,
  MYTHICALS,
  PALDEA_DEX,
  PARADOX_POKEMON,
  RESTRICTED_LEGENDARIES,
  SUB_LEGENDARIES,
  TRANSFER_ONLY_DEX,
} from '../../../app/lib/data/rulesets'
import { getGeneration } from '../../../app/lib/utils'

/**
 * Stage 3: 处理宝可梦数据（业务逻辑）
 *
 * 功能：
 * - 读取 Stage 1 的快照（showdown-snapshot.json）
 * - 读取 Stage 2 的输出（rulesets.ts）
 * - 应用业务规则（硬编码的排除、irrelevant 标记等）
 * - 写入数据库
 *
 * 输入：
 * - app/lib/data/showdown-snapshot.json（Stage 1 的输出）
 * - app/lib/data/rulesets.ts（Stage 2 的输出）
 *
 * 输出：
 * - 数据库 Pokemon 记录
 */

const prisma = new PrismaClient()

const SNAPSHOT_PATH = path.join(
  process.cwd(),
  'app/lib/data/showdown-snapshot.json',
)

// Helper to normalize names to IDs (lowercase, alphanumeric only)
function toID(text: any): string {
  if (text?.id) text = text.id
  if (typeof text !== 'string' && typeof text !== 'number') return ''
  return ('' + text).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

// Pre-calculate ID sets for O(1) lookups and case-insensitivity
const SV_NATIVE_DEX = Array.from(
  new Set([
    ...PALDEA_DEX,
    ...KITAKAMI_DEX,
    ...BLUEBERRY_DEX,
    ...TRANSFER_ONLY_DEX,
  ]),
)
const ALL_SV_POKEMON = Array.from(
  new Set([
    ...SV_NATIVE_DEX,
    ...TRANSFER_ONLY_DEX,
    ...RESTRICTED_LEGENDARIES,
    ...PARADOX_POKEMON,
    ...SUB_LEGENDARIES,
  ]),
)

const SV_NATIVE_IDS = new Set(SV_NATIVE_DEX.map(toID))
const TRANSFER_ONLY_IDS = new Set(TRANSFER_ONLY_DEX.map(toID))
const RESTRICTED_IDS = new Set(RESTRICTED_LEGENDARIES.map(toID))
const MYTHICAL_IDS = new Set(MYTHICALS.map(toID))
const PARADOX_IDS = new Set(PARADOX_POKEMON.map(toID))
const SUB_LEGEND_IDS = new Set(SUB_LEGENDARIES.map(toID))
const ALL_SV_IDS = new Set(ALL_SV_POKEMON.map(toID))

/**
 * 计算宝可梦的标签（仅在数据导入时使用）
 *
 * 重要说明：
 * - 这个函数只在数据导入时被调用（import-pokemon.ts）
 * - 标签会被固化到数据库的 tags 字段
 * - 运行时不需要调用此函数，UI 直接从数据库读取 tags 数组
 *
 * @param name 宝可梦名称
 * @param isNonstandard 是否非标准（如 'Past'）
 * @param tier 分级（如 'Illegal'）
 * @returns 标签数组，如果为空数组则表示应该排除
 */
function getPokemonTags(
  name: string,
  isNonstandard?: string | null,
  tier?: string | null,
): string[] {
  const tags: string[] = []
  const id = toID(name)

  // 1. Determine Base Species ID & Form Status
  let baseId = id
  let isForm = false

  if (ALL_SV_IDS.has(id)) {
    // Direct match, likely base or explicitly registered form
    baseId = id
  } else {
    // Try to split by hyphen (for Names)
    if (name.includes('-')) {
      const parts = name.split('-')
      const potentialBaseId = toID(parts[0])
      if (ALL_SV_IDS.has(potentialBaseId)) {
        baseId = potentialBaseId
        isForm = true
      }
    }

    // If still not found, try to find base by prefix (for IDs like 'taurospaldeacombat')
    if (!isForm) {
      // Check common base IDs that appear as prefixes
      // We sort by length descending to catch 'basculin' before 'bascul' etc.
      const sortedBases = Array.from(ALL_SV_IDS).sort(
        (a, b) => b.length - a.length,
      )
      for (const bId of sortedBases) {
        if (id.startsWith(bId) && id.length > bId.length) {
          // Double check it's a valid "form" prefix break
          // This is a bit heuristic but covers most Showdown IDs
          baseId = bId
          isForm = true
          break
        }
      }
    }
  }

  // 2. Determine "Irrelevant" status (Cosmetic or Specific User Exclusions)
  // irrelevant 标记：收藏差异，与战斗无关（由用户定义）
  //
  // 重要说明：
  // - 所有 irrelevant 标记的形态都会写入数据库（包括 x 标记、specificExclusions、cosmeticFamilies）
  // - 只是在规则筛选时不显示（UI 默认隐藏）
  // - 这个函数只在数据导入时被调用，irrelevant 标签会被固化到数据库
  // - 运行时不需要调用此函数，UI 直接从数据库读取 tags 数组
  let isIrrelevant = false

  // 2.1. 收藏家族（Cosmetic Families）- 基于 Showdown pokedex 的 cosmeticFormes 属性
  // 这些家族在 Showdown 的 pokedex.ts 中都有 cosmeticFormes 属性，表示收藏差异形态
  // 注意：这些家族的所有形态变种（除了基础形态）都会被标记为 irrelevant，但会写入数据库
  const cosmeticFamilies = [
    'gastrodon', // pokedex 中有 cosmeticFormes: ['Gastrodon-East']
    'shellos', // pokedex 中有 cosmeticFormes: ['Shellos-East']
    'vivillon', // pokedex 中有 cosmeticFormes: [...]（18个地区形态）
    'deerling', // pokedex 中有 cosmeticFormes: ['Deerling-Summer', 'Deerling-Autumn', 'Deerling-Winter']
    'alcremie', // pokedex 中有 cosmeticFormes: [...]（很多形态）
    'minior', // pokedex 中有 cosmeticFormes: [...]（颜色形态）
    // 注意：pikachu 在 pokedex 中没有 cosmeticFormes，只有 otherFormes
    // 但用户标记了多个 pikachu 形态为 x，所以也加入这个列表
    'pikachu', // 用户标记了多个形态为 x（hoenn, kalos, original, partner, sinnoh, unova, world）
  ]
  if (cosmeticFamilies.includes(baseId) && id !== baseId) {
    isIrrelevant = true
  }

  // Special Case: Tatsugiri forms have unique battle effects with Dondozo
  if (baseId === 'tatsugiri') {
    isIrrelevant = false
  }

  // 2.2. 特定排除列表（Specific Exclusions）- 用户定义的特定收藏差异形态
  // 这些形态不在 cosmeticFamilies 中，但用户明确标记为 x（收藏差异）
  // 注意：
  // - 这些形态的 baseId 都不在 cosmeticFamilies 列表中
  // - 这些形态会写入数据库并标记为 irrelevant，只是在规则筛选时不显示
  // 来源：原 forms_need_translation.md 中标记为 'x' 的形态（不在 cosmeticFamilies 中的）
  const specificExclusions = [
    'magearnaoriginal', // baseId: magearna
    'sinisteaantique', // baseId: sinistea
    'polteageistantique', // baseId: polteageist
    'zarudedada', // baseId: zarude
    'mausholdfour', // baseId: maushold
    'dudunsparcethreesegment', // baseId: dudunsparce
    'gimmighoulroaming', // baseId: gimmighoul
    'poltchageistartisan', // baseId: poltchageist
    'sinistchamasterpiece', // baseId: sinistcha
  ]
  if (specificExclusions.includes(id)) {
    isIrrelevant = true
  }

  // Hard exclusion for truly unobtainable, illegal, or legacy Showdown data
  // 注意：标准的 Past 宝可梦会被放行，因为它们仍然是标准的宝可梦（只是不在当前世代）
  if (
    isNonstandard === 'Unobtainable' ||
    isNonstandard === 'CAP' ||
    isNonstandard === 'Custom' ||
    isNonstandard === 'LGPE' ||
    (tier === 'Illegal' && isNonstandard !== 'Past') || // Past 宝可梦即使 tier 是 Illegal 也允许（它们在 NatDex 中合法）
    tier === 'Unobtainable'
  ) {
    return []
  }
  // Past 宝可梦会被允许通过，但不会得到 sv-available tag（因为它们不在 SV 中）

  // Check Categories
  let isSvNative = SV_NATIVE_IDS.has(baseId)
  let isTransfer = TRANSFER_ONLY_IDS.has(baseId)
  let isRestricted = RESTRICTED_IDS.has(baseId)
  let isMythical = MYTHICAL_IDS.has(baseId)
  let isParadox = PARADOX_IDS.has(baseId)
  let isSubLegend = SUB_LEGEND_IDS.has(baseId)

  // Check legality (must be in SV or Transfer, or be a Past Pokemon)
  const isPastPokemon = isNonstandard === 'Past'
  const isInSv = ALL_SV_IDS.has(baseId) || ALL_SV_IDS.has(id)

  if (!isInSv && !isPastPokemon) {
    return tags
  }

  // Explicitly exclude Mechanics not present in SV (Mega, Gmax)
  if (
    isForm &&
    (id.includes('mega') || id.includes('gmax') || id.includes('gigantamax'))
  ) {
    return tags
  }

  // 只有 SV 中的宝可梦才添加 sv-available tag
  if (isInSv) {
    tags.push('sv-available')
  }

  if (isIrrelevant) tags.push('irrelevant')

  if (isRestricted) tags.push('restricted')
  if (isMythical) tags.push('mythical')
  if (isParadox) tags.push('paradox')
  if (isSubLegend) tags.push('sub-legendary')

  // Regulation Sets (只有 SV 中的宝可梦才有 reg-f tag)
  if (isInSv && !isRestricted && !isMythical && !isIrrelevant) {
    tags.push('reg-f')
  }

  if (!isMythical && !isIrrelevant) {
    tags.push('reg-g')
  }

  if (
    !isRestricted &&
    !isMythical &&
    !isSubLegend &&
    !isParadox &&
    !isIrrelevant
  ) {
    tags.push('reg-h')
  }

  return tags
}

// 加载按编号的中文名列表（完整数据源）
const CN_NAMES_FULL_PATH = path.join(
  process.cwd(),
  'app/lib/data/names-cn-full.json',
)
let cnNamesList: string[] = []
if (fs.existsSync(CN_NAMES_FULL_PATH)) {
  cnNamesList = JSON.parse(fs.readFileSync(CN_NAMES_FULL_PATH, 'utf-8'))
  console.log(
    `Loaded ${cnNamesList.length} Chinese names from names-cn-full.json`,
  )
} else {
  console.warn(
    `Warning: names-cn-full.json not found, Chinese names will be skipped`,
  )
}

// 形态后缀映射（用于生成中文名）
const SUFFIX_MAP: Record<string, string> = {
  mega: '超级',
  megax: '超级-X',
  megay: '超级-Y',
  gmax: '超极巨化',
  alola: '阿罗拉',
  galar: '伽勒尔',
  hisui: '洗翠',
  paldea: '帕底亚',
  primal: '原始',
  therian: '灵兽',
  incarnate: '化身',
  origin: '起源',
  white: '白',
  black: '黑',
  ice: '冰',
  shadow: '黑马',
  'rapid-strike': '连击',
  'single-strike': '一击',
  crowned: '剑之王/盾之王',
  bloodmoon: '赫月',
}

/**
 * 获取中文名（基于 names-cn-full.json，按编号查找）
 */
function getChineseName(name: string, num: number, id: string): string | null {
  // 从 names-cn-full.json 按编号查找
  if (num > 0 && num <= cnNamesList.length) {
    const baseNameCn = cnNamesList[num - 1]
    if (baseNameCn) {
      // 检查是否为形态（通过 ID 或名称判断）
      const idLower = id.toLowerCase()
      const nameParts = name.split('-')

      // 如果是形态，添加后缀
      if (nameParts.length > 1) {
        let suffixStr = ''
        // 检查后缀
        if (idLower.includes('megax')) suffixStr = '超级X'
        else if (idLower.includes('megay')) suffixStr = '超级Y'
        else if (idLower.includes('mega')) suffixStr = '超级'
        else if (idLower.includes('gmax')) suffixStr = '超极巨化'
        else if (idLower.includes('alola')) suffixStr = '阿罗拉'
        else if (idLower.includes('galar')) suffixStr = '伽勒尔'
        else if (idLower.includes('hisui')) suffixStr = '洗翠'
        else if (idLower.includes('paldea')) suffixStr = '帕底亚'

        if (suffixStr && !baseNameCn.includes(suffixStr)) {
          return `${baseNameCn}-${suffixStr}`
        }
      }

      return baseNameCn
    }
  }

  return null
}

/**
 * 硬编码的排除列表（需要完全排除的形态）
 *
 * 标记说明：
 * - x: 收藏差异，与战斗无关（会写入数据库但标记为 irrelevant，不在这里排除）
 * - n: 仅在战斗中（需要完全排除）
 * - xn: 两个条件都满足（需要完全排除）
 *
 * 注意：大部分 n/xn 标记的形态都有 battleOnly 属性会被自动排除，但这里作为额外保障
 *
 * 来源：原 forms_need_translation.md 中标记为 n/xn 的形态
 */
function getExcludedForms(): Set<string> {
  return new Set([
    // n 标记的形态（仅在战斗中）
    'meloettapirouette',
    'mimikyubusted',
    'cramorantgorging',
    'cramorantgulping',
    'eiscuenoice',
    'morpekohangry',
    'palafinhero',
    'ogerponcornerstonetera',
    'ogerponhearthflametera',
    'ogerpontealtera',
    'ogerponwellspringtera',
    'terapagosstellar',
    'terapagosterastal',
    // xn 标记的形态（收藏差异 + 仅在战斗中）
    'miniormeteor',
  ])
}

/**
 * 需要排除的特殊形态（硬编码列表）
 *
 * 排除逻辑：
 * - 大部分战斗中临时变化的形态会通过 battleOnly 属性自动排除
 * - Gmax 形态会通过 forme === 'Gmax' 检查自动排除
 * - 硬编码列表包含所有 n/xn 标记的形态，作为额外保障
 */
const EXCLUDED_FORMS = getExcludedForms()

/**
 * 检查是否应该排除某个宝可梦形态
 */
function shouldExcludePokemon(id: string): boolean {
  const normalizedId = id.toLowerCase().replace(/-/g, '')
  return EXCLUDED_FORMS.has(normalizedId)
}

interface FormatData {
  isNonstandard?: string | null
  tier?: string | null
}

// Parsing logic helper: Extract objects with brace counting
// Showdown data files usually look like: export const Data = { key: { ... }, ... }
// Depth 1 is the root object, Depth 2 are the entries we want.
function* extractObjects(text: string, targetDepth: number) {
  let depth = 0
  let start = -1
  let keyStart = -1

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      depth++
      if (depth === targetDepth) {
        // Find key before the brace
        let j = i - 1
        while (j >= 0 && /\s/.test(text[j])) j-- // skip whitespace
        if (j >= 0 && text[j] === ':') {
          j--
          while (j >= 0 && /\s/.test(text[j])) j-- // skip whitespace
          let k = j
          while (k >= 0 && /[\w]/.test(text[k])) k--
          keyStart = k + 1
          start = i
        }
      }
    } else if (text[i] === '}') {
      if (depth === targetDepth && start !== -1) {
        const key = text.slice(keyStart, text.indexOf(':', keyStart)).trim()
        const content = text.slice(start, i + 1)
        yield { key, content }
        start = -1
      }
      depth--
    }
  }
}

async function importPokemon() {
  try {
    console.log('📥 Stage 3: 处理宝可梦数据...\n')
    console.log(
      `Excluded forms loaded: ${EXCLUDED_FORMS.size} forms (hardcoded n/xn markers)`,
    )

    // 1. 读取 Stage 1 的快照
    if (!fs.existsSync(SNAPSHOT_PATH)) {
      throw new Error(
        `Snapshot not found: ${SNAPSHOT_PATH}\nPlease run Stage 1 (fetch-showdown.ts) first.`,
      )
    }

    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8')) as {
      pokedex: { content: string }
      formats: { content: string }
    }

    console.log('✓ Loaded snapshot from Stage 1')

    // 2. 解析 Formats Data（从快照）
    const formatsMap = new Map<string, FormatData>()

    console.log('[1/2] Parsing formats data from snapshot...')
    const formatsContent = snapshot.formats.content
    // Use brace counting for formats
    for (const match of extractObjects(formatsContent, 2)) {
      const id = match.key.toLowerCase()
      const content = match.content

      const isNonstandardMatch = content.match(
        /isNonstandard:\s*["']?([^"'\s,]+)["']?/,
      )
      const tierMatch = content.match(/tier:\s*["']?([^"'\s,]+)["']?/)

      formatsMap.set(id, {
        isNonstandard: isNonstandardMatch ? isNonstandardMatch[1] : null,
        tier: tierMatch ? tierMatch[1] : null,
      })
    }
    console.log(`  ✓ Loaded ${formatsMap.size} format entries`)

    // 3. 读取 Pokedex Data（从快照）
    console.log('[2/2] Parsing pokedex data from snapshot...')
    const pokedexContent = snapshot.pokedex.content
    console.log(`  ✓ Loaded pokedex content: ${pokedexContent.length} bytes`)

    let updated = 0
    let notFound = 0
    let skipped = 0

    // 用于保存快照的数据结构
    const snapshotData: Record<
      string,
      {
        num: number
        name: string
        types: string[]
        baseStats: {
          hp: number
          atk: number
          def: number
          spa: number
          spd: number
          spe: number
        }
        abilities: string[]
        heightm: number
        weightkg: number
        color: string
        eggGroups: string[]
        isForme?: boolean
        baseSpecies?: string | null
        isNonstandard?: string | null
      }
    > = {}

    for (const match of extractObjects(pokedexContent, 2)) {
      const id = match.key.toLowerCase()
      const entryContent = match.content

      // 注意：
      // - x 标记的形态、specificExclusions、cosmeticFamilies 都会写入数据库并标记为 irrelevant
      // - 这里只排除 n 和 xn 标记的形态（它们有 battleOnly 属性，会被上面的检查排除）
      // - 所有 irrelevant 标记的形态都会写入数据库，只是在规则筛选时不显示

      // 检查是否是 n 或 xn 标记的形态（需要完全排除）
      // 这些形态通常有 battleOnly 属性，但为了确保完整性，这里也检查一下
      if (shouldExcludePokemon(id)) {
        skipped++
        continue
      }

      // 提前提取 num 和 isNonstandard，用于早期排除
      const numMatch = entryContent.match(/num:\s*(-?\d+)/)
      const num = numMatch ? parseInt(numMatch[1]) : 0

      // 如果 num <= 0，直接排除（非标准宝可梦，如 Pokestar）
      if (num <= 0) {
        skipped++
        continue
      }

      // 检查是否是战斗中临时变化的形态（基于 Showdown 的 battleOnly 属性）
      const battleOnlyMatch = entryContent.match(
        /battleOnly:\s*["']([^"']+)["']/,
      )
      if (battleOnlyMatch) {
        // 这是战斗中临时变化的形态，应该排除
        skipped++
        continue
      }

      // 检查是否是 Gmax 形态（forme === 'Gmax'）
      const formeMatch = entryContent.match(/forme:\s*["']([^"']+)["']/)
      const forme = formeMatch ? formeMatch[1] : null
      if (forme === 'Gmax') {
        // Gmax 形态只是视觉变化，不是真正的独立形态，应该排除
        skipped++
        continue
      }

      // Extract Pokedex isNonstandard（提前提取）
      const dexNonstandardMatch = entryContent.match(
        /isNonstandard:\s*["']?([^"'\s,]+)["']?/,
      )
      let dexNonstandard = dexNonstandardMatch ? dexNonstandardMatch[1] : null

      // --- MERGE WITH FORMATS DATA (提前检查) ---
      const formatData = formatsMap.get(id)
      let finalIsNonstandard = dexNonstandard

      if (formatData) {
        // If Formats has explicit isNonstandard (e.g. "Past"), it overrides Pokedex (often null)
        if (formatData.isNonstandard) {
          finalIsNonstandard = formatData.isNonstandard
        }
      }

      // 排除非标准内容，但允许标准的 Past 宝可梦（编号 1-1025）
      if (finalIsNonstandard != null) {
        // 允许标准的 Past 宝可梦（编号在 1-1025 范围内）
        if (finalIsNonstandard === 'Past' && num > 0 && num <= 1025) {
          // 放行标准的 Past 宝可梦
        } else {
          // 排除其他非标准内容：Future, LGPE, CAP, Custom, Gigantamax, Unobtainable
          skipped++
          continue
        }
      }

      // Extract Name
      const nameMatch = entryContent.match(/name:\s*["']([^"']+)["']/)
      const name = nameMatch ? nameMatch[1] : id

      // Extract Types
      const typesMatch = entryContent.match(/types:\s*\[([^\]]+)\]/)
      const types = typesMatch
        ? typesMatch[1]
            .replace(/['"]/g, '')
            .split(',')
            .map((t) => t.trim())
        : []

      // Extract Stats
      const baseStatsMatch = entryContent.match(/baseStats:\s*\{([^}]+)\}/)
      const stats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
      if (baseStatsMatch) {
        const statStr = baseStatsMatch[1]
        stats.hp = parseInt(statStr.match(/hp:\s*(\d+)/)?.[1] || '0')
        stats.atk = parseInt(statStr.match(/atk:\s*(\d+)/)?.[1] || '0')
        stats.def = parseInt(statStr.match(/def:\s*(\d+)/)?.[1] || '0')
        stats.spa = parseInt(statStr.match(/spa:\s*(\d+)/)?.[1] || '0')
        stats.spd = parseInt(statStr.match(/spd:\s*(\d+)/)?.[1] || '0')
        stats.spe = parseInt(statStr.match(/spe:\s*(\d+)/)?.[1] || '0')
      }
      const bst =
        stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe

      // Extract Abilities
      const abilitiesMatch = entryContent.match(/abilities:\s*\{([^}]+)\}/)
      const abilities = abilitiesMatch
        ? abilitiesMatch[1]
            .match(/['"]([^'"]+)['"]/g)
            ?.map((s) => s.replace(/['"]/g, '')) || []
        : []

      // Extract Height/Weight
      const heightMatch = entryContent.match(/heightm:\s*([\d.]+)/)
      const heightm = heightMatch ? parseFloat(heightMatch[1]) : 0
      const weightMatch = entryContent.match(/weightkg:\s*([\d.]+)/)
      const weightkg = weightMatch ? parseFloat(weightMatch[1]) : 0

      // Extract Color
      const colorMatch = entryContent.match(/color:\s*["']([^"']+)["']/)
      const color = colorMatch ? colorMatch[1] : ''

      // Extract Egg Groups
      const eggGroupsMatch = entryContent.match(/eggGroups:\s*\[([^\]]+)\]/)
      const eggGroups = eggGroupsMatch
        ? eggGroupsMatch[1]
            .replace(/['"]/g, '')
            .split(',')
            .map((t) => t.trim())
        : []

      // Base Generation from Num & Suffixes
      const gen = getGeneration(num, id)

      // Get tier from formats data (isNonstandard 已经在上面检查过了)
      const tier = formatData?.tier || null

      // Calculate Tags（传入正确的 isNonstandard，可能是 'Past' 或 null）
      const tags = getPokemonTags(name, finalIsNonstandard, tier)

      // 如果 tags 为空，说明不符合条件（不在 SV 中且不是 Past，或 Mega/Gmax 等），跳过
      if (tags.length === 0) {
        skipped++
        continue
      }

      // Get Chinese Name
      const nameCn = getChineseName(name, num, id)

      // Extract isForme and baseSpecies（forme 已经在上面检查过了）
      const isForme = !!formeMatch && forme !== null
      const baseSpeciesMatch = entryContent.match(
        /baseSpecies:\s*["']([^"']+)["']/,
      )
      const baseSpecies = baseSpeciesMatch ? baseSpeciesMatch[1] : null

      // Update or Create Database Record
      try {
        // Fully update all fields
        const data = {
          num,
          name,
          nameCn,
          gen,
          isNonstandard: finalIsNonstandard,
          tier,
          tags,
          types,
          hp: stats.hp,
          atk: stats.atk,
          def: stats.def,
          spa: stats.spa,
          spd: stats.spd,
          spe: stats.spe,
          bst,
          abilities,
          heightm,
          weightkg,
          color,
          eggGroups,
          isForme,
          baseSpecies,
        }

        await prisma.pokemon.upsert({
          where: { id },
          update: data, // Update EVERYTHING
          create: { id, ...data },
        })

        // 保存到快照数据（用于本地缓存）
        snapshotData[id] = {
          num,
          name,
          types,
          baseStats: {
            hp: stats.hp,
            atk: stats.atk,
            def: stats.def,
            spa: stats.spa,
            spd: stats.spd,
            spe: stats.spe,
          },
          abilities,
          heightm,
          weightkg,
          color,
          eggGroups,
          isForme,
          baseSpecies,
          isNonstandard: finalIsNonstandard,
        }

        updated++
        if (updated % 100 === 0) {
          console.log(`Updated ${updated}: ${name} (BST: ${bst})`)
        }
      } catch (err) {
        console.error(`Error updating ${id}:`, err)
        notFound++
      }
    }

    // 保存本地快照（JSON 格式，便于后续使用）
    const snapshotPath = path.join(
      process.cwd(),
      'app/lib/data/pokedex-snapshot.json',
    )
    console.log(`\n💾 Saving snapshot to ${snapshotPath}...`)
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify(snapshotData, null, 2),
      'utf-8',
    )
    console.log(
      `   Snapshot saved: ${Object.keys(snapshotData).length} entries`,
    )

    console.log(`\n✅ Stage 3 complete: 宝可梦数据已导入数据库`)
    console.log(`   Updated: ${updated}`)
    console.log(`   Skipped (excluded forms): ${skipped}`)
  } catch (error) {
    console.error('❌ Error importing Pokemon:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// 执行
importPokemon()
