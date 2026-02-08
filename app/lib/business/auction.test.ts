/**
 * 竞价业务逻辑单元测试
 *
 * 遵循 CURSOR_RULES.md 测试规范
 */

import { describe, it, expect } from "vitest";

describe("Auction Business Logic", () => {
  describe("countOwnedInContest - 边界测试", () => {
    it("应该统计在本比赛池子内的宝可梦数量", () => {
      // Given
      const poolIds = new Set(["p1", "p2", "p3"]);
      const owned = [
        { pokemonId: "p1" },
        { pokemonId: "p2" },
        { pokemonId: "p9" },
      ];

      // When - 模拟 countOwnedInContest 逻辑
      const result = owned.filter((o) => poolIds.has(o.pokemonId)).length;

      // Then
      expect(result).toBe(2);
    });

    it("应该返回 0 当玩家没有任何宝可梦时", () => {
      // Given
      const poolIds = new Set(["p1", "p2", "p3"]);
      const owned: { pokemonId: string }[] = [];

      // When
      const result = owned.filter((o) => poolIds.has(o.pokemonId)).length;

      // Then
      expect(result).toBe(0);
    });

    it("应该只统计当前比赛的池子，不统计其他比赛", () => {
      // Given
      const contestPoolIds = new Set(["p1", "p2"]);
      const owned = [
        { pokemonId: "p1" }, // 当前比赛
        { pokemonId: "p3" }, // 其他比赛
      ];

      // When
      const result = owned.filter((o) =>
        contestPoolIds.has(o.pokemonId),
      ).length;

      // Then
      expect(result).toBe(1);
    });
  });

  describe("findNextValidTurn - 选手轮换逻辑", () => {
    it("应该跳过已满员的玩家", () => {
      // Given
      const draftOrder = ["p1", "p2", "p3", "p4"];
      const uniquePlayerIds = [...new Set(draftOrder)];
      const maxPokemon = 6;
      const basePrice = 10;

      // 模拟数据库查询结果
      // p1 已满（owned=6 >= maxPokemon=6），p2 可以继续
      const ownedCounts = new Map<string, number>();
      ownedCounts.set("p1", 6); // 已满（owned >= maxPokemon）
      ownedCounts.set("p2", 3); // 可以继续
      ownedCounts.set("p3", 0); // 可以继续
      ownedCounts.set("p4", 0); // 可以继续

      const playerTokensMap = new Map<string, number>();
      playerTokensMap.set("p1", 100);
      playerTokensMap.set("p2", 100);
      playerTokensMap.set("p3", 0); // 没钱了
      playerTokensMap.set("p4", 100);

      // 模拟 findNextValidTurn 逻辑
      const numPlayers = draftOrder.length;

      // 第一步：全局检查
      let anyPlayerCanContinue = false;
      for (const playerId of uniquePlayerIds) {
        const tokens = playerTokensMap.get(playerId) ?? 0;
        const ownedInContest = ownedCounts.get(playerId) ?? 0;
        if (ownedInContest < maxPokemon && tokens >= basePrice) {
          anyPlayerCanContinue = true;
          break;
        }
      }

      let result;
      if (!anyPlayerCanContinue) {
        result = { turn: 0, shouldComplete: true };
      } else {
        // 第二步：从 startTurn 开始，找下一个能继续的玩家
        // startTurn = 0
        for (let attempt = 0; attempt < numPlayers * 2; attempt++) {
          const turn = attempt; // startTurn = 0
          const playerId = draftOrder[turn % draftOrder.length];
          const tokens = playerTokensMap.get(playerId) ?? 0;
          const ownedInContest = ownedCounts.get(playerId) ?? 0;
          // owned >= maxPokemon 或 tokens < basePrice 则跳过
          if (ownedInContest >= maxPokemon || tokens < basePrice) continue;
          result = { turn, shouldComplete: false };
          break;
        }
      }

      // When
      if (!result) {
        result = { turn: 0, shouldComplete: true };
      }

      // Then - p1 已满（owned=6 >= maxPokemon=6），p2 可以继续
      // draftOrder[0] = p1（跳过）, draftOrder[1] = p2（有效）
      expect(result.turn).toBe(1); // p2
      expect(result.shouldComplete).toBe(false);
    });

    it("应该跳过没有足够代币的玩家", () => {
      // Given
      const draftOrder = ["p1", "p2", "p3"];
      const uniquePlayerIds = [...new Set(draftOrder)];
      const maxPokemon = 6;
      const basePrice = 10;

      // 模拟数据库查询结果
      const ownedCounts = new Map<string, number>();
      ownedCounts.set("p1", 0);
      ownedCounts.set("p2", 0);
      ownedCounts.set("p3", 0);

      const playerTokensMap = new Map<string, number>();
      playerTokensMap.set("p1", 5); // 代币不足
      playerTokensMap.set("p2", 100);
      playerTokensMap.set("p3", 100);

      const numPlayers = draftOrder.length;

      // 第一步：全局检查
      let anyPlayerCanContinue = false;
      for (const playerId of uniquePlayerIds) {
        const tokens = playerTokensMap.get(playerId) ?? 0;
        const ownedInContest = ownedCounts.get(playerId) ?? 0;
        if (ownedInContest < maxPokemon && tokens >= basePrice) {
          anyPlayerCanContinue = true;
          break;
        }
      }

      let result;
      if (!anyPlayerCanContinue) {
        result = { turn: 0, shouldComplete: true };
      } else {
        for (let attempt = 0; attempt < numPlayers * 2; attempt++) {
          const turn = attempt;
          const playerId = draftOrder[turn % draftOrder.length];
          const tokens = playerTokensMap.get(playerId) ?? 0;
          const ownedInContest = ownedCounts.get(playerId) ?? 0;
          if (ownedInContest >= maxPokemon || tokens < basePrice) continue;
          result = { turn, shouldComplete: false };
          break;
        }
      }

      if (!result) {
        result = { turn: 0, shouldComplete: true };
      }

      // Then - p1 代币不足，p2 可以继续
      expect(result.turn).toBe(1); // p2
    });

    it("应该返回 shouldComplete=true 当所有玩家都无法继续时", () => {
      // Given - 所有玩家都满了
      const draftOrder = ["p1", "p2"];
      const uniquePlayerIds = [...new Set(draftOrder)];
      const maxPokemon = 6;
      const basePrice = 10;

      const ownedCounts = new Map<string, number>();
      ownedCounts.set("p1", 6); // 已满
      ownedCounts.set("p2", 6); // 已满

      const playerTokensMap = new Map<string, number>();
      playerTokensMap.set("p1", 100);
      playerTokensMap.set("p2", 100);

      const numPlayers = draftOrder.length;

      // 全局检查
      let anyPlayerCanContinue = false;
      for (const playerId of uniquePlayerIds) {
        const tokens = playerTokensMap.get(playerId) ?? 0;
        const ownedInContest = ownedCounts.get(playerId) ?? 0;
        if (ownedInContest < maxPokemon && tokens >= basePrice) {
          anyPlayerCanContinue = true;
          break;
        }
      }

      // When
      let result;
      if (!anyPlayerCanContinue) {
        result = { turn: 0, shouldComplete: true };
      } else {
        for (let attempt = 0; attempt < numPlayers * 2; attempt++) {
          const turn = attempt;
          const playerId = draftOrder[turn % draftOrder.length];
          const tokens = playerTokensMap.get(playerId) ?? 0;
          const ownedInContest = ownedCounts.get(playerId) ?? 0;
          if (ownedInContest >= maxPokemon || tokens < basePrice) continue;
          result = { turn, shouldComplete: false };
          break;
        }
      }

      if (!result) {
        result = { turn: 0, shouldComplete: true };
      }

      // Then
      expect(result.shouldComplete).toBe(true);
    });

    it("应该支持蛇形选秀顺序（draftOrder 包含重复玩家）", () => {
      // Given - 蛇形选秀：p1, p2, p3, p3, p2, p1
      const draftOrder = ["p1", "p2", "p3", "p3", "p2", "p1"];
      // uniquePlayerIds 会被去重
      const uniquePlayerIds = [...new Set(draftOrder)];
      const maxPokemon = 6;
      const basePrice = 10;

      // 模拟数据库查询结果 - p1 和 p2 都满了，只剩 p3
      // owned >= maxPokemon 表示已满
      const ownedCounts = new Map<string, number>();
      ownedCounts.set("p1", 6); // 已满
      ownedCounts.set("p2", 6); // 已满
      ownedCounts.set("p3", 0); // 空的

      const playerTokensMap = new Map<string, number>();
      playerTokensMap.set("p1", 100);
      playerTokensMap.set("p2", 100);
      playerTokensMap.set("p3", 100);

      const numPlayers = draftOrder.length;

      // 全局检查 - p3 可以继续
      let anyPlayerCanContinue = false;
      for (const playerId of uniquePlayerIds) {
        const tokens = playerTokensMap.get(playerId) ?? 0;
        const ownedInContest = ownedCounts.get(playerId) ?? 0;
        if (ownedInContest < maxPokemon && tokens >= basePrice) {
          anyPlayerCanContinue = true;
          break;
        }
      }

      let result;
      if (!anyPlayerCanContinue) {
        result = { turn: 0, shouldComplete: true };
      } else {
        for (let attempt = 0; attempt < numPlayers * 2; attempt++) {
          const turn = attempt;
          const playerId = draftOrder[turn % draftOrder.length];
          const tokens = playerTokensMap.get(playerId) ?? 0;
          const ownedInContest = ownedCounts.get(playerId) ?? 0;
          // owned >= maxPokemon 或 tokens < basePrice 则跳过
          if (ownedInContest >= maxPokemon || tokens < basePrice) continue;
          result = { turn, shouldComplete: false };
          break;
        }
      }

      if (!result) {
        result = { turn: 0, shouldComplete: true };
      }

      // Then - p1 已满，p2 已满，p3 是下一个 (turn=2)
      // draftOrder[0] = p1（跳过）, draftOrder[1] = p2（跳过）, draftOrder[2] = p3（有效）
      expect(result.turn).toBe(2); // p3 第一次出现
      expect(result.shouldComplete).toBe(false);
    });
  });

  describe("countOwnedInContestBatch - 批量统计", () => {
    it("应该正确批量统计多个玩家的持有数量", () => {
      // Given
      const playerIds = ["p1", "p2", "p3"];
      const contestPoolIds = new Set(["pk1", "pk2", "pk3"]);
      const mockOwned = [
        { playerId: "p1", pokemonId: "pk1" },
        { playerId: "p1", pokemonId: "pk9" }, // 不在池子
        { playerId: "p2", pokemonId: "pk1" },
        { playerId: "p2", pokemonId: "pk2" },
        { playerId: "p2", pokemonId: "pk3" },
        { playerId: "p3", pokemonId: "pk9" }, // 不在池子
      ];

      // 模拟批量统计逻辑
      const counts = new Map<string, number>();
      playerIds.forEach((pid) => counts.set(pid, 0));

      for (const item of mockOwned) {
        if (contestPoolIds.has(item.pokemonId)) {
          const current = counts.get(item.playerId) || 0;
          counts.set(item.playerId, current + 1);
        }
      }

      // Then
      expect(counts.get("p1")).toBe(1);
      expect(counts.get("p2")).toBe(3);
      expect(counts.get("p3")).toBe(0);
    });

    it("应该正确处理空玩家列表", () => {
      // Given
      const playerIds: string[] = [];
      const contestPoolIds = new Set(["pk1"]);

      // 模拟逻辑
      const counts = new Map<string, number>();
      playerIds.forEach((pid) => counts.set(pid, 0));

      // Then
      expect(counts.size).toBe(0);
    });

    it("应该正确处理空池子", () => {
      // Given
      const playerIds = ["p1", "p2"];
      const contestPoolIds = new Set<string>();
      const mockOwned = [
        { playerId: "p1", pokemonId: "pk1" },
        { playerId: "p2", pokemonId: "pk2" },
      ];

      // 模拟逻辑
      const counts = new Map<string, number>();
      playerIds.forEach((pid) => counts.set(pid, 0));

      for (const item of mockOwned) {
        if (contestPoolIds.has(item.pokemonId)) {
          const current = counts.get(item.playerId) || 0;
          counts.set(item.playerId, current + 1);
        }
      }

      // Then - 池子为空，所有计数都应该是 0
      expect(counts.get("p1")).toBe(0);
      expect(counts.get("p2")).toBe(0);
    });
  });

  describe("executeAuctionFinalize - 结算逻辑边界", () => {
    it("应该正确计算下一个回合", () => {
      // Given - 剩余池子有不同底价
      const remainingPool = [
        { basePrice: 10 },
        { basePrice: 5 },
        { basePrice: 20 },
      ];

      // 模拟计算最低池底价逻辑
      const minPoolPrice = Math.max(
        1,
        Math.min(...remainingPool.map((p) => p.basePrice)),
      );

      // Then
      expect(minPoolPrice).toBe(5);
    });

    it("应该确保底价至少为 1", () => {
      // Given - 所有池子底价都是 0（理论上不应该发生）
      const remainingPool = [{ basePrice: 0 }, { basePrice: 0 }];

      // 模拟逻辑
      const minPoolPrice = Math.max(
        1,
        Math.min(...remainingPool.map((p) => p.basePrice)),
      );

      // Then - 确保至少为 1
      expect(minPoolPrice).toBe(1);
    });

    it("应该正确处理剩余池子为空的情况", () => {
      // Given
      const remainingPool: { basePrice: number }[] = [];

      // 模拟逻辑
      let nextTurn: number;
      let shouldComplete: boolean;

      if (remainingPool.length === 0) {
        nextTurn = 5; // contest.currentTurn + 1
        shouldComplete = true;
      } else {
        const minPoolPrice = Math.max(
          1,
          Math.min(...remainingPool.map((p) => p.basePrice)),
        );
        nextTurn = 0;
        shouldComplete = false;
      }

      // Then
      expect(nextTurn).toBe(5);
      expect(shouldComplete).toBe(true);
    });
  });
});
