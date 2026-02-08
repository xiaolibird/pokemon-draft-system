/**
 * DP 可行性检查算法
 * 用于检查价格分档设置是否完备，以及玩家操作是否可行
 *
 * 算法优化（LeetCode 向）：
 * 1. 按档位聚合 (price, count)，避免 O(N) 展开 + 排序，改为 O(T) 档位贪心
 * 2. 预计算档位结构，checkTierCompleteness 主循环复用，整体 O(T^2) 替代 O(T·N·log N)
 * 3. QuickSelect 思想：k 很小时用堆取前 k 小，但本题 k≤6、T≤10，档位聚合更简洁
 */

export interface PriceTier {
  id: string;
  name: string;
  price: number;
  pokemonIds: string[];
  count?: number; // 该分档可用的宝可梦数量
}

/** DP 目标模式：最佳=每人对每档都有方案；保底=每人至少一种选满方案 */
export type DPTargetMode = "BEST" | "MINIMUM";

/** 检查选项：是否强制选满（默认 true） */
export interface DPCheckOptions {
  requireFullTeam?: boolean; // 默认 true：必须选满 teamSize 只
}

export interface TierFixSuggestion {
  tierName: string;
  tierId: string;
  action: "add" | "reduce" | "lower_price";
  delta?: number;
  suggestedPrice?: number;
  reason: string;
}

export interface FeasibilityResult {
  feasible: boolean;
  reason?: string;
  details?: {
    tierName: string;
    tierId?: string;
    canInclude: boolean;
    minCost?: number;
    exampleComposition?: Record<string, number>;
  }[];
  /** 具体修改建议（仅 BEST 模式失败时） */
  suggestions?: TierFixSuggestion[];
}

/**
 * 检查是否能用给定的预算和宝可梦池选满指定数量的宝可梦
 * 优化：k 很小时（maxPokemon≤6）用「维护 k 最小」O(n·k) 替代全排序 O(n log n)
 *
 * @param budget 可用代币
 * @param targetCount 需要选择的宝可梦数量
 * @param availablePrices 可用的宝可梦价格列表（来自 pool，未排序）
 * @returns 是否可行
 */
export function canFillTeam(
  budget: number,
  targetCount: number,
  availablePrices: number[],
): boolean {
  if (availablePrices.length < targetCount) {
    return false;
  }

  // k≤6 时，维护大小为 k 的最小堆/有序子集，O(n·k) < O(n log n) 当 n 较大
  const k = targetCount;
  const topK: number[] = availablePrices.slice(0, k).sort((a, b) => a - b);

  for (let i = k; i < availablePrices.length; i++) {
    const p = availablePrices[i];
    if (p >= topK[k - 1]) continue;
    topK[k - 1] = p;
    for (let j = k - 1; j > 0 && topK[j] < topK[j - 1]; j--) {
      [topK[j], topK[j - 1]] = [topK[j - 1], topK[j]];
    }
  }

  const minCost = topK.reduce((sum, x) => sum + x, 0);
  return minCost <= budget;
}

/** 选秀操作 DP 检查结果（供选手界面展示建议） */
export interface DPOperationResult {
  feasible: boolean;
  reason?: string;
  /** 可操作建议，供前端展示 */
  suggestion?: string;
  /** 蛇形：当前选择下，可承受的最高单只价格（选更贵的会导致无法选满） */
  maxAffordablePrice?: number;
  /** 蛇形：选满剩余槽位最少需要的代币 */
  minRequiredForRemaining?: number;
}

/**
 * 检查在执行某个操作后，玩家是否还能选满宝可梦
 */
