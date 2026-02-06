import * as fs from 'fs'
import * as path from 'path'

/**
 * Stage 2: 提取规则数据（规则源）
 *
 * 功能：
 * - 读取 Stage 1 的快照（showdown-snapshot.json）
 * - 从 rulesets.ts 提取图鉴列表
 * - 从 pokedex.ts 提取分类列表
 * - 更新 app/lib/data/rulesets.ts
 *
 * 输入：
 * - app/lib/data/showdown-snapshot.json（Stage 1 的输出）
 *
 * 输出：
 * - app/lib/data/rulesets.ts（图鉴和分类数组）
 */

const SNAPSHOT_PATH = path.join(
  process.cwd(),
  'app/lib/data/showdown-snapshot.json',
)
const RULESETS_FILE_PATH = path.join(process.cwd(), 'app/lib/data/rulesets.ts')

interface DexList {
  name: string
  arrayName: string
  exportName: string
}

const DEX_LISTS: DexList[] = [
  {
    name: 'paldeapokedex',
    arrayName: 'paldeaDex',
    exportName: 'PALDEA_DEX',
  },
  {
    name: 'kitakamipokedex',
    arrayName: 'kitakamiDex',
    exportName: 'KITAKAMI_DEX',
  },
  {
    name: 'blueberrypokedex',
    arrayName: 'blueberryDex',
    exportName: 'BLUEBERRY_DEX',
  },
]

/**
 * 解析 pokedex.ts 中的对象（与 import-pokemon.ts 相同的逻辑）
 */
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

/**
 * 从 pokedex.ts 提取带有特定 tag 的宝可梦列表
 * 使用与 import-pokemon.ts 相同的对象解析逻辑
 * 排除形态（只保留基础形态）和非标准宝可梦
 */
function extractPokemonByTagRobust(
  pokedexContent: string,
  tag: string,
): string[] {
  const pokemon: string[] = []
  const seenNames = new Set<string>()
  const seenBaseSpecies = new Set<string>()

  // 解析每个宝可梦条目（depth=2 表示 pokedex 对象内的每个宝可梦）
  for (const match of extractObjects(pokedexContent, 2)) {
    const entryContent = match.content

    // 提前提取 num 和 isNonstandard，用于早期排除
    const numMatch = entryContent.match(/num:\s*(-?\d+)/)
    const num = numMatch ? parseInt(numMatch[1]) : 0

    // 如果 num <= 0，直接排除（非标准宝可梦，如 Pokestar）
    if (num <= 0) {
      continue
    }

    // 检查 isNonstandard 字段
    const isNonstandardMatch = entryContent.match(
      /isNonstandard:\s*["']([^"']+)["']/,
    )
    if (isNonstandardMatch) {
      const isNonstandard = isNonstandardMatch[1]
      // 允许标准的 Past 宝可梦（编号在 1-1025 范围内）
      if (isNonstandard === 'Past' && num > 0 && num <= 1025) {
        // 放行标准的 Past 宝可梦
      } else {
        // 排除其他非标准内容：Future, LGPE, CAP, Custom, Gigantamax, Unobtainable
        continue
      }
    }

    // 提取 name（只有在通过上述检查后才提取）
    const nameMatch = entryContent.match(/name:\s*["']([^"']+)["']/)
    if (!nameMatch) continue

    const name = nameMatch[1]

    // 检查是否是形态（有 baseSpecies 或 forme 字段）
    const hasBaseSpecies = /baseSpecies:\s*["']/.test(entryContent)
    const hasForme = /forme:\s*["']/.test(entryContent)

    // 提取 tags
    const tagsMatch = entryContent.match(/tags:\s*\[([^\]]+)\]/)
    if (!tagsMatch) continue

    const tagsStr = tagsMatch[1]
    // 解析 tags 数组中的字符串
    const tagMatches = tagsStr.match(/"([^"]+)"/g)
    if (!tagMatches) continue

    const tags = tagMatches.map((t) => t.slice(1, -1))

    // 检查是否包含目标 tag
    if (tags.includes(tag)) {
      // 如果是形态，尝试提取 baseSpecies
      if (hasBaseSpecies) {
        const baseSpeciesMatch = entryContent.match(
          /baseSpecies:\s*["']([^"']+)["']/,
        )
        if (baseSpeciesMatch) {
          const baseSpecies = baseSpeciesMatch[1]
          // 只添加基础形态，避免重复
          if (!seenBaseSpecies.has(baseSpecies)) {
            pokemon.push(baseSpecies)
            seenBaseSpecies.add(baseSpecies)
            seenNames.add(baseSpecies)
          }
          continue
        }
      }

      // 对于基础形态，直接添加（排除重复和明显的形态名称）
      if (!seenNames.has(name)) {
        if (!hasForme || name === match.key) {
          // 排除明显的形态名称（包含 -Mega、-Gmax、-Primal 等）
          if (
            !name.includes('-Mega') &&
            !name.includes('-Gmax') &&
            !name.includes('-Primal') &&
            !name.includes('-Ultra') &&
            !name.includes('-Eternamax') &&
            !name.includes('-Bond')
          ) {
            pokemon.push(name)
            seenNames.add(name)
          }
        }
      }
    }
  }

  return pokemon.sort()
}

