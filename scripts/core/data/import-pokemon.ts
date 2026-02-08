import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
// Pre-calculate ID sets for O(1) lookups and case-insensitivity
import { getGeneration } from "../../../app/lib/utils/helpers";

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
 * - app/lib/data/pokemon/rulesets.ts（Stage 2 的输出）
 *
 * 输出：
 * - 数据库 Pokemon 记录
 */

const prisma = new PrismaClient();

const SNAPSHOT_PATH = path.join(
  process.cwd(),
  "app/lib/data/pokemon/showdown-snapshot.json",
);

// Helper to normalize names to IDs (lowercase, alphanumeric only)
function toID(text: any): string {
  if (text?.id) text = text.id;
  if (typeof text !== "string" && typeof text !== "number") return "";
  return ("" + text).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * 计算宝可梦的标签（仅在数据导入时使用）
 *
 * 重要说明：
 * - 这个函数只在数据导入时被调用（import-pokemon.ts）
 * - 标签会被固化到数据库的 tags 字段
 * - 运行时不需要调用此函数，UI 直接从数据库读取 tags 数组
 *
 * @param name 宝可梦名称
 * @param num 宝可梦编号
 * @param isNonstandard 是否非标准（如 'Past'）
 * @param tier 分级（如 'Illegal'）
 * @returns 标签数组，如果为空数组则表示应该排除
 */
function getPokemonTags(
  name: string,
  num: number,
  isNonstandard: string | null,
  tier: string | null,
  rawTags: string[] = [],
  battleOnly: string | null = null,
  isGmax: boolean = false,
  baseSpecies: string | null = null,
): string[] {
  const tags: string[] = [];
  const id = toID(name);

  // 1. Determine Base Species ID & Form Status
  let baseId = id;

  if (baseSpecies) {
    baseId = toID(baseSpecies);
  } else {
    // Fallback: simple heuristic for forms
    if (name.includes("-")) {
      const parts = name.split("-");
      baseId = toID(parts[0]);
    }
  }

  // 2. Irrelevant / Cosmetic Logic
  let isIrrelevant = false;

  // 2.1. Cosmetic Families (Based on Showdown)
  const cosmeticFamilies = [
    "gastrodon",
    "shellos",
    "vivillon",
    "deerling",
    "alcremie",
    "minior",
    "pikachu",
  ];
  if (cosmeticFamilies.includes(baseId) && id !== baseId) {
    isIrrelevant = true;
  }

  // 2.2. Special Case: Tatsugiri
  if (baseId === "tatsugiri") {
    isIrrelevant = false;
  }

  // 2.3. Specific Exclusions (Keep hardcoded list for hats etc.)
  const specificExclusions = [
    "magearnaoriginal",
    "sinisteaantique",
    "polteageistantique",
    "zarudedada",
    "mausholdfour",
    "dudunsparcethreesegment",
    "gimmighoulroaming",
    "poltchageistartisan",
    "sinistchamasterpiece",
  ];
  if (specificExclusions.includes(id)) {
    isIrrelevant = true;
  }

  // 3. Status Tags (From Arguments)
  if (battleOnly) tags.push("battle-only");
  if (isGmax) tags.push("gmax");
  if (isNonstandard) tags.push(isNonstandard.toLowerCase()); // past, future, lgpe, etc.

  // 4. Raw Tags Mapping (Inheritance from Base Species)
  // Mapping Showdown Tags to DB Tags
  const isRestricted = rawTags.includes("Restricted Legendary");
  const isMythical = rawTags.includes("Mythical");
  const isParadox = rawTags.includes("Paradox");
  const isSubLegend = rawTags.includes("Sub-Legendary");
  const isUltraBeast = rawTags.includes("Ultra Beast");

  if (isRestricted) tags.push("restricted");
  if (isMythical) tags.push("mythical");
  if (isParadox) tags.push("paradox");
  if (isSubLegend) tags.push("sub-legendary");
  if (isUltraBeast) tags.push("ultra-beast");

  // 5. sv-available Calculation
  // 核心逻辑: 标准 (isNonstandard 为空) 且 编号有效 且 非战斗形态 (排除例外)
  // 注意：Gmax 已经被标记为 gmax 标签，这里不再需要额外排除，只要 battleOnly 没问题
  // 实际上 Gmax 在 Showdown 数据中通常 isNonstandard='Gigantamax' 或 'Standard' 但有 Gmax 形式
  // Showdown 中 Gmax 也是 battleOnly 吗？大部分不是，但它有 forme: 'Gmax'
  // 我们的策略: 只要 isNonstandard 为空，就可能是可用。
  // 但是 Gmax 通常不能直接选用（Gen 9 也没有极巨化），所以我们依赖 battleOnly 或者 explicit exclusion?
  // 实际上 Gen 9 没有极巨化，所以它们不应该 sv-available。
  // 如果 isNonstandard 是 'Past'，它们自然没有 sv-available。
  // 如果 isNonstandard 是 null（Standard），但它是 Gmax... (Showdown 数据通常标 Past 或 Gigantamax)

  // Refined Logic for sv-available:
  const isCrownedDog = id === "zaciancrowned" || id === "zamazentacrowned";
  const isBattleForm = !!battleOnly && !isCrownedDog;

  // 只有标准宝可梦才可能是 sv-available
  const isStandard = !isNonstandard;
  const isStandardNum = num >= 1 && num <= 1025;
  const isNotInBattle = !isBattleForm;

  // 排除 Gmax (Gen 9 不可用) - 即使它标了 Standard (极少数情况)
  const isNotGmax = !isGmax;

  if (isStandard && isStandardNum && isNotInBattle && isNotGmax) {
    tags.push("sv-available");
  }

  if (isIrrelevant) tags.push("irrelevant");

  // Regulation Sets (Only for SV available mons)
  // 简化逻辑：只要有 sv-available，就判定规则
  if (tags.includes("sv-available")) {
    // Reg F
    if (!isRestricted && !isMythical && !isIrrelevant) {
      tags.push("reg-f");
    }
    // Reg G
    if (!isMythical && !isIrrelevant) {
      tags.push("reg-g");
    }
    // Reg H
    if (
      !isRestricted &&
      !isMythical &&
      !isSubLegend &&
      !isParadox &&
      !isIrrelevant
    ) {
      tags.push("reg-h");
    }
  }

  return tags;
}

// 加载按编号的中文名列表（完整数据源）
const CN_NAMES_FULL_PATH = path.join(
  process.cwd(),
  "app/lib/data/pokemon/names-cn-full.json",
);
let cnNamesList: string[] = [];
if (fs.existsSync(CN_NAMES_FULL_PATH)) {
  cnNamesList = JSON.parse(fs.readFileSync(CN_NAMES_FULL_PATH, "utf-8"));
  console.log(
    `Loaded ${cnNamesList.length} Chinese names from names-cn-full.json`,
  );
} else {
  console.warn(
    `Warning: names-cn-full.json not found, Chinese names will be skipped`,
  );
}

// 形态后缀映射（用于生成中文名）
const SUFFIX_MAP: Record<string, string> = {
  mega: "超级",
  megax: "超级-X",
  megay: "超级-Y",
  gmax: "超极巨化",
  alola: "阿罗拉",
  galar: "伽勒尔",
  hisui: "洗翠",
  paldea: "帕底亚",
  primal: "原始",
  therian: "灵兽",
  incarnate: "化身",
  origin: "起源",
  white: "白",
  black: "黑",
  ice: "冰",
  shadow: "黑马",
  "rapid-strike": "连击",
  "single-strike": "一击",
  crowned: "剑之王/盾之王",
  bloodmoon: "赫月",
};

/**
 * 获取中文名（基于 names-cn-full.json，按编号查找）
 */
function getChineseName(name: string, num: number, id: string): string | null {
  // 从 names-cn-full.json 按编号查找
  if (num > 0 && num <= cnNamesList.length) {
    const baseNameCn = cnNamesList[num - 1];
    if (baseNameCn) {
      // 检查是否为形态（通过 ID 或名称判断）
      const idLower = id.toLowerCase();
      const nameParts = name.split("-");

      // 如果是形态，添加后缀
      if (nameParts.length > 1) {
        let suffixStr = "";
        // 检查后缀
        if (idLower.includes("megax")) suffixStr = "超级X";
        else if (idLower.includes("megay")) suffixStr = "超级Y";
        else if (idLower.includes("mega")) suffixStr = "超级";
        else if (idLower.includes("gmax")) suffixStr = "超极巨化";
        else if (idLower.includes("alola")) suffixStr = "阿罗拉";
        else if (idLower.includes("galar")) suffixStr = "伽勒尔";
        else if (idLower.includes("hisui")) suffixStr = "洗翠";
        else if (idLower.includes("paldea")) suffixStr = "帕底亚";

        if (suffixStr && !baseNameCn.includes(suffixStr)) {
          return `${baseNameCn}-${suffixStr}`;
        }
      }

      return baseNameCn;
    }
  }

  return null;
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
    "meloettapirouette",
    "mimikyubusted",
    "cramorantgorging",
    "cramorantgulping",
    "eiscuenoice",
    "morpekohangry",
    "palafinhero",
    "ogerponcornerstonetera",
    "ogerponhearthflametera",
    "ogerpontealtera",
    "ogerponwellspringtera",
    "terapagosstellar",
    "terapagosterastal",
    // xn 标记的形态（收藏差异 + 仅在战斗中）
    "miniormeteor",
  ]);
}