export function canFillTeamAfterOperation(
  currentTokens: number,
  currentPokemonCount: number,
  maxPokemon: number,
  operationCost: number,
  availablePrices: number[],
): DPOperationResult {
  const remainingTokens = currentTokens - operationCost;
  const remainingSlots = maxPokemon - currentPokemonCount - 1; // -1 因为本次操作会占用一个位置

  if (remainingSlots <= 0) {
    return { feasible: true };
  }

  if (remainingTokens < 0) {
    return {
      feasible: false,
      reason: "代币不足",
      suggestion: "请选择更便宜的宝可梦，或放弃本轮选择",
    };
  }

  if (availablePrices.length < remainingSlots) {
    return {
      feasible: false,
      reason: `池中可用宝可梦不足（需要 ${remainingSlots} 只，仅剩 ${availablePrices.length} 只）`,
      suggestion: "池中宝可梦数量不足，无法保证选满队伍，建议选择其他宝可梦",
    };
  }

  const sortedPrices = [...availablePrices].sort((a, b) => a - b);
  const minRequired = sortedPrices
    .slice(0, remainingSlots)
    .reduce((sum, p) => sum + p, 0);

  if (!canFillTeam(remainingTokens, remainingSlots, availablePrices)) {
    const maxAffordable = Math.floor(currentTokens - minRequired);
    return {
      feasible: false,
      reason: `操作后剩余 ${remainingTokens} 代币，但选满队伍最少需要 ${minRequired} 代币（还需选 ${remainingSlots} 只）`,
      suggestion:
        maxAffordable >= 0
          ? `建议选择价格 ≤ ${maxAffordable} 的宝可梦，否则无法选满 ${maxPokemon} 只`
          : "当前代币不足，无法选满队伍",
      maxAffordablePrice: maxAffordable >= 0 ? maxAffordable : undefined,
      minRequiredForRemaining: minRequired,
    };
  }

  return { feasible: true };
}

/**
 * 最优模式：每个选手对每个档位都至少有一种「包含该档」的组合
 * 综合考虑：价格分档、每档个数、选手数
 * 条件：每档 count≥N；对每档 T，N 人每人「1只T+5只其他」可行
 */
export function checkTierCompleteness(
  tiers: PriceTier[],
  playerTokens: number,
  maxPokemon: number,
  playerCount: number,
  options?: DPCheckOptions,
): FeasibilityResult {
  const requireFull = options?.requireFullTeam !== false;
  const teamSize = maxPokemon;
  const otherSlots = teamSize - 1; // 5

  const totalAssigned = tiers.reduce((sum, t) => sum + t.pokemonIds.length, 0);
  if (totalAssigned === 0) {
    return { feasible: false, reason: "没有任何宝可梦被分配到价格分档" };
  }

  const tierDetails: FeasibilityResult["details"] = [];
  const nonEmptyTiers = tiers.filter((t) => t.pokemonIds.length > 0);

  // 1. 先过保底（每人能选满）
  const minimalResult = checkTierCompletenessMinimal(
    tiers,
    playerTokens,
    maxPokemon,
    playerCount,
    options,
  );
  if (!minimalResult.feasible) {
    return { ...minimalResult, details: [] };
  }

  // 2. 对每个非空档位，检查 N 人每人都有「1只该档+5只其他」方案
  for (const tier of tiers) {
    if (tier.pokemonIds.length === 0) {
      tierDetails.push({ tierName: tier.name, canInclude: false });
      continue;
    }

    // 2a. 该档至少 N 只（每人 1 只）
    if (tier.pokemonIds.length < playerCount) {
      tierDetails.push({
        tierName: tier.name,
        tierId: tier.id,
        canInclude: false,
        minCost: tier.price + 999999, // 占位，建议会提示增加只数
      });
      continue;
    }

    // 2b. 「其他」池：全体减去 N 只该档（每人预留 1 只）
    const othersSlots: TierSlot[] = nonEmptyTiers
      .map((t) => ({
        price: t.price,
        count:
          t.id === tier.id
            ? Math.max(0, t.pokemonIds.length - playerCount)
            : t.pokemonIds.length,
        tierId: t.id,
      }))
      .filter((t) => t.count > 0)
      .sort((a, b) => a.price - b.price);

    const othersTotal = othersSlots.reduce((s, t) => s + t.count, 0);
    if (othersTotal < playerCount * otherSlots) {
      tierDetails.push({
        tierName: tier.name,
        tierId: tier.id,
        canInclude: false,
        minCost: tier.price, // 其他池不足，需增加低价档
      });
      continue;
    }

    // 2c. 每人 i：cost[T] + sum(第 i*5+1～(i+1)*5 小 from others) <= budget
    let canInclude = true;
    let maxCost = 0;
    for (let i = 0; i < playerCount; i++) {
      const { sum: othersCost, valid } = sumOfKthSmallestRange(
        othersSlots,
        i * otherSlots + 1,
        otherSlots,
      );
      const totalCost = tier.price + othersCost;
      if (!valid || totalCost > playerTokens) {
        canInclude = false;
        maxCost = Math.max(maxCost, totalCost);
        break;
      }
    }

    tierDetails.push({
      tierName: tier.name,
      tierId: tier.id,
      canInclude,
      minCost: canInclude
        ? tier.price + sumOfKthSmallestRange(othersSlots, 1, otherSlots).sum
        : maxCost,
    });
  }

  const allCanBeIncluded = tierDetails.every((d) => d.canInclude);
  if (!allCanBeIncluded) {
    const problematic = tierDetails.filter((d) => !d.canInclude);
    const suggestions = computeTierFixSuggestions(
      tiers,
      tierDetails,
      playerTokens,
      maxPokemon,
      playerCount,
    );
    return {
      feasible: false,
      reason: `以下分档无法让 ${playerCount} 名选手每人都有包含方案: ${problematic.map((t) => t.tierName).join(", ")}`,
      details: tierDetails,
      suggestions,
    };
  }

  return { feasible: true, details: tierDetails };
}