/**
 * 提取规则集中的图鉴数组
 * 从 rulesets.ts 中提取类似这样的结构：
 * paldeapokedex: {
 *   onValidateSet(set, format) {
 *     const paldeaDex = [
 *       "Sprigatito", "Floragato", ...
 *     ];
 *   }
 * }
 */
function extractDexArray(
  content: string,
  rulesetName: string,
  arrayName: string,
): string[] {
  // 查找规则集定义和数组声明
  // 先找到规则集
  const rulesetStartPattern = new RegExp(`${rulesetName}:\\s*{`, 's')
  const rulesetMatch = content.match(rulesetStartPattern)
  if (!rulesetMatch) {
    throw new Error(`Could not find ${rulesetName} rule`)
  }

  // 在规则集内查找数组声明
  const rulesetStart = rulesetMatch.index! + rulesetMatch[0].length
  let braceDepth = 1
  let i = rulesetStart
  let arrayStart = -1

  // 找到数组声明位置
  // 使用更宽松的匹配，支持单行和多行数组
  const arrayPattern = new RegExp(`const\\s+${arrayName}\\s*=\\s*\\[`, 's')
  const arrayMatch = content.slice(rulesetStart).match(arrayPattern)

  if (arrayMatch) {
    arrayStart = rulesetStart + arrayMatch.index! + arrayMatch[0].length - 1 // 指向 '['
  } else {
    // 如果没找到，尝试在规则集内查找（处理嵌套情况）
    while (i < content.length && braceDepth > 0) {
      const char = content[i]
      const nextChars = content.slice(i, i + 30)

      if (char === '{') braceDepth++
      if (char === '}') braceDepth--

      // 查找 const arrayName = [
      if (
        braceDepth > 0 &&
        nextChars.match(new RegExp(`const\\s+${arrayName}\\s*=\\s*\\[`))
      ) {
        const arrayMatch = nextChars.match(
          new RegExp(`const\\s+${arrayName}\\s*=\\s*\\[`),
        )!
        arrayStart = i + arrayMatch[0].length - 1 // 指向 '['
        break
      }
      i++
    }
  }

  if (arrayStart === -1) {
    throw new Error(`Could not find ${arrayName} array in ${rulesetName}`)
  }

  // 解析数组内容
  let bracketDepth = 1
  let inString = false
  let stringChar = ''
  let currentName = ''
  const names: string[] = []
  let escapeNext = false

  for (i = arrayStart + 1; i < content.length; i++) {
    const char = content[i]
    const prevChar = i > 0 ? content[i - 1] : ''

    if (escapeNext) {
      currentName += char
      escapeNext = false
      continue
    }

    if (!inString) {
      if (char === '"' || char === "'") {
        inString = true
        stringChar = char
        currentName = ''
      } else if (char === '[') {
        bracketDepth++
      } else if (char === ']') {
        bracketDepth--
        if (bracketDepth === 0) {
          // 数组结束
          break
        }
      }
    } else {
      // 在字符串中
      if (char === '\\') {
        escapeNext = true
        currentName += char
      } else if (char === stringChar) {
        // 字符串结束
        inString = false
        if (currentName.trim()) {
          names.push(currentName.trim())
        }
        currentName = ''
      } else {
        currentName += char
      }
    }
  }

  return names
}

