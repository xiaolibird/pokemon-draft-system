/**
 * usePokemonFilter Hook 单元测试
 *
 * 测试过滤逻辑：类型/世代/搜索/排序/irrelevant 隐藏
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePokemonFilter } from "./usePokemonFilter";
import type { PoolItem, Pokemon } from "@/app/types/draft";

// ─── 辅助函数 ────────────────────────────────────────────────────────

function makePokemon(overrides: Partial<Pokemon> = {}): Pokemon {
  return {
    id: "pikachu",
    num: 25,
    name: "Pikachu",
    nameCn: "皮卡丘",
    types: ["Electric"],
    hp: 35,
    atk: 55,
    def: 40,
    spa: 50,
    spd: 50,
    spe: 90,
    bst: 320,
    gen: 1,
    abilities: ["Static"],
    heightm: 0.4,
    weightkg: 6,
    baseSpecies: null,
    isNonstandard: null,
    tags: [],
    tier: "LC",
    ...overrides,
  } as Pokemon;
}

function makePoolItem(
  pokemon: Partial<Pokemon> = {},
  pool: Partial<PoolItem> = {},
): PoolItem {
  return {
    id: `pool-${pokemon.id || "pikachu"}`,
    basePrice: 10,
    status: "AVAILABLE",
    pokemon: makePokemon(pokemon),
    ...pool,
  } as PoolItem;
}

// 常用测试数据
const pikachu = makePoolItem({ id: "pikachu", num: 25, name: "Pikachu", nameCn: "皮卡丘", types: ["Electric"], bst: 320, gen: 1 });
const charizard = makePoolItem({ id: "charizard", num: 6, name: "Charizard", nameCn: "喷火龙", types: ["Fire", "Flying"], bst: 534, gen: 1 });
const gardevoir = makePoolItem({ id: "gardevoir", num: 282, name: "Gardevoir", nameCn: "沙奈朵", types: ["Psychic", "Fairy"], bst: 518, gen: 3 });
const garchomp = makePoolItem({ id: "garchomp", num: 445, name: "Garchomp", nameCn: "烈咬陆鲨", types: ["Dragon", "Ground"], bst: 600, gen: 4 });
const dragapult = makePoolItem({ id: "dragapult", num: 887, name: "Dragapult", nameCn: "多龙巴鲁托", types: ["Dragon", "Ghost"], bst: 600, gen: 8 });

const allPool = [pikachu, charizard, gardevoir, garchomp, dragapult];

// ─── 测试 ────────────────────────────────────────────────────────────

describe("usePokemonFilter", () => {
  describe("基础过滤", () => {
    it("无过滤条件时返回全部并按 BST 降序", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({ pool: allPool }),
      );

      expect(result.current.count).toBe(5);
      expect(result.current.totalCount).toBe(5);
      // BST 降序：garchomp/dragapult (600) > charizard (534) > gardevoir (518) > pikachu (320)
      expect(result.current.filtered[0].pokemon.bst).toBe(600);
      expect(result.current.filtered[result.current.filtered.length - 1].pokemon.bst).toBe(320);
    });

    it("空池子返回空数组", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({ pool: [] }),
      );
      expect(result.current.filtered).toEqual([]);
      expect(result.current.count).toBe(0);
      expect(result.current.totalCount).toBe(0);
    });
  });

  describe("类型过滤", () => {
    it("OR 模式 include 过滤", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({
          pool: allPool,
          types: { mode: "OR", include: ["Fire", "Electric"], exclude: [] },
        }),
      );

      expect(result.current.count).toBe(2);
      const names = result.current.filtered.map((i) => i.pokemon.name);
      expect(names).toContain("Pikachu");
      expect(names).toContain("Charizard");
    });

    it("AND 模式 include 要求同时具备所有类型", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({
          pool: allPool,
          types: { mode: "AND", include: ["Dragon", "Ground"], exclude: [] },
        }),
      );

      expect(result.current.count).toBe(1);
      expect(result.current.filtered[0].pokemon.name).toBe("Garchomp");
    });

    it("exclude 过滤排除指定类型", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({
          pool: allPool,
          types: { mode: "OR", include: [], exclude: ["Dragon"] },
        }),
      );

      expect(result.current.count).toBe(3);
      const names = result.current.filtered.map((i) => i.pokemon.name);
      expect(names).not.toContain("Garchomp");
      expect(names).not.toContain("Dragapult");
    });

    it("include + exclude 组合", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({
          pool: allPool,
          types: { mode: "OR", include: ["Dragon"], exclude: ["Ghost"] },
        }),
      );

      // Dragon 且非 Ghost → 只有 Garchomp
      expect(result.current.count).toBe(1);
      expect(result.current.filtered[0].pokemon.name).toBe("Garchomp");
    });
  });

  describe("世代过滤", () => {
    it("include 指定世代", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({
          pool: allPool,
          gens: { mode: "OR", include: [1], exclude: [] },
        }),
      );

      expect(result.current.count).toBe(2);
      const names = result.current.filtered.map((i) => i.pokemon.name);
      expect(names).toContain("Pikachu");
      expect(names).toContain("Charizard");
    });

    it("exclude 排除世代", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({
          pool: allPool,
          gens: { mode: "OR", include: [], exclude: [1, 3] },
        }),
      );

      expect(result.current.count).toBe(2);
      const names = result.current.filtered.map((i) => i.pokemon.name);
      expect(names).toContain("Garchomp");
      expect(names).toContain("Dragapult");
    });
  });

  describe("搜索过滤", () => {
    it("按英文名搜索", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({ pool: allPool, searchTerm: "char" }),
      );

      expect(result.current.count).toBe(1);
      expect(result.current.filtered[0].pokemon.name).toBe("Charizard");
    });

    it("按中文名搜索", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({ pool: allPool, searchTerm: "皮卡" }),
      );

      expect(result.current.count).toBe(1);
      expect(result.current.filtered[0].pokemon.name).toBe("Pikachu");
    });

    it("PS 查询: type:Dragon", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({ pool: allPool, searchTerm: "type:Dragon" }),
      );

      expect(result.current.count).toBe(2);
      const names = result.current.filtered.map((i) => i.pokemon.name);
      expect(names).toContain("Garchomp");
      expect(names).toContain("Dragapult");
    });

    it("PS 查询: bst>550", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({ pool: allPool, searchTerm: "bst>550" }),
      );

      expect(result.current.count).toBe(2);
      result.current.filtered.forEach((i) => {
        expect(i.pokemon.bst).toBeGreaterThan(550);
      });
    });

    it("无匹配搜索返回空", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({ pool: allPool, searchTerm: "zzzznotfound" }),
      );

      expect(result.current.count).toBe(0);
    });
  });

  describe("irrelevant 隐藏", () => {
    const irrelevantPikachu = makePoolItem({
      id: "pikachu-cosplay",
      num: 25,
      name: "Pikachu-Cosplay",
      nameCn: "换装皮卡丘",
      types: ["Electric"],
      bst: 320,
      tags: ["irrelevant"],
    });
    const poolWithIrrelevant = [...allPool, irrelevantPikachu];

    it("默认隐藏 irrelevant 宝可梦", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({ pool: poolWithIrrelevant }),
      );

      expect(result.current.count).toBe(5);
      const names = result.current.filtered.map((i) => i.pokemon.name);
      expect(names).not.toContain("Pikachu-Cosplay");
    });

    it("hideIrrelevant=false 时显示全部", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({ pool: poolWithIrrelevant, hideIrrelevant: false }),
      );

      expect(result.current.count).toBe(6);
    });

    it("有搜索词时 irrelevant 宝可梦参与过滤", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({
          pool: poolWithIrrelevant,
          searchTerm: "Cosplay",
        }),
      );

      expect(result.current.count).toBe(1);
      expect(result.current.filtered[0].pokemon.name).toBe("Pikachu-Cosplay");
    });
  });

  describe("排序", () => {
    it("默认按 BST 降序", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({ pool: allPool }),
      );

      const bsts = result.current.filtered.map((i) => i.pokemon.bst);
      for (let i = 1; i < bsts.length; i++) {
        expect(bsts[i]).toBeLessThanOrEqual(bsts[i - 1]);
      }
    });

    it("type-priority 排序", () => {
      const { result } = renderHook(() =>
        usePokemonFilter({
          pool: allPool,
          sortBy: "type-priority",
          typePriority: ["Electric", "Fire", "Dragon"],
        }),
      );

      // indexOf 返回 -1 的类型排在最前（Psychic/Fairy 的 Gardevoir）
      // 然后按 priority 顺序: Electric(0) → Fire(1) → Dragon(2)
      expect(result.current.filtered[0].pokemon.name).toBe("Gardevoir"); // Psychic → -1
      expect(result.current.filtered[1].pokemon.name).toBe("Pikachu");   // Electric → 0
      expect(result.current.filtered[2].pokemon.name).toBe("Charizard"); // Fire → 1
      // Dragon 中按 BST 降序（两者都是 600，顺序稳定即可）
      const dragonNames = result.current.filtered
        .filter((i) => i.pokemon.types[0] === "Dragon")
        .map((i) => i.pokemon.name);
      expect(dragonNames).toContain("Garchomp");
      expect(dragonNames).toContain("Dragapult");
    });
  });
});