/** 档位聚合：(price, count, tierId) 按 price 升序，用于 O(T) 贪心 */
interface TierSlot {
  price: number;
  count: number;
  tierId: string;
}

/**
 * 从档位聚合中计算第 start 到 start+count-1 小的价格之和（1-based）
 * 用于多人竞争：第 i 个玩家的最便宜组合 = 第 (6i+1)～(6i+6) 小
 * O(T) 遍历档位
 */
function sumOfKthSmallestRange(
  tierSlots: TierSlot[],
  start1Based: number,
  count: number,
): { sum: number; valid: boolean } {
  if (count <= 0) return { sum: 0, valid: true };
  const total = tierSlots.reduce((s, t) => s + t.count, 0);
  const end = start1Based + count - 1;
  if (end > total) return { sum: Infinity, valid: false };

  let sum = 0;
  let pos = 1; // 1-based 当前位置
  for (const { price, count: c } of tierSlots) {
    const segStart = pos;
    const segEnd = pos + c - 1;
    pos += c;
    const overlapStart = Math.max(segStart, start1Based);
    const overlapEnd = Math.min(segEnd, end);
    if (overlapStart <= overlapEnd) {
      sum += (overlapEnd - overlapStart + 1) * price;
    }
    if (pos > end) break;
  }
  return { sum, valid: true };
}

/**
 * 从档位聚合中贪心选 k 只最便宜的总价
 * 类似 LeetCode 多路归并 / 贪心，O(T) 替代 O(N log N)
 */
function minCostToPickK(
  tierSlots: TierSlot[],
  k: number,
): { cost: number; composition: Record<string, number> } {
  const composition: Record<string, number> = {};
  let cost = 0;
  let remain = k;
  for (const { price, count, tierId } of tierSlots) {
    const take = Math.min(remain, count);
    if (take > 0) {
      composition[tierId] = (composition[tierId] || 0) + take;
      cost += take * price;
      remain -= take;
    }
    if (remain <= 0) break;
  }
  return { cost: remain > 0 ? Infinity : cost, composition };
}

/**
 * 检查是否存在一种方案能包含指定分档的至少一只宝可梦
 * 优化：按档位聚合 O(T) 贪心，替代 O(N) 展开 + O(N log N) 排序
 */
function canIncludeTier(
  tiers: PriceTier[],
  targetTier: PriceTier,
  budget: number,
  teamSize: number,
): {
  canInclude: boolean;
  minCost?: number;
  composition?: Record<string, number>;
} {
  const otherSlots = teamSize - 1;
  const costForTarget = targetTier.price;
  const remainingBudget = budget - costForTarget;

  if (remainingBudget < 0) {
    return { canInclude: false };
  }

  // 构建档位聚合（按 price 升序），目标档 count-1
  const tierSlots: TierSlot[] = tiers
    .filter((t) => t.pokemonIds.length > 0)
    .map((t) => ({
      price: t.price,
      count:
        t.id === targetTier.id
          ? Math.max(0, t.pokemonIds.length - 1)
          : t.pokemonIds.length,
      tierId: t.id,
    }))
    .sort((a, b) => a.price - b.price);

  const totalAvailable = tierSlots.reduce((s, t) => s + t.count, 0);
  if (totalAvailable < otherSlots) {
    return { canInclude: false };
  }

  const { cost: totalOtherCost, composition: otherComp } = minCostToPickK(
    tierSlots,
    otherSlots,
  );

  if (totalOtherCost > remainingBudget) {
    return { canInclude: false, minCost: costForTarget + totalOtherCost };
  }

  const composition: Record<string, number> = {
    [targetTier.id]: 1,
    ...otherComp,
  };

  return {
    canInclude: true,
    minCost: costForTarget + totalOtherCost,
    composition,
  };
}

/**
 * 计算「分档无法被包含」时的具体修改建议
 */
