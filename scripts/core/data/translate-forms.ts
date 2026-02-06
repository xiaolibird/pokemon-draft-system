import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

/**
 * Stage 4: 宝可梦中文名翻译
 *
 * 在 import-pokemon（Stage 3）之后执行。
 * 1. 基础翻译：names-cn-full.json + 后缀启发式（Mega/地区形态等）
 * 2. 形态覆盖：硬编码的 curated 翻译（形态花样多，只能手写）
 */

const prisma = new PrismaClient()

const CN_NAMES_PATH = path.join(
  process.cwd(),
  'app/lib/data/names-cn-full.json',
)

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

/** 形态 curated 翻译（硬编码，来源原 forms_need_translation.md，已排除 x 标记） */
const FORM_TRANSLATIONS: Record<string, string> = {
  pikachuhoenn: '皮卡丘-丰源',
  pikachukalos: '皮卡丘-卡洛斯',
  pikachuoriginal: '皮卡丘-初始',
  pikachupartner: '皮卡丘-就决定是你了',
  pikachusinnoh: '皮卡丘-神奥',
  pikachuunova: '皮卡丘-合众',
  pikachuworld: '皮卡丘-世界',
  taurospaldeacombat: '肯泰罗-帕底亚的样子 (斗战种)',
  taurospaldeablaze: '肯泰罗-帕底亚的样子 (火炽种)',
  taurospaldeaaqua: '肯泰罗-帕底亚的样子 (水澜种)',
  deoxysattack: '代欧奇希斯-攻击',
  deoxysdefense: '代欧奇希斯-防御',
  deoxysspeed: '代欧奇希斯-速度',
  rotomfan: '洛托姆-旋转',
  rotomfrost: '洛托姆-结冰',
  rotomheat: '洛托姆-加热',
  rotommow: '洛托姆-切割',
  rotomwash: '洛托姆-清洗',
  dialgaorigin: '帝牙卢卡-起源',
  palkiaorigin: '帕路奇亚-起源',
  giratinaorigin: '骑拉帝纳-起源',
  shayminsky: '谢米-天空形态',
  arceusbug: '阿尔宙斯-虫',
  arceusdark: '阿尔宙斯-恶',
  arceusdragon: '阿尔宙斯-龙',
  arceuselectric: '阿尔宙斯-电',
  arceusfairy: '阿尔宙斯-妖精',
  arceusfighting: '阿尔宙斯-格斗',
  arceusfire: '阿尔宙斯-火',
  arceusflying: '阿尔宙斯-飞行',
  arceusghost: '阿尔宙斯-幽灵',
  arceusgrass: '阿尔宙斯-草',
  arceusground: '阿尔宙斯-地面',
  arceusice: '阿尔宙斯-冰',
  arceuspoison: '阿尔宙斯-毒',
  arceuspsychic: '阿尔宙斯-超能',
  arceusrock: '阿尔宙斯-岩石',
  arceussteel: '阿尔宙斯-钢',
  arceuswater: '阿尔宙斯-水',
  basculinbluestriped: '野蛮鲈鱼-蓝条纹',
  basculinwhitestriped: '野蛮鲈鱼-白条纹',
  tornadustherian: '龙卷云-灵兽',
  thundurustherian: '雷电云-灵兽',
  landorustherian: '土地云-灵兽',
  kyuremblack: '酋雷姆-暗黑',
  kyuremwhite: '酋雷姆-炎白',
  keldeoresolute: '凯路迪欧-觉悟的样子',
  greninjabond: '甲贺忍蛙-羁绊',
  vivillonfancy: '彩粉蝶-幻彩花纹',
  vivillonpokeball: '彩粉蝶-球球花纹',
  meowsticf: '超能妙喵-雌性',
  hoopaunbound: '胡帕-解放形态',
  oricoriopau: '花舞鸟-呼啦呼啦风格',
  oricoriopompom: '花舞鸟-啪滋啪滋风格',
  oricoriosensu: '花舞鸟-轻盈轻盈风格',
  rockruffdusk: '岩狗狗-黄昏',
  lycanrocdusk: '鬃岩狼人-黄昏',
  lycanrocmidnight: '鬃岩狼人-黑夜',
  necrozmadawnwings: '奈克洛兹玛-黄昏之鬃',
  necrozmaduskmane: '奈克洛兹玛-拂晓之翼',
  magearnaoriginal: '玛机雅娜-500年前的样子',
  toxtricitylowkey: '颤弦蝾螈-低调的样子',
  indeedeef: '爱管侍-雌性',
  zaciancrowned: '苍响-剑之王',
  zamazentacrowned: '藏玛然特-盾之王',
  urshifurapidstrike: '武道熊师-连击流',
  zarudedada: '萨戮德-阿爸',
  calyrexice: '蕾冠王-白马',
  calyrexshadow: '蕾冠王-黑马',
  ursalunabloodmoon: '月月熊-赫月',
  basculegionf: '幽尾玄鱼-雌性',
  enamorustherian: '眷恋云-灵兽',
  oinkolognef: '飘香豚-雌性',
  mausholdfour: '一家鼠-四只',
  squawkabillyblue: '怒鹦哥-蓝色',
  squawkabillywhite: '怒鹦哥-白色',
  squawkabillyyellow: '怒鹦哥-黄色',
  tatsugiridroopy: '米立龙-下垂姿势',
  tatsugiristretchy: '米立龙-平挺姿势',
  gimmighoulroaming: '索财灵-徒步形态',
  ogerponcornerstone: '厄诡椪-础石面具',
  ogerponhearthflame: '厄诡椪-火灶面具',
  ogerponwellspring: '厄诡椪-水井面具',
}

