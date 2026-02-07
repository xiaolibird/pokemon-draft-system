export const TYPE_COLORS: Record<string, string> = {
  Normal: "#A8A77A",
  Fire: "#EE8130",
  Water: "#6390F0",
  Electric: "#F7D02C",
  Grass: "#7AC74C",
  Ice: "#96D9D6",
  Fighting: "#C22E28",
  Poison: "#A33EA1",
  Ground: "#E2BF65",
  Flying: "#A98FF3",
  Psychic: "#F95587",
  Bug: "#A6B91A",
  Rock: "#B6A136",
  Ghost: "#735797",
  Dragon: "#6F35FC",
  Dark: "#705746",
  Steel: "#B7B7CE",
  Fairy: "#D685AD",
};

/**
 * 合体宝可梦互斥组
 * 游戏规则：每组中只能拥有一个
 * 例如：如果你有 Calyrex-Ice，就不能再选 Calyrex 或 Calyrex-Shadow
 */
export const FUSION_EXCLUSIVE_GROUPS: string[][] = [
  // 蕾冠王系列 (Calyrex + 雪暴马/灵幽马)
  ["calyrex", "calyrexice", "calyrexshadow"],
  // 奈克洛兹玛系列 (Necrozma + 索尔迦雷欧/露奈雅拉)
  ["necrozma", "necrozmadawnwings", "necrozmaduskmane"],
  // 酋雷姆系列 (Kyurem + 捷克罗姆/莱希拉姆)
  ["kyurem", "kyuremblack", "kyuremwhite"],
];

/**
 * 检查是否可以选择某个宝可梦（基于互斥规则）
 * @param pokemonId 要选择的宝可梦 ID
 * @param ownedPokemonIds 玩家已拥有的宝可梦 ID 列表
 * @returns { allowed: boolean, conflictWith?: string } 是否允许，如果不允许则返回冲突的宝可梦
 */
export function checkFusionExclusive(
  pokemonId: string,
  ownedPokemonIds: string[],
): { allowed: boolean; conflictWith?: string; groupName?: string } {
  // 标准化 ID（去掉连字符，转小写）
  const normalizeId = (id: string) => id.toLowerCase().replace(/-/g, "");
  const normalizedTarget = normalizeId(pokemonId);
  const normalizedOwned = ownedPokemonIds.map(normalizeId);

  for (const group of FUSION_EXCLUSIVE_GROUPS) {
    // 检查目标宝可梦是否在这个互斥组中
    if (group.includes(normalizedTarget)) {
      // 检查玩家是否已拥有这个组中的其他宝可梦
      for (const ownedId of normalizedOwned) {
        if (group.includes(ownedId) && ownedId !== normalizedTarget) {
          // 找到冲突
          const groupNames: Record<string, string> = {
            calyrex: "蕾冠王系列",
            necrozma: "奈克洛兹玛系列",
            kyurem: "酋雷姆系列",
          };
          const groupName = groupNames[group[0]] || "合体宝可梦";
          return {
            allowed: false,
            conflictWith: ownedId,
            groupName,
          };
        }
      }
    }
  }

  return { allowed: true };
}