function computeTierFixSuggestions(
  tiers: PriceTier[],
  tierDetails: NonNullable<FeasibilityResult["details"]>,
  playerTokens: number,
  maxPokemon: number,
  playerCount: number,
): TierFixSuggestion[] {
  const suggestions: TierFixSuggestion[] = [];
  const added = new Set<string>();
  const problematic = tierDetails.filter((d) => !d.canInclude);
  if (problematic.length === 0) return [];

  const cheapestTier = [...tiers]
    .filter((t) => t.pokemonIds.length > 0)
    .sort((a, b) => a.price - b.price)[0];

  for (const d of problematic) {
    const tier = tiers.find((t) => t.name === d.tierName);
    if (!tier) continue;

    // 方案 0：该档数量不足 N 人
    if (tier.pokemonIds.length < playerCount) {
      const need = playerCount - tier.pokemonIds.length;
      suggestions.push({
        tierName: tier.name,
        tierId: tier.id,
        action: "add",
        delta: need,
        reason: `分档 ${tier.name} 需至少 ${playerCount} 只（${playerCount} 人各 1 只），当前 ${tier.pokemonIds.length} 只，建议增加 ${need} 只`,
      });
      continue;
    }

    const minCost = d.minCost;
    if (minCost == null || minCost > 1e6) continue;

    const costForTarget = tier.price;
    const remainingBudget = playerTokens - costForTarget;
    const otherSlots = maxPokemon - 1;

    // 方案 A：降低该分档价格
    const minOtherCost = minCost - costForTarget;
    const suggestedPrice = playerTokens - minOtherCost;
    if (suggestedPrice >= 0 && suggestedPrice < tier.price) {
      suggestions.push({
        tierName: tier.name,
        tierId: tier.id,
        action: "lower_price",
        suggestedPrice,
        reason: `分档 ${tier.name} 价格 ${tier.price} 过高，建议降至 ${suggestedPrice} 以使「1只${tier.name}+${otherSlots}只其他」可行`,
      });
    }

    // 方案 B：在最低价分档增加宝可梦
    if (cheapestTier && cheapestTier.id !== tier.id) {
      const key = `add:${cheapestTier.id}`;
      if (!added.has(key)) {
        const needForCheapest = Math.max(
          0,
          playerCount - cheapestTier.pokemonIds.length,
        );
        const needForOthers = Math.max(
          0,
          playerCount * (maxPokemon - 1) -
            tiers.reduce(
              (s, t) =>
                s +
                (t.id === tier.id
                  ? Math.max(0, t.pokemonIds.length - playerCount)
                  : t.pokemonIds.length),
              0,
            ),
        );
        const needCount = Math.max(1, needForCheapest, needForOthers);
        added.add(key);
        suggestions.push({
          tierName: cheapestTier.name,
          tierId: cheapestTier.id,
          action: "add",
          delta: needCount,
          reason: `分档 ${cheapestTier.name} 增加 ${needCount} 只，使 ${playerCount} 人各有包含各档位的方案`,
        });
      }
    }
  }

  return suggestions;
}

/**
 * 计算「无法选满队伍」时的修改建议（多人版）
 */
function computeFillTeamFixSuggestionsMulti(
  tiers: PriceTier[],
  playerTokens: number,
  maxPokemon: number,
  playerCount: number,
): TierFixSuggestion[] {
  const fullSlots: TierSlot[] = tiers
    .filter((t) => t.pokemonIds.length > 0)
    .map((t) => ({ price: t.price, count: t.pokemonIds.length, tierId: t.id }))
    .sort((a, b) => a.price - b.price);

  const totalNeeded = playerCount * maxPokemon;
  const totalAssigned = fullSlots.reduce((s, t) => s + t.count, 0);
  if (totalAssigned < totalNeeded) {
    const cheapestTier = tiers
      .filter((t) => t.pokemonIds.length > 0)
      .sort((a, b) => a.price - b.price)[0];
    if (cheapestTier) {
      return [
        {
          tierName: cheapestTier.name,
          tierId: cheapestTier.id,
          action: "add",
          delta: totalNeeded - totalAssigned,
          reason: `需至少 ${totalNeeded} 只（${playerCount} 人×${maxPokemon}），当前 ${totalAssigned}，建议在低价档增加 ${totalNeeded - totalAssigned} 只`,
        },
      ];
    }
  }

  // 找到第一个超预算的选手
  for (let i = 0; i < playerCount; i++) {
    const { sum } = sumOfKthSmallestRange(
      fullSlots,
      i * maxPokemon + 1,
      maxPokemon,
    );
    if (sum > playerTokens) {
      const shortfall = sum - playerTokens;
      const cheapestTier = tiers
        .filter((t) => t.pokemonIds.length > 0)
        .sort((a, b) => a.price - b.price)[0];
      if (cheapestTier) {
        const addCount = Math.ceil(shortfall / cheapestTier.price);
        return [
          {
            tierName: cheapestTier.name,
            tierId: cheapestTier.id,
            action: "add",
            delta: addCount,
            reason: `第 ${i + 1} 名选手最便宜组合需 ${sum}，超出 ${shortfall}，建议分档 ${cheapestTier.name} 增加 ${addCount} 只`,
          },
        ];
      }
    }
  }
  return [];
}