/**
 * 需要排除的特殊形态（硬编码列表）
 *
 * 排除逻辑：
 * - 大部分战斗中临时变化的形态会通过 battleOnly 属性自动排除
 * - Gmax 形态会通过 forme === 'Gmax' 检查自动排除
 * - 硬编码列表包含所有 n/xn 标记的形态，作为额外保障
 */
const EXCLUDED_FORMS = getExcludedForms();

/**
 * 检查是否应该排除某个宝可梦形态
 */
function shouldExcludePokemon(id: string): boolean {
  const normalizedId = id.toLowerCase().replace(/-/g, "");
  return EXCLUDED_FORMS.has(normalizedId);
}

interface FormatData {
  isNonstandard?: string | null;
  tier?: string | null;
}

// Parsing logic helper: Extract objects with brace counting
// Showdown data files usually look like: export const Data = { key: { ... }, ... }
// Depth 1 is the root object, Depth 2 are the entries we want.
function* extractObjects(text: string, targetDepth: number) {
  let depth = 0;
  let start = -1;
  let keyStart = -1;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      depth++;
      if (depth === targetDepth) {
        // Find key before the brace
        let j = i - 1;
        while (j >= 0 && /\s/.test(text[j])) j--; // skip whitespace
        if (j >= 0 && text[j] === ":") {
          j--;
          while (j >= 0 && /\s/.test(text[j])) j--; // skip whitespace
          let k = j;
          while (k >= 0 && /[\w]/.test(text[k])) k--;
          keyStart = k + 1;
          start = i;
        }
      }
    } else if (text[i] === "}") {
      if (depth === targetDepth && start !== -1) {
        const key = text.slice(keyStart, text.indexOf(":", keyStart)).trim();
        const content = text.slice(start, i + 1);
        yield { key, content };
        start = -1;
      }
      depth--;
    }
  }
}