/**
 * 更新 rulesets.ts 文件中的图鉴列表
 */
function updateRulesetsFile(dexData: Map<string, string[]>): void {
  let content = fs.readFileSync(RULESETS_FILE_PATH, 'utf-8')

  // 更新每个图鉴列表
  for (const dex of DEX_LISTS) {
    const names = dexData.get(dex.exportName)
    if (!names || names.length === 0) {
      console.warn(`Warning: No data found for ${dex.exportName}, skipping`)
      continue
    }

    // 查找导出语句的开始位置：export const PALDEA_DEX = [
    const exportStartPattern = new RegExp(
      `export const ${dex.exportName}\\s*=\\s*\\[`,
    )
    const startMatch = content.match(exportStartPattern)
    if (!startMatch) {
      console.error(`Could not find export statement for ${dex.exportName}`)
      continue
    }

    // 找到数组结束位置
    const startPos = startMatch.index! + startMatch[0].length
    let bracketDepth = 1
    let endPos = startPos

    for (let i = startPos; i < content.length; i++) {
      const char = content[i]
      // 跳过字符串内的字符
      if (char === '"' || char === "'") {
        const quote = char
        i++ // 跳过开始引号
        while (i < content.length) {
          if (content[i] === '\\') {
            i += 2 // 跳过转义字符
            continue
          }
          if (content[i] === quote) {
            break // 字符串结束
          }
          i++
        }
        continue
      }

      if (char === '[') bracketDepth++
      if (char === ']') {
        bracketDepth--
        if (bracketDepth === 0) {
          endPos = i + 1
          break
        }
      }
    }

    if (bracketDepth !== 0) {
      console.error(`Could not find end of array for ${dex.exportName}`)
      continue
    }

    // 生成新的数组内容
    const newArrayContent = names.map((name) => `  '${name}'`).join(',\n')

    const newExport = `export const ${dex.exportName} = [\n${newArrayContent},\n]`

    // 替换数组内容（保留前后的内容）
    const before = content.slice(0, startMatch.index!)
    const after = content.slice(endPos)
    content = before + newExport + after

    console.log(`Updated ${dex.exportName} with ${names.length} entries`)
  }

  // 写入文件
  fs.writeFileSync(RULESETS_FILE_PATH, content, 'utf-8')
  console.log(`✅ Updated ${RULESETS_FILE_PATH}`)
}

/**
 * 更新分类列表（RESTRICTED_LEGENDARIES、MYTHICALS、PARADOX_POKEMON、SUB_LEGENDARIES）
 */
