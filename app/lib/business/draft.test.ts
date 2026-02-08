import { describe, it } from "node:test";
import assert from "node:assert";
import {
  canFillTeam,
  canFillTeamAfterOperation,
  checkTierCompleteness,
  PriceTier,
} from "./draft";

describe("Draft DP Algorithms", () => {
  describe("canFillTeam - Edge Cases", () => {
    it("should handle empty prices array", () => {
      assert.strictEqual(canFillTeam(100, 3, []), false);
    });

    it("should handle negative budget", () => {
      assert.strictEqual(canFillTeam(-10, 3, [1, 2, 3]), false);
    });

    it("should handle k=0", () => {
      assert.strictEqual(canFillTeam(100, 0, [1, 2, 3]), true);
    });

    it("should handle k=1 with single item", () => {
      assert.strictEqual(canFillTeam(5, 1, [5]), true);
    });

    it("should handle k=1 with insufficient budget", () => {
      assert.strictEqual(canFillTeam(4, 1, [5]), false);
    });

    it("should handle exact budget match", () => {
      assert.strictEqual(canFillTeam(6, 3, [1, 2, 3]), true);
    });

    it("should handle large numbers", () => {
      const largePrices = Array.from({ length: 100 }, (_, i) => i + 1);
      assert.strictEqual(canFillTeam(5050, 100, largePrices), true);
      assert.strictEqual(canFillTeam(5049, 100, largePrices), false);
    });

    it("should handle single item k=1", () => {
      assert.strictEqual(canFillTeam(10, 1, [5, 3, 7]), true);
    });

    it("should handle zero budget", () => {
      assert.strictEqual(canFillTeam(0, 0, [1, 2, 3]), true);
      assert.strictEqual(canFillTeam(0, 1, [1, 2, 3]), false);
    });
  });

  describe("canFillTeamAfterOperation", () => {
    it("should allow operation if fully feasible", () => {
      const prices = [5, 5, 5, 5, 5, 20];
      const result = canFillTeamAfterOperation(100, 0, 6, 10, prices);
      assert.strictEqual(result.feasible, true);
    });

    it("should reject if remaining budget insufficient", () => {
      const prices = [5, 5, 5, 5, 5, 20];
      const result = canFillTeamAfterOperation(30, 0, 6, 10, prices);
      assert.strictEqual(result.feasible, false);
      assert.strictEqual(result.minRequiredForRemaining, 25);
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

    it("should pass given sufficient budget and distribution", () => {
      const res = checkTierCompleteness(tiers, 100, 3, 3);
      assert.strictEqual(res.feasible, true);
    });

    it("should fail if a tier is under-supplied for N players", () => {
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
      assert.strictEqual(res.feasible, false);
    });

    it("should fail if budget is tight for inclusion", () => {
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
      assert.strictEqual(res.feasible, false);
      const detail = res.details?.find((d) => d.tierName === "Expensive");
      assert.strictEqual(detail?.canInclude, false);
    });
  });
});
