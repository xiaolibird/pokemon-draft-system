import { describe, it, expect } from "vitest";
import {
  checkFusionExclusive,
  TYPE_COLORS,
  FUSION_EXCLUSIVE_GROUPS,
} from "./constants";

describe("常量和工具函数", () => {
  describe("TYPE_COLORS", () => {
    it("应该包含所有 18 种属性颜色", () => {
      const expectedTypes = [
        "Normal",
        "Fire",
        "Water",
        "Electric",
        "Grass",
        "Ice",
        "Fighting",
        "Poison",
        "Ground",
        "Flying",
        "Psychic",
        "Bug",
        "Rock",
        "Ghost",
        "Dragon",
        "Dark",
        "Steel",
        "Fairy",
      ];
      for (const type of expectedTypes) {
        expect(TYPE_COLORS[type]).toBeDefined();
      }
      expect(Object.keys(TYPE_COLORS)).toHaveLength(18);
    });

    it("应该返回有效的 hex 颜色值", () => {
      for (const color of Object.values(TYPE_COLORS)) {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe("FUSION_EXCLUSIVE_GROUPS", () => {
    it("应该包含 3 个互斥组", () => {
      expect(FUSION_EXCLUSIVE_GROUPS).toHaveLength(3);
    });

    it("应该包含蕾冠王系列", () => {
      const calyrexGroup = FUSION_EXCLUSIVE_GROUPS.find((g) =>
        g.includes("calyrex"),
      );
      expect(calyrexGroup).toBeDefined();
      expect(calyrexGroup).toContain("calyrexice");
      expect(calyrexGroup).toContain("calyrexshadow");
    });

    it("应该包含奈克洛兹玛系列", () => {
      const necrozmaGroup = FUSION_EXCLUSIVE_GROUPS.find((g) =>
        g.includes("necrozma"),
      );
      expect(necrozmaGroup).toBeDefined();
      expect(necrozmaGroup).toContain("necrozmadawnwings");
      expect(necrozmaGroup).toContain("necrozmaduskmane");
    });

    it("应该包含酋雷姆系列", () => {
      const kyuremGroup = FUSION_EXCLUSIVE_GROUPS.find((g) =>
        g.includes("kyurem"),
      );
      expect(kyuremGroup).toBeDefined();
      expect(kyuremGroup).toContain("kyuremblack");
      expect(kyuremGroup).toContain("kyuremwhite");
    });
  });

  describe("checkFusionExclusive", () => {
    it("应该允许没有冲突的选择", () => {
      const result = checkFusionExclusive("pikachu", [
        "charizard",
        "blastoise",
      ]);
      expect(result.allowed).toBe(true);
    });

    it("应该禁止同系列的蕾冠王形态", () => {
      const result = checkFusionExclusive("calyrex-ice", ["calyrex"]);
      expect(result.allowed).toBe(false);
      expect(result.groupName).toBe("蕾冠王系列");
    });

    it("应该禁止同系列的奈克洛兹玛形态", () => {
      const result = checkFusionExclusive("necrozma-dawn-wings", ["necrozma"]);
      expect(result.allowed).toBe(false);
      expect(result.groupName).toBe("奈克洛兹玛系列");
    });

    it("应该禁止同系列的酋雷姆形态", () => {
      const result = checkFusionExclusive("kyurem-black", ["kyurem"]);
      expect(result.allowed).toBe(false);
      expect(result.groupName).toBe("酋雷姆系列");
    });

    it("应该允许不同互斥组的选择", () => {
      const result = checkFusionExclusive("calyrex", ["kyurem", "necrozma"]);
      expect(result.allowed).toBe(true);
    });

    it("应该处理空已拥有列表", () => {
      const result = checkFusionExclusive("calyrex-ice", []);
      expect(result.allowed).toBe(true);
    });

    it("应该标准化 ID（去掉连字符，转小写）", () => {
      // Calyrex-Ice -> calyrexice
      const result = checkFusionExclusive("Calyrex-Ice", ["Calyrex-Shadow"]);
      expect(result.allowed).toBe(false);
    });

    it("应该返回冲突的宝可梦 ID", () => {
      const result = checkFusionExclusive("calyrex-ice", ["calyrex-shadow"]);
      expect(result.allowed).toBe(false);
      expect(result.conflictWith).toBe("calyrexshadow");
    });

    it("应该允许选择与自己相同的 ID", () => {
      // 如果目标和已拥有的是同一个（边界情况），不应冲突
      // 但实际上 ownedId !== normalizedTarget 条件会阻止自我冲突
      const result = checkFusionExclusive("calyrex", ["calyrex"]);
      expect(result.allowed).toBe(true);
    });

    it("应该处理非互斥组中的宝可梦", () => {
      const result = checkFusionExclusive("mewtwo", [
        "calyrex",
        "kyurem",
        "necrozma",
      ]);
      expect(result.allowed).toBe(true);
    });
  });
});