function updateClassificationLists(lists: {
  restrictedLegendaries: string[]
  mythicals: string[]
  paradoxPokemon: string[]
  subLegendaries: string[]
}): void {
  let content = fs.readFileSync(RULESETS_FILE_PATH, 'utf-8')

  // 更新 RESTRICTED_LEGENDARIES
  const restrictedPattern = new RegExp(
    `export const RESTRICTED_LEGENDARIES\\s*=\\s*\\[`,
  )
  const restrictedMatch = content.match(restrictedPattern)
  if (restrictedMatch) {
    const startPos = restrictedMatch.index! + restrictedMatch[0].length
    let bracketDepth = 1
    let endPos = startPos

    for (let i = startPos; i < content.length; i++) {
      const char = content[i]
      if (char === '"' || char === "'") {
        const quote = char
        i++
        while (i < content.length) {
          if (content[i] === '\\') {
            i += 2
            continue
          }
          if (content[i] === quote) break
          i++
        }
        continue
      }

      if (char === '[') bracketDepth++
      if (char === ']') {
        bracketDepth--
        if (bracketDepth === 0) {
          endPos = i + 1
          break
        }
      }
    }

    // 去重
    const uniqueRestricted = Array.from(new Set(lists.restrictedLegendaries))
    const newArray = uniqueRestricted.map((name) => `  '${name}'`).join(',\n')
    const newExport = `export const RESTRICTED_LEGENDARIES = [\n${newArray},\n]`

    const before = content.slice(0, restrictedMatch.index!)
    const after = content.slice(endPos)
    content = before + newExport + after
    console.log(
      `Updated RESTRICTED_LEGENDARIES: ${lists.restrictedLegendaries.length} entries`,
    )
  }

  // 更新 MYTHICALS
  const mythicalPattern = new RegExp(`export const MYTHICALS\\s*=\\s*\\[`)
  const mythicalMatch = content.match(mythicalPattern)
  if (mythicalMatch) {
    const startPos = mythicalMatch.index! + mythicalMatch[0].length
    let bracketDepth = 1
    let endPos = startPos

    for (let i = startPos; i < content.length; i++) {
      const char = content[i]
      if (char === '"' || char === "'") {
        const quote = char
        i++
        while (i < content.length) {
          if (content[i] === '\\') {
            i += 2
            continue
          }
          if (content[i] === quote) break
          i++
        }
        continue
      }

      if (char === '[') bracketDepth++
      if (char === ']') {
        bracketDepth--
        if (bracketDepth === 0) {
          endPos = i + 1
          break
        }
      }
    }

    // 去重
    const uniqueMythicals = Array.from(new Set(lists.mythicals))
    const newArray = uniqueMythicals.map((name) => `  '${name}'`).join(',\n')
    const newExport = `export const MYTHICALS = [\n${newArray},\n]`

    const before = content.slice(0, mythicalMatch.index!)
    const after = content.slice(endPos)
    content = before + newExport + after
    console.log(`Updated MYTHICALS: ${lists.mythicals.length} entries`)
  }

  // 更新 PARADOX_POKEMON
  const paradoxPattern = new RegExp(`export const PARADOX_POKEMON\\s*=\\s*\\[`)
  const paradoxMatch = content.match(paradoxPattern)
  if (paradoxMatch) {
    const startPos = paradoxMatch.index! + paradoxMatch[0].length
    let bracketDepth = 1
    let endPos = startPos

    for (let i = startPos; i < content.length; i++) {
      const char = content[i]
      if (char === '"' || char === "'") {
        const quote = char
        i++
        while (i < content.length) {
          if (content[i] === '\\') {
            i += 2
            continue
          }
          if (content[i] === quote) break
          i++
        }
        continue
      }

      if (char === '[') bracketDepth++
      if (char === ']') {
        bracketDepth--
        if (bracketDepth === 0) {
          endPos = i + 1
          break
        }
      }
    }

    // 去重
    const uniqueParadox = Array.from(new Set(lists.paradoxPokemon))
    const newArray = uniqueParadox.map((name) => `  '${name}'`).join(',\n')
    const newExport = `export const PARADOX_POKEMON = [\n${newArray},\n]`

    const before = content.slice(0, paradoxMatch.index!)
    const after = content.slice(endPos)
    content = before + newExport + after
    console.log(
      `Updated PARADOX_POKEMON: ${lists.paradoxPokemon.length} entries`,
    )
  }

  // 更新 SUB_LEGENDARIES（保留注释结构）
  const subLegendPattern = new RegExp(
    `export const SUB_LEGENDARIES\\s*=\\s*\\[`,
  )
  const subLegendMatch = content.match(subLegendPattern)
  if (subLegendMatch) {
    const startPos = subLegendMatch.index! + subLegendMatch[0].length
    let bracketDepth = 1
    let endPos = startPos

    for (let i = startPos; i < content.length; i++) {
      const char = content[i]
      if (char === '"' || char === "'") {
        const quote = char
        i++
        while (i < content.length) {
          if (content[i] === '\\') {
            i += 2
            continue
          }
          if (content[i] === quote) break
          i++
        }
        continue
      }

      if (char === '[') bracketDepth++
      if (char === ']') {
        bracketDepth--
        if (bracketDepth === 0) {
          endPos = i + 1
          break
        }
      }
    }

    // 去重
    const uniqueSubLegends = Array.from(new Set(lists.subLegendaries))

    // 尝试根据名称模式分类（Paldea/Kitakami vs Transfer Allowed）
    // 这些是 Gen 9 新增的 Sub-Legendary
    const paldeaKitakamiPatterns = [
      'Wo-Chien',
      'Chien-Pao',
      'Ting-Lu',
      'Chi-Yu',
      'Okidogi',
      'Munkidori',
      'Fezandipiti',
      'Ogerpon',
    ]

    const paldeaKitakami = uniqueSubLegends.filter((name) =>
      paldeaKitakamiPatterns.some((pattern) => name.includes(pattern)),
    )
    const transferAllowed = uniqueSubLegends.filter(
      (name) =>
        !paldeaKitakamiPatterns.some((pattern) => name.includes(pattern)),
    )

    // 构建新的数组内容，保留注释结构
    let newArray = ''
    if (paldeaKitakami.length > 0) {
      newArray += `  // Paldea / Kitakami\n`
      newArray += paldeaKitakami.map((name) => `  '${name}'`).join(',\n')
      if (transferAllowed.length > 0) {
        newArray += '\n\n'
      }
    }
    if (transferAllowed.length > 0) {
      newArray += `  // Transfer Allowed\n`
      newArray += transferAllowed.map((name) => `  '${name}'`).join(',\n')
    }
    newArray +=
      `\n\n  // Note: Other sub-legends (Raikou, Tapus, Ultra Beasts) are NOT native or transfer-allowed in SV, so they are filtered by sv-available anyway.\n` +
      `  // We only list those that ARE in Transfer/Native dexes.`

    const newExport = `export const SUB_LEGENDARIES = [\n${newArray},\n]`

    const before = content.slice(0, subLegendMatch.index!)
    const after = content.slice(endPos)
    content = before + newExport + after
    console.log(
      `Updated SUB_LEGENDARIES: ${lists.subLegendaries.length} entries (${paldeaKitakami.length} Paldea/Kitakami, ${transferAllowed.length} Transfer)`,
    )
  }

  // 写入文件
  fs.writeFileSync(RULESETS_FILE_PATH, content, 'utf-8')
}