async function importPokemon() {
  try {
    console.log("📥 Stage 3: 处理宝可梦数据...\n");
    console.log(
      `Excluded forms loaded: ${EXCLUDED_FORMS.size} forms (hardcoded n/xn markers)`,
    );

    // 1. 读取 Stage 1 的快照
    if (!fs.existsSync(SNAPSHOT_PATH)) {
      throw new Error(
        `Snapshot not found: ${SNAPSHOT_PATH}\nPlease run Stage 1 (fetch-showdown.ts) first.`,
      );
    }

    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8")) as {
      pokedex: { content: string };
      formats: { content: string };
    };

    console.log("✓ Loaded snapshot from Stage 1");

    // 2. 解析 Formats Data（从快照）
    const formatsMap = new Map<string, FormatData>();

    console.log("[1/2] Parsing formats data from snapshot...");
    const formatsContent = snapshot.formats.content;
    // Use brace counting for formats
    for (const match of extractObjects(formatsContent, 2)) {
      const id = match.key.toLowerCase();
      const content = match.content;

      const isNonstandardMatch = content.match(
        /isNonstandard:\s*["']?([^"'\s,]+)["']?/,
      );
      const tierMatch = content.match(/tier:\s*["']?([^"'\s,]+)["']?/);

      formatsMap.set(id, {
        isNonstandard: isNonstandardMatch ? isNonstandardMatch[1] : null,
        tier: tierMatch ? tierMatch[1] : null,
      });
    }
    console.log(`  ✓ Loaded ${formatsMap.size} format entries`);

    const pokedexContent = snapshot.pokedex.content;
    console.log(`  ✓ Loaded pokedex content: ${pokedexContent.length} bytes`);

    // --- PRE-SCAN FOR TAG INHERITANCE ---
    console.log("[3/3] Pre-scanning pokedex for tag inheritance...");
    const rawTagsMap = new Map<string, string[]>();
    for (const match of extractObjects(pokedexContent, 2)) {
      const id = toID(match.key); // Use toID for consistent mapping
      const entryContent = match.content;
      const rawTagsMatch = entryContent.match(/tags:\s*\[([^\]]+)\]/);
      if (rawTagsMatch) {
        const tags = rawTagsMatch[1]
          .split(",")
          .map((t) => t.trim().replace(/['"]/g, ""));
        rawTagsMap.set(id, tags);
      }
    }
    console.log(`  ✓ Mapped tags for ${rawTagsMap.size} species`);

    // 使用 upsert 更新/创建 Pokemon，不删除旧记录（避免破坏比赛数据）
    // 非法 Pokemon（tier: "Illegal"）会被跳过（tags 为空），不会更新
    // 它们虽然还在数据库里，但不会出现在任何规则集中（因为查询时通过 tags 过滤）
    console.log("\n📝 开始导入/更新宝可梦数据...");

    let updated = 0;
    let notFound = 0;
    let skipped = 0;

    // 用于保存快照的数据结构
    const snapshotData: Record<
      string,
      {
        num: number;
        name: string;
        types: string[];
        baseStats: {
          hp: number;
          atk: number;
          def: number;
          spa: number;
          spd: number;
          spe: number;
        };
        abilities: string[];
        heightm: number;
        weightkg: number;
        color: string;
        eggGroups: string[];
        isForme?: boolean;
        baseSpecies?: string | null;
        isNonstandard?: string | null;
      }
    > = {};

    for (const match of extractObjects(pokedexContent, 2)) {
      const id = match.key.toLowerCase();
      const entryContent = match.content;

      // 注意：
      // - x 标记的形态、specificExclusions、cosmeticFamilies 都会写入数据库并标记为 irrelevant
      // - 这里只排除 n 和 xn 标记的形态（它们有 battleOnly 属性，会被上面的检查排除）
      // - 所有 irrelevant 标记的形态都会写入数据库，只是在规则筛选时不显示

      // 检查是否是 n 或 xn 标记的形态（需要完全排除）
      // 这些形态通常有 battleOnly 属性，但为了确保完整性，这里也检查一下
      if (shouldExcludePokemon(id)) {
        skipped++;
        continue;
      }

      // 提前提取 num 和 isNonstandard，用于早期排除
      const numMatch = entryContent.match(/num:\s*(-?\d+)/);
      const num = numMatch ? parseInt(numMatch[1]) : 0;

      // 如果 num <= 0，直接排除（非标准宝可梦，如 Pokestar）
      if (num <= 0) {
        skipped++;
        continue;
      }

      // 提取 Raw Tags (Showdown 原生标签)
      const rawTagsMatch = entryContent.match(/tags:\s*\[([^\]]+)\]/);
      const rawTags = rawTagsMatch
        ? rawTagsMatch[1].split(",").map((t) => t.trim().replace(/['"]/g, ""))
        : [];

      // 提取 battleOnly 信息 (用于打标，不再用于排除)
      const battleOnlyMatch = entryContent.match(
        /battleOnly:\s*["']([^"']+)["']/,
      );
      const battleOnly = battleOnlyMatch ? battleOnlyMatch[1] : null;

      // 检查是否是 Gmax 形态 (用于打标，不再用于排除)
      const formeMatch = entryContent.match(/forme:\s*["']([^"']+)["']/);
      const forme = formeMatch ? formeMatch[1] : null;
      const isGmax = forme === "Gmax";

      // Extract Pokedex isNonstandard（提前提取）
      const dexNonstandardMatch = entryContent.match(
        /isNonstandard:\s*["']?([^"'\s,]+)["']?/,
      );
      const dexNonstandard = dexNonstandardMatch
        ? dexNonstandardMatch[1]
        : null;

      // --- MERGE WITH FORMATS DATA (提前检查) ---
      const formatData = formatsMap.get(id);
      let finalIsNonstandard = dexNonstandard;

      if (formatData) {
        // If Formats has explicit isNonstandard (e.g. "Past"), it overrides Pokedex (often null)
        if (formatData.isNonstandard) {
          finalIsNonstandard = formatData.isNonstandard;
        }
      }

      // 【修改】不再基于 isNonstandard 排除宝可梦
      // 只要编号在标準范围内 (1-1025)，全部允许入库
      // 通过 Tags 来区分是否在 SV 可用
      if (num < 1 || num > 1025) {
        skipped++;
        continue;
      }

      // Extract Name
      const nameMatch = entryContent.match(/name:\s*["']([^"']+)["']/);
      const name = nameMatch ? nameMatch[1] : id;

      // Extract Types
      const typesMatch = entryContent.match(/types:\s*\[([^\]]+)\]/);
      const types = typesMatch
        ? typesMatch[1]
            .replace(/['"]/g, "")
            .split(",")
            .map((t) => t.trim())
        : [];

      // Extract Stats
      const baseStatsMatch = entryContent.match(/baseStats:\s*\{([^}]+)\}/);
      const stats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      if (baseStatsMatch) {
        const statStr = baseStatsMatch[1];
        stats.hp = parseInt(statStr.match(/hp:\s*(\d+)/)?.[1] || "0");
        stats.atk = parseInt(statStr.match(/atk:\s*(\d+)/)?.[1] || "0");
        stats.def = parseInt(statStr.match(/def:\s*(\d+)/)?.[1] || "0");
        stats.spa = parseInt(statStr.match(/spa:\s*(\d+)/)?.[1] || "0");
        stats.spd = parseInt(statStr.match(/spd:\s*(\d+)/)?.[1] || "0");
        stats.spe = parseInt(statStr.match(/spe:\s*(\d+)/)?.[1] || "0");
      }
      const bst =
        stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe;

      // Extract Abilities
      const abilitiesMatch = entryContent.match(/abilities:\s*\{([^}]+)\}/);
      const abilities = abilitiesMatch
        ? abilitiesMatch[1]
            .match(/['"]([^'"]+)['"]/g)
            ?.map((s) => s.replace(/['"]/g, "")) || []
        : [];

      // Extract Height/Weight
      const heightMatch = entryContent.match(/heightm:\s*([\d.]+)/);
      const heightm = heightMatch ? parseFloat(heightMatch[1]) : 0;
      const weightMatch = entryContent.match(/weightkg:\s*([\d.]+)/);
      const weightkg = weightMatch ? parseFloat(weightMatch[1]) : 0;

      // Extract Color
      const colorMatch = entryContent.match(/color:\s*["']([^"']+)["']/);
      const color = colorMatch ? colorMatch[1] : "";

      // Extract Egg Groups
      const eggGroupsMatch = entryContent.match(/eggGroups:\s*\[([^\]]+)\]/);
      const eggGroups = eggGroupsMatch
        ? eggGroupsMatch[1]
            .replace(/['"]/g, "")
            .split(",")
            .map((t) => t.trim())
        : [];

      // Base Generation from Num & Suffixes
      const gen = getGeneration(num, id);

      // Get tier from formats data (isNonstandard 已经在上面检查过了)
      const tier = formatData?.tier || null;

      // Get Chinese Name
      const nameCn = getChineseName(name, num, id);

      // Extract isForme and baseSpecies（forme 已经在上面检查过了）
      const isForme = !!formeMatch && forme !== null;
      const baseSpeciesMatch = entryContent.match(
        /baseSpecies:\s*["']([^"']+)["']/,
      );
      const baseSpecies = baseSpeciesMatch ? baseSpeciesMatch[1] : null;

      // --- MERGE TAGS FOR INHERITANCE ---
      const baseId = toID(baseSpecies);
      const baseTags = (baseId ? rawTagsMap.get(baseId) : null) || [];
      const mergedRawTags = Array.from(new Set([...rawTags, ...baseTags]));

      if (baseId && baseTags.length > 0 && rawTags.length === 0) {
        // Log inheritance for confirmation (first 10 relevant ones)
        if (updated < 100 && mergedRawTags.length > 0) {
          // Silent normally, but logic is active
        }
      }

      // Calculate Tags（传入 num、isNonstandard、tier, mergedRawTags, battleOnly, isGmax, baseSpecies)
      const tags = getPokemonTags(
        name,
        num,
        finalIsNonstandard,
        tier,
        mergedRawTags,
        battleOnly || null,
        isGmax,
        baseSpecies,
      );

      // Upsert Database Record（更新已存在的，创建新的）
      try {
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
        };

        await prisma.pokemon.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        });

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
        };

        updated++;
        if (updated % 100 === 0) {
          console.log(`Updated ${updated}: ${name} (BST: ${bst})`);
        }
      } catch (err) {
        console.error(`Error updating ${id}:`, err);
        notFound++;
      }
    }

    // 保存本地快照（JSON 格式，便于后续使用）
    const snapshotPath = path.join(
      process.cwd(),
      "app/lib/data/pokemon/pokedex-snapshot.json",
    );
    console.log(`\n💾 Saving snapshot to ${snapshotPath}...`);
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify(snapshotData, null, 2),
      "utf-8",
    );
    console.log(
      `   Snapshot saved: ${Object.keys(snapshotData).length} entries`,
    );

    // 清理：删除那些 tier 为 "Illegal" 且没有被任何比赛引用的 Pokemon
    // 这样可以清理旧数据，但不会破坏正在进行的比赛
    console.log(`\n🧹 清理未使用的非法 Pokemon...`);
    const illegalPokemon = await prisma.pokemon.findMany({
      where: {
        tier: "Illegal",
      },
      select: {
        id: true,
        name: true,
        pools: { select: { id: true }, take: 1 },
        owned: { select: { id: true }, take: 1 },
      },
    });

    const unusedIllegalIds: string[] = [];
    for (const p of illegalPokemon) {
      // 如果这个 Pokemon 没有被任何 PokemonPool 或 OwnedPokemon 引用，可以安全删除
      if (p.pools.length === 0 && p.owned.length === 0) {
        unusedIllegalIds.push(p.id);
      }
    }

    if (unusedIllegalIds.length > 0) {
      const deleteResult = await prisma.pokemon.deleteMany({
        where: {
          id: { in: unusedIllegalIds },
        },
      });
      console.log(`   ✓ 已删除 ${deleteResult.count} 个未使用的非法 Pokemon`);
    } else {
      console.log(
        `   ✓ 没有需要清理的 Pokemon（所有非法 Pokemon 都被比赛引用）`,
      );
    }

    console.log(`\n✅ Stage 3 complete: 宝可梦数据已导入数据库`);
    console.log(`   Updated/Created: ${updated}`);
    console.log(`   Skipped (excluded forms): ${skipped}`);
  } catch (error) {
    console.error("❌ Error importing Pokemon:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 执行
importPokemon();