/**
 * 计算「无法选满队伍」时的修改建议（单人版，兼容旧调用）
 */
function computeFillTeamFixSuggestions(
  tiers: PriceTier[],
  playerTokens: number,
  maxPokemon: number,
): TierFixSuggestion[] {
  const fullSlots: TierSlot[] = tiers
    .filter((t) => t.pokemonIds.length > 0)
    .map((t) => ({ price: t.price, count: t.pokemonIds.length, tierId: t.id }))
    .sort((a, b) => a.price - b.price);
  const { cost: minCost } = minCostToPickK(fullSlots, maxPokemon);
  const shortfall = minCost - playerTokens;
  if (shortfall <= 0) return [];

  const cheapestTier = [...tiers]
    .filter((t) => t.pokemonIds.length > 0)
    .sort((a, b) => a.price - b.price)[0];
  if (!cheapestTier) return [];

  // 需要增加的「低价位」数量：使最便宜组合总价下降 shortfall
  // 每只最便宜的可节省 (次低价 - 最低价)，简化：增加 ceil(shortfall / 最低价) 只到最便宜档
  const addCount = Math.ceil(shortfall / cheapestTier.price);
  return [
    {
      tierName: cheapestTier.name,
      tierId: cheapestTier.id,
      action: "add",
      delta: addCount,
      reason: `分档 ${cheapestTier.name} 增加 ${addCount} 只，可降低最便宜组合成本约 ${shortfall} 代币，使选满队伍可行`,
    },
  ];
}

/**
 * 保底模式：每个选手都至少有一种方式选满队伍
 * 综合考虑：价格分档、每档个数、选手数
 * 充分条件：池中按价排序后，第 i 个选手拿第 (6i+1)～(6i+6) 便宜，每人总价 ≤ 预算
 */
export function checkTierCompletenessMinimal(
  tiers: PriceTier[],
  playerTokens: number,
  maxPokemon: number,
  playerCount: number,
  options?: DPCheckOptions,
): FeasibilityResult {
  const requireFull = options?.requireFullTeam !== false;
  const teamSize = requireFull ? maxPokemon : maxPokemon;

  const totalAssigned = tiers.reduce((sum, t) => sum + t.pokemonIds.length, 0);
  if (totalAssigned === 0) {
    return { feasible: false, reason: "没有任何宝可梦被分配到价格分档" };
  }

  const fullSlots: TierSlot[] = tiers
    .filter((t) => t.pokemonIds.length > 0)
    .map((t) => ({ price: t.price, count: t.pokemonIds.length, tierId: t.id }))
    .sort((a, b) => a.price - b.price);

  // 1. 总量检查
  const totalNeeded = playerCount * teamSize;
  if (totalAssigned < totalNeeded) {
    const cheapest = fullSlots[0];
    return {
      feasible: false,
      reason: `池中仅 ${totalAssigned} 只，需要 ${totalNeeded} 只（${playerCount} 人 × ${teamSize} 只）`,
      suggestions: [
        {
          tierName: cheapest ? "最低价档" : "任意档",
          tierId: cheapest?.tierId ?? "",
          action: "add",
          delta: totalNeeded - totalAssigned,
          reason: `至少增加 ${totalNeeded - totalAssigned} 只宝可梦以满足 ${playerCount} 名选手`,
        },
      ],
    };
  }

  // 2. 每人最坏情况：第 i 人拿第 (i*teamSize+1)～((i+1)*teamSize) 便宜
  for (let i = 0; i < playerCount; i++) {
    const { sum, valid } = sumOfKthSmallestRange(
      fullSlots,
      i * teamSize + 1,
      teamSize,
    );
    if (!valid || sum > playerTokens) {
      const suggestions = computeFillTeamFixSuggestionsMulti(
        tiers,
        playerTokens,
        maxPokemon,
        playerCount,
      );
      return {
        feasible: false,
        reason: `第 ${i + 1} 名选手的最便宜组合需 ${sum} 代币，超过预算 ${playerTokens}`,
        suggestions,
      };
    }
  }

  return { feasible: true };
}

