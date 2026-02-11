import { describe, it, expect } from "vitest";
import {
  canFillTeam,
  canFillTeamAfterOperation,
  canFillTeamAfterBid,
  checkTierCompleteness,
  checkTierCompletenessMinimal,
  calculateOtherPlayersNeed,
  getAvailablePricesAfterPick,
  getAvailableCountForAuction,
  PriceTier,
} from "./draft";

describe("Draft DP Algorithms", () => {
  describe("canFillTeam", () => {
    it("应该在空价格数组时返回 false", () => {
      expect(canFillTeam(100, 3, [])).toBe(false);
    });

    it("应该在负预算时返回 false", () => {
      expect(canFillTeam(-10, 3, [1, 2, 3])).toBe(false);
    });

    it("应该在 k=0 时返回 true", () => {
      expect(canFillTeam(100, 0, [1, 2, 3])).toBe(true);
    });

    it("应该在 k=1 且预算刚好时返回 true", () => {
      expect(canFillTeam(5, 1, [5])).toBe(true);
    });

    it("应该在 k=1 且预算不足时返回 false", () => {
      expect(canFillTeam(4, 1, [5])).toBe(false);
    });

    it("应该在预算刚好时返回 true", () => {
      expect(canFillTeam(6, 3, [1, 2, 3])).toBe(true);
    });

    it("应该处理大量数据", () => {
      const largePrices = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(canFillTeam(5050, 100, largePrices)).toBe(true);
      expect(canFillTeam(5049, 100, largePrices)).toBe(false);
    });

    it("应该在多个元素中选最便宜的", () => {
      expect(canFillTeam(10, 1, [5, 3, 7])).toBe(true);
    });

    it("应该在零预算时正确处理", () => {
      expect(canFillTeam(0, 0, [1, 2, 3])).toBe(true);
      expect(canFillTeam(0, 1, [1, 2, 3])).toBe(false);
    });

    it("应该选出最便宜的 k 个", () => {
      // 选 3 个最便宜：1+2+3=6
      expect(canFillTeam(6, 3, [10, 1, 20, 2, 30, 3])).toBe(true);
      expect(canFillTeam(5, 3, [10, 1, 20, 2, 30, 3])).toBe(false);
    });

    it("应该处理所有价格相同的情况", () => {
      expect(canFillTeam(15, 3, [5, 5, 5, 5])).toBe(true);
      expect(canFillTeam(14, 3, [5, 5, 5, 5])).toBe(false);
    });

    it("应该处理可用数量刚好等于需求的情况", () => {
      expect(canFillTeam(6, 3, [1, 2, 3])).toBe(true);
    });

    it("应该在可用数量不足时返回 false", () => {
      expect(canFillTeam(100, 5, [1, 2, 3])).toBe(false);
    });
  });

  describe("canFillTeamAfterOperation", () => {
    it("应该允许可行的操作", () => {
      const prices = [5, 5, 5, 5, 5, 20];
      const result = canFillTeamAfterOperation(100, 0, 6, 10, prices);
      expect(result.feasible).toBe(true);
    });

    it("应该在预算不足时拒绝", () => {
      const prices = [5, 5, 5, 5, 5, 20];
      const result = canFillTeamAfterOperation(30, 0, 6, 10, prices);
      expect(result.feasible).toBe(false);
      expect(result.minRequiredForRemaining).toBe(25);
    });

    it("应该在最后一个槽位时返回可行", () => {
      // currentPokemonCount = 5, maxPokemon = 6, 还剩 0 个槽位
      const result = canFillTeamAfterOperation(10, 5, 6, 10, []);
      expect(result.feasible).toBe(true);
    });

    it("应该在代币为负时拒绝", () => {
      const result = canFillTeamAfterOperation(5, 0, 6, 10, [1, 1, 1, 1, 1]);
      expect(result.feasible).toBe(false);
      expect(result.reason).toBe("代币不足");
    });

    it("应该在池中宝可梦不足时拒绝", () => {
      const result = canFillTeamAfterOperation(100, 0, 6, 10, [5, 5]);
      expect(result.feasible).toBe(false);
      expect(result.reason).toContain("池中可用宝可梦不足");
    });

    it("应该返回最高可承受价格建议", () => {
      // 100 代币, 0 已选, 最多 3, 花费 80, 剩余 [5, 5]
      // 剩余 20 代币，需选 2 只，最少 10，但 canFillTeam 会通过
      const result = canFillTeamAfterOperation(100, 0, 3, 80, [5, 5]);
      expect(result.feasible).toBe(true);
    });

    it("应该处理操作后剩余代币不够选满的情况", () => {
      // 50 代币, 0 已选, 最多 4, 花费 40, 剩余 [5, 5, 5]
      // 剩 10 代币, 需 3 只，最少 15
      const result = canFillTeamAfterOperation(50, 0, 4, 40, [5, 5, 5]);
      expect(result.feasible).toBe(false);
      expect(result.maxAffordablePrice).toBeDefined();
    });
  });

  describe("canFillTeamAfterBid", () => {
    it("应该允许可行的出价", () => {
      const result = canFillTeamAfterBid(100, 0, 6, 20, 10, 20);
      expect(result.feasible).toBe(true);
    });

    it("应该在最后一个槽位时返回可行", () => {
      const result = canFillTeamAfterBid(100, 5, 6, 100, 10, 5);
      expect(result.feasible).toBe(true);
    });

    it("应该在代币不足时拒绝", () => {
      const result = canFillTeamAfterBid(10, 0, 6, 20, 10, 20);
      expect(result.feasible).toBe(false);
      expect(result.reason).toBe("代币不足");
      expect(result.maxBidAmount).toBe(10);
    });

    it("应该在出价后代币不够选满时拒绝", () => {
      // 100 代币，已有 0 只，最多 6，出 60，基础价 10
      // 剩 40 代币，还需 5 只，最少 50
      const result = canFillTeamAfterBid(100, 0, 6, 60, 10, 20);
      expect(result.feasible).toBe(false);
      expect(result.maxBidAmount).toBeDefined();
      expect(result.minRequiredForRemaining).toBe(50);
    });

    it("应该在可用宝可梦不足时拒绝", () => {
      const result = canFillTeamAfterBid(100, 0, 6, 10, 10, 3);
      expect(result.feasible).toBe(false);
      expect(result.reason).toContain("池中可用宝可梦不足");
    });

    it("应该考虑其他玩家的需求减少可用数量", () => {
      // 不传 otherPlayersNeedCount
      const result1 = canFillTeamAfterBid(100, 0, 6, 10, 10, 10);
      expect(result1.feasible).toBe(true);

      // 传入 otherPlayersNeedCount，使可用数量减少
      const result2 = canFillTeamAfterBid(100, 0, 6, 10, 10, 10, 20);
      // 可用 = 10-1 - floor(20*0.5) = 9-10 = 0 < 5
      expect(result2.feasible).toBe(false);
    });

    it("应该返回建议的最大出价金额", () => {
      // 100 代币，0 已选，最多 3，基础价 10
      // 还需 2 只，最少 20
      // maxBid = 100 - 20 = 80
      const result = canFillTeamAfterBid(100, 0, 3, 90, 10, 10);
      expect(result.feasible).toBe(false);
      expect(result.maxBidAmount).toBe(80);
    });

    it("当代币极低时 maxBid < 0，提示无法选满", () => {
      // 5 代币，0 已选，最多 6，出价 3，基础价 10
      // remainingTokens = 2, remainingSlots = 5, minRequired = 50
      // maxBid = 5 - 50 = -45 < 0
      const result = canFillTeamAfterBid(5, 0, 6, 3, 10, 20);
      expect(result.feasible).toBe(false);
      expect(result.suggestion).toContain("无法选满队伍");
      expect(result.maxBidAmount).toBeUndefined();
    });
  });

  describe("calculateOtherPlayersNeed", () => {
    it("应该计算其他玩家还需要的宝可梦总数", () => {
      const players = [
        { id: "p1", ownedCount: 2 },
        { id: "p2", ownedCount: 4 },
        { id: "p3", ownedCount: 0 },
      ];
      // 排除 p1，p2 需要 6-4=2，p3 需要 6-0=6，总计 8
      expect(calculateOtherPlayersNeed(players, "p1", 6)).toBe(8);
    });

    it("应该排除当前玩家", () => {
      const players = [
        { id: "p1", ownedCount: 0 },
        { id: "p2", ownedCount: 0 },
      ];
      expect(calculateOtherPlayersNeed(players, "p1", 6)).toBe(6);
    });

    it("应该处理所有玩家已满的情况", () => {
      const players = [
        { id: "p1", ownedCount: 6 },
        { id: "p2", ownedCount: 6 },
        { id: "p3", ownedCount: 6 },
      ];
      expect(calculateOtherPlayersNeed(players, "p1", 6)).toBe(0);
    });

    it("应该处理超过上限的已有数量", () => {
      const players = [
        { id: "p1", ownedCount: 0 },
        { id: "p2", ownedCount: 10 }, // 超过上限
      ];
      // Max(0, 6-10) = 0
      expect(calculateOtherPlayersNeed(players, "p1", 6)).toBe(0);
    });

    it("应该处理空玩家列表", () => {
      expect(calculateOtherPlayersNeed([], "p1", 6)).toBe(0);
    });
  });

  describe("getAvailablePricesAfterPick", () => {
    it("应该返回排除指定 ID 后的可用价格列表", () => {
      const pool = [
        { id: "pool1", basePrice: 10, status: "AVAILABLE" },
        { id: "pool2", basePrice: 20, status: "AVAILABLE" },
        { id: "pool3", basePrice: 30, status: "DRAFTED" },
        { id: "pool4", basePrice: 5, status: "AVAILABLE" },
      ];
      const prices = getAvailablePricesAfterPick(pool, "pool1");
      expect(prices).toEqual([20, 5]);
    });

    it("应该排除已选的宝可梦", () => {
      const pool = [
        { id: "pool1", basePrice: 10, status: "DRAFTED" },
        { id: "pool2", basePrice: 20, status: "AVAILABLE" },
      ];
      const prices = getAvailablePricesAfterPick(pool, "pool2");
      expect(prices).toEqual([]);
    });

    it("应该处理空池子", () => {
      const prices = getAvailablePricesAfterPick([], "pool1");
      expect(prices).toEqual([]);
    });
  });

  describe("getAvailableCountForAuction", () => {
    it("应该计算可用宝可梦数量", () => {
      const pool = [
        { id: "pool1", status: "AVAILABLE" },
        { id: "pool2", status: "AVAILABLE" },
        { id: "pool3", status: "DRAFTED" },
      ];
      expect(getAvailableCountForAuction(pool)).toBe(2);
    });

    it("应该排除指定的宝可梦", () => {
      const pool = [
        { id: "pool1", status: "AVAILABLE" },
        { id: "pool2", status: "AVAILABLE" },
        { id: "pool3", status: "DRAFTED" },
      ];
      expect(getAvailableCountForAuction(pool, "pool1")).toBe(1);
    });

    it("应该在不传排除 ID 时计算所有可用", () => {
      const pool = [
        { id: "pool1", status: "AVAILABLE" },
        { id: "pool2", status: "AVAILABLE" },
      ];
      expect(getAvailableCountForAuction(pool)).toBe(2);
    });

    it("应该处理空池子", () => {
      expect(getAvailableCountForAuction([])).toBe(0);
    });

    it("应该处理全部已选的池子", () => {
      const pool = [
        { id: "pool1", status: "DRAFTED" },
        { id: "pool2", status: "DRAFTED" },
      ];
      expect(getAvailableCountForAuction(pool)).toBe(0);
    });
  });

  describe("checkTierCompletenessMinimal", () => {
    it("应该在足够预算和分配时通过", () => {
      const tiers: PriceTier[] = [
        { id: "t1", name: "High", price: 20, pokemonIds: ["p1", "p2", "p3"] },
        {
          id: "t2",
          name: "Low",
          price: 5,
          pokemonIds: ["p4", "p5", "p6", "p7", "p8", "p9"],
        },
      ];
      const res = checkTierCompletenessMinimal(tiers, 100, 3, 3);
      expect(res.feasible).toBe(true);
    });

    it("应该在无分配时失败", () => {
      const tiers: PriceTier[] = [
        { id: "t1", name: "Empty", price: 10, pokemonIds: [] },
      ];
      const res = checkTierCompletenessMinimal(tiers, 100, 3, 3);
      expect(res.feasible).toBe(false);
      expect(res.reason).toContain("没有任何宝可梦被分配");
    });

    it("应该在总量不足时失败", () => {
      const tiers: PriceTier[] = [
        { id: "t1", name: "T1", price: 5, pokemonIds: ["p1", "p2"] },
      ];
      // 需要 3人×3只=9，只有 2 只
      const res = checkTierCompletenessMinimal(tiers, 100, 3, 3);
      expect(res.feasible).toBe(false);
      expect(res.reason).toContain("仅 2 只");
      expect(res.suggestions).toBeDefined();
      expect(res.suggestions!.length).toBeGreaterThan(0);
    });

    it("应该在预算不够最便宜组合时失败并返回建议", () => {
      const tiers: PriceTier[] = [
        {
          id: "t1",
          name: "Expensive",
          price: 50,
          pokemonIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"],
        },
      ];
      // 3人×3只，每只 50，第3人需要第 7-9 便宜 = 50*3=150
      const res = checkTierCompletenessMinimal(tiers, 140, 3, 3);
      expect(res.feasible).toBe(false);
      expect(res.suggestions).toBeDefined();
      expect(res.suggestions!.length).toBeGreaterThan(0);
      expect(res.suggestions![0].action).toBe("add");
    });

    it("应该在单人模式下正确检查", () => {
      const tiers: PriceTier[] = [
        { id: "t1", name: "T1", price: 10, pokemonIds: ["p1", "p2", "p3"] },
      ];
      // 1人×3只=3，总价 30
      const res = checkTierCompletenessMinimal(tiers, 30, 3, 1);
      expect(res.feasible).toBe(true);
    });
  });

  describe("checkTierCompleteness", () => {
    const tiers: PriceTier[] = [
      {
        id: "t1",
        name: "High",
        price: 20,
        pokemonIds: ["p1", "p2", "p3"],
        count: 3,
      },
      {
        id: "t2",
        name: "Mid",
        price: 10,
        pokemonIds: ["p4", "p5", "p6", "p7"],
        count: 4,
      },
      {
        id: "t3",
        name: "Low",
        price: 5,
        pokemonIds: ["p8", "p9", "p10"],
        count: 3,
      },
    ];

    it("应该在足够预算和分配时通过", () => {
      const res = checkTierCompleteness(tiers, 100, 3, 3);
      expect(res.feasible).toBe(true);
    });

    it("应该在某档数量不足时失败", () => {
      const badTiers = [
        ...tiers,
        {
          id: "t4",
          name: "Rare",
          price: 50,
          pokemonIds: ["r1", "r2"],
          count: 2,
        },
      ];
      const res = checkTierCompleteness(badTiers, 1000, 3, 3);
      expect(res.feasible).toBe(false);
    });

    it("应该在预算紧张时失败并返回详情", () => {
      const expTiers = [
        {
          id: "t1",
          name: "Expensive",
          price: 50,
          pokemonIds: ["e1", "e2", "e3"],
          count: 3,
        },
        {
          id: "t2",
          name: "Cheap",
          price: 5,
          pokemonIds: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"],
          count: 9,
        },
      ];
      const res = checkTierCompleteness(expTiers, 55, 3, 3);
      expect(res.feasible).toBe(false);
      const detail = res.details?.find((d) => d.tierName === "Expensive");
      expect(detail?.canInclude).toBe(false);
    });

    it("应该在空分档时失败", () => {
      const emptyTiers: PriceTier[] = [
        { id: "t1", name: "Empty", price: 10, pokemonIds: [] },
      ];
      const res = checkTierCompleteness(emptyTiers, 100, 3, 3);
      expect(res.feasible).toBe(false);
    });

    it("应该返回修改建议", () => {
      const problematicTiers: PriceTier[] = [
        {
          id: "t1",
          name: "Expensive",
          price: 80,
          pokemonIds: ["e1", "e2", "e3"],
        },
        {
          id: "t2",
          name: "Cheap",
          price: 5,
          pokemonIds: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"],
        },
      ];
      // 80 + 5*2 = 90，预算恰好 = 90，单人可行
      // 但 3 人模式下，第 3 人的 "其他" 池不够便宜
      // 需要更紧的预算让它失败
      const res = checkTierCompleteness(problematicTiers, 85, 3, 3);
      expect(res.feasible).toBe(false);
      expect(res.suggestions).toBeDefined();
    });

    it("应该处理包含空档位的混合情况", () => {
      const mixedTiers: PriceTier[] = [
        { id: "t1", name: "Full", price: 10, pokemonIds: ["p1", "p2", "p3"] },
        { id: "t2", name: "Empty", price: 20, pokemonIds: [] },
        {
          id: "t3",
          name: "Cheap",
          price: 5,
          pokemonIds: ["p4", "p5", "p6", "p7", "p8", "p9"],
        },
      ];
      const res = checkTierCompleteness(mixedTiers, 100, 3, 3);
      // Empty 档位应该被标记为 canInclude: false
      const emptyDetail = res.details?.find((d) => d.tierName === "Empty");
      expect(emptyDetail?.canInclude).toBe(false);
    });
  });
});