async function extractRulesets() {
  try {
    console.log('📊 Stage 2: 提取规则数据...\n')

    // 1. 读取快照
    if (!fs.existsSync(SNAPSHOT_PATH)) {
      throw new Error(
        `Snapshot not found: ${SNAPSHOT_PATH}\nPlease run Stage 1 (fetch-showdown.ts) first.`,
      )
    }

    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8')) as {
      rulesets: { content: string }
      pokedex: { content: string }
    }

    console.log('✓ Loaded snapshot from Stage 1')

    // 2. 提取图鉴列表（从 rulesets.ts）
    console.log('\n[1/2] Extracting dex lists from rulesets.ts...')
    const dexData = new Map<string, string[]>()

    for (const dex of DEX_LISTS) {
      try {
        const names = extractDexArray(
          snapshot.rulesets.content,
          dex.name,
          dex.arrayName,
        )
        dexData.set(dex.exportName, names)
        console.log(`  ✓ Extracted ${dex.exportName}: ${names.length} Pokemon`)
      } catch (err) {
        console.error(
          `  ✗ Error extracting ${dex.exportName}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }

    // 3. 提取分类列表（从 pokedex.ts）
    console.log('\n[2/2] Extracting classification lists from pokedex.ts...')
    const restrictedLegendaries = extractPokemonByTagRobust(
      snapshot.pokedex.content,
      'Restricted Legendary',
    )
    const mythicals = extractPokemonByTagRobust(
      snapshot.pokedex.content,
      'Mythical',
    )
    const paradoxPokemon = extractPokemonByTagRobust(
      snapshot.pokedex.content,
      'Paradox',
    )
    const subLegendaries = extractPokemonByTagRobust(
      snapshot.pokedex.content,
      'Sub-Legendary',
    )

    console.log(
      `  ✓ Extracted classifications:\n` +
        `    Restricted Legendaries: ${restrictedLegendaries.length}\n` +
        `    Mythicals: ${mythicals.length}\n` +
        `    Paradox Pokemon: ${paradoxPokemon.length}\n` +
        `    Sub-Legendaries: ${subLegendaries.length}`,
    )

    // 4. 更新 rulesets.ts 文件
    if (dexData.size > 0) {
      updateRulesetsFile(dexData)
      updateClassificationLists({
        restrictedLegendaries,
        mythicals,
        paradoxPokemon,
        subLegendaries,
      })
      console.log('\n✅ Stage 2 complete: rulesets.ts 已更新')
    } else {
      console.error('❌ No data extracted, skipping update')
      process.exit(1)
    }
  } catch (err) {
    console.error('❌ Error extracting rulesets:', err)
    process.exit(1)
  }
}

// 执行
extractRulesets()