/**
 * 检查竞拍模式下是否可行
 * 在竞拍模式下，每只宝可梦的最终价格可能高于起拍价
 * 我们使用起拍价作为最低估计
 *
 * Bug Fix #5: 增加更保守的检查，考虑其他玩家也需要宝可梦
 *
 * @param currentTokens 当前代币
 * @param currentPokemonCount 当前宝可梦数
 * @param maxPokemon 最大宝可梦数
 * @param bidAmount 本次出价金额
 * @param auctionBasePrice 起拍价
 * @param availableCount 可用宝可梦数量
 * @param otherPlayersNeedCount 其他玩家还需要的宝可梦总数（可选，用于更精确的检查）
 */
/** 竞拍出价 DP 检查结果 */
export interface DPBidResult extends DPOperationResult {
  /** 为选满队伍，本次出价不应超过此值 */
  maxBidAmount?: number;
}

export function canFillTeamAfterBid(
  currentTokens: number,
  currentPokemonCount: number,
  maxPokemon: number,
  bidAmount: number,
  auctionBasePrice: number,
  availableCount: number,
  otherPlayersNeedCount?: number,
): DPBidResult {
  const remainingTokens = currentTokens - bidAmount;
  const remainingSlots = maxPokemon - currentPokemonCount - 1;

  if (remainingSlots <= 0) return { feasible: true };

  if (remainingTokens < 0) {
    return {
      feasible: false,
      reason: "代币不足",
      suggestion: "当前出价超过剩余代币，请降低出价",
      maxBidAmount: currentTokens,
    };
  }

  const minRequired = remainingSlots * auctionBasePrice;
  let actualAvailable = availableCount - 1;
  if (otherPlayersNeedCount !== undefined && otherPlayersNeedCount > 0) {
    const reservedForOthers = Math.floor(otherPlayersNeedCount * 0.5);
    actualAvailable = Math.max(0, actualAvailable - reservedForOthers);
  }

  if (actualAvailable < remainingSlots) {
    return {
      feasible: false,
      reason: `池中可用宝可梦不足（需要 ${remainingSlots} 只，仅剩 ${actualAvailable} 只可用）`,
      suggestion: "池中宝可梦不足，建议放弃本次竞拍或降低出价",
    };
  }

  if (remainingTokens < minRequired) {
    const maxBid = currentTokens - minRequired;
    return {
      feasible: false,
      reason: `出价后剩余 ${remainingTokens} 代币，但选满队伍最少需要 ${minRequired} 代币（还需 ${remainingSlots} 只，每只至少 ${auctionBasePrice}）`,
      suggestion:
        maxBid >= 0
          ? `建议出价不超过 ${maxBid}，否则无法用剩余代币选满 ${maxPokemon} 只`
          : "当前代币不足，无法选满队伍",
      maxBidAmount: maxBid >= 0 ? maxBid : undefined,
      minRequiredForRemaining: minRequired,
    };
  }

  return { feasible: true };
}

/**
 * 计算所有其他玩家还需要的宝可梦总数
 */
export function calculateOtherPlayersNeed(
  players: { id: string; ownedCount: number }[],
  currentPlayerId: string,
  maxPokemon: number,
): number {
  return players
    .filter((p) => p.id !== currentPlayerId)
    .reduce((sum, p) => sum + Math.max(0, maxPokemon - p.ownedCount), 0);
}

/**
 * 获取玩家操作后可用的宝可梦价格列表
 * 用于 Snake 模式
 */
export function getAvailablePricesAfterPick(
  pokemonPool: { id: string; basePrice: number; status: string }[],
  excludePoolId: string,
): number[] {
  return pokemonPool
    .filter((p) => p.status === "AVAILABLE" && p.id !== excludePoolId)
    .map((p) => p.basePrice);
}

/**
 * 为竞拍模式计算可用宝可梦数量
 */
export function getAvailableCountForAuction(
  pokemonPool: { id: string; status: string }[],
  excludePoolId?: string,
): number {
  return pokemonPool.filter(
    (p) =>
      p.status === "AVAILABLE" && (!excludePoolId || p.id !== excludePoolId),
  ).length;
}