function heuristicNameCn(
  num: number,
  name: string,
  id: string,
  cnNamesList: string[],
): string | null {
  const baseNameCn = cnNamesList[num - 1]
  if (!baseNameCn) return null

  let finalNameCn = baseNameCn
  const idLower = id.toLowerCase()
  const parts = name.split('-')

  if (parts.length > 1) {
    let suffixStr = ''
    if (idLower.endsWith('megax') && !idLower.includes('mewtwo'))
      suffixStr = '超级X'
    else if (idLower.endsWith('megay') && !idLower.includes('mewtwo'))
      suffixStr = '超级Y'
    else if (idLower.includes('mega')) suffixStr = '超级'
    else if (idLower.includes('gmax')) suffixStr = '超极巨化'
    else if (idLower.includes('alola')) suffixStr = '阿罗拉'
    else if (idLower.includes('galar')) suffixStr = '伽勒尔'
    else if (idLower.includes('hisui')) suffixStr = '洗翠'
    else if (idLower.includes('paldea')) suffixStr = '帕底亚'

    if (suffixStr && !baseNameCn.includes(suffixStr)) {
      finalNameCn += `-${suffixStr}`
    }
  }

  return finalNameCn
}

async function run() {
  let cnNamesList: string[] = []
  if (fs.existsSync(CN_NAMES_PATH)) {
    cnNamesList = JSON.parse(fs.readFileSync(CN_NAMES_PATH, 'utf-8'))
    console.log(`\n📋 加载 names-cn-full.json: ${cnNamesList.length} 条`)
  } else {
    console.warn(`⚠️ ${CN_NAMES_PATH} 不存在，跳过基础翻译`)
  }

  const allPokemon = await prisma.pokemon.findMany()
  console.log(`📋 数据库宝可梦: ${allPokemon.length} 条`)

  // Step 1: 基础翻译（启发式）
  let heuristicUpdated = 0
  for (const pm of allPokemon) {
    if (cnNamesList.length === 0) break

    const finalNameCn = heuristicNameCn(pm.num, pm.name, pm.id, cnNamesList)
    if (!finalNameCn || pm.nameCn === finalNameCn) continue

    await prisma.pokemon.update({
      where: { id: pm.id },
      data: { nameCn: finalNameCn },
    })
    heuristicUpdated++
  }
  console.log(`  ✓ 基础启发式: 更新 ${heuristicUpdated}`)

  // Step 2: 形态 curated 覆盖
  let formUpdated = 0
  let formSkipped = 0
  let formNotFound = 0

  for (const [pokemonId, chineseName] of Object.entries(FORM_TRANSLATIONS)) {
    const pokemon = await prisma.pokemon.findUnique({
      where: { id: pokemonId },
    })

    if (!pokemon) {
      formNotFound++
      continue
    }

    if (pokemon.nameCn === chineseName) {
      formSkipped++
      continue
    }

    await prisma.pokemon.update({
      where: { id: pokemonId },
      data: { nameCn: chineseName },
    })
    formUpdated++
  }

  console.log(
    `  ✓ 形态覆盖: 更新 ${formUpdated} | 已有 ${formSkipped} | 未找到 ${formNotFound}`,
  )
  console.log(`\n✅ Stage 4 完成`)
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
