import { describe, it, expect } from "vitest";
import { getGeneration, parsePSQuery, getPokemonIconStyle } from "./helpers";

describe("工具函数", () => {
  describe("getGeneration", () => {
    it("应该正确判断第一世代 (1-151)", () => {
      expect(getGeneration(1)).toBe(1);
      expect(getGeneration(25)).toBe(1); // 皮卡丘
      expect(getGeneration(151)).toBe(1); // 梦幻
    });

    it("应该正确判断第二世代 (152-251)", () => {
      expect(getGeneration(152)).toBe(2);
      expect(getGeneration(251)).toBe(2);
    });

    it("应该正确判断第三世代 (252-386)", () => {
      expect(getGeneration(252)).toBe(3);
      expect(getGeneration(386)).toBe(3);
    });

    it("应该正确判断第四世代 (387-493)", () => {
      expect(getGeneration(387)).toBe(4);
      expect(getGeneration(493)).toBe(4);
    });

    it("应该正确判断第五世代 (494-649)", () => {
      expect(getGeneration(494)).toBe(5);
      expect(getGeneration(649)).toBe(5);
    });

    it("应该正确判断第六世代 (650-721)", () => {
      expect(getGeneration(650)).toBe(6);
      expect(getGeneration(721)).toBe(6);
    });

    it("应该正确判断第七世代 (722-809)", () => {
      expect(getGeneration(722)).toBe(7);
      expect(getGeneration(809)).toBe(7);
    });

    it("应该正确判断第八世代 (810-905)", () => {
      expect(getGeneration(810)).toBe(8);
      expect(getGeneration(905)).toBe(8);
    });

    it("应该正确判断第九世代 (906+)", () => {
      expect(getGeneration(906)).toBe(9);
      expect(getGeneration(1000)).toBe(9);
    });

    it("应该通过 ID 后缀识别阿罗拉形态为第七世代", () => {
      expect(getGeneration(25, "pikachu-alola")).toBe(7);
    });

    it("应该通过 ID 后缀识别伽勒尔形态为第八世代", () => {
      expect(getGeneration(25, "ponyta-galar")).toBe(8);
    });

    it("应该通过 ID 后缀识别洗翠形态为第八世代", () => {
      expect(getGeneration(100, "voltorb-hisui")).toBe(8);
    });

    it("应该通过 ID 后缀识别帕底亚形态为第九世代", () => {
      expect(getGeneration(128, "tauros-paldea")).toBe(9);
    });

    it("应该在没有 ID 时按编号判断", () => {
      expect(getGeneration(25)).toBe(1);
    });
  });

  describe("parsePSQuery", () => {
    it("应该解析空字符串", () => {
      const result = parsePSQuery("");
      expect(result.name).toBe("");
      expect(result.types).toEqual([]);
      expect(result.stats).toEqual([]);
    });

    it("应该解析名称搜索", () => {
      const result = parsePSQuery("charizard");
      expect(result.name).toBe("charizard");
    });

    it("应该解析类型过滤", () => {
      const result = parsePSQuery("type:fire");
      expect(result.types).toContain("Fire");
    });

    it("应该解析多个类型", () => {
      const result = parsePSQuery("type:fire, type:water");
      expect(result.types).toContain("Fire");
      expect(result.types).toContain("Water");
    });

    it("应该解析排除类型", () => {
      const result = parsePSQuery("!type:fire");
      expect(result.excludeTypes).toContain("Fire");
    });

    it("应该解析 not 前缀的排除", () => {
      const result = parsePSQuery("not type:fire");
      expect(result.excludeTypes).toContain("Fire");
    });

    it("应该解析世代过滤", () => {
      const result = parsePSQuery("gen:9");
      expect(result.gens).toContain(9);
    });

    it("应该解析 generation 关键字", () => {
      const result = parsePSQuery("generation:3");
      expect(result.gens).toContain(3);
    });

    it("应该解析排除世代", () => {
      const result = parsePSQuery("!gen:1");
      expect(result.excludeGens).toContain(1);
    });

    it("应该解析统计数据比较", () => {
      const result = parsePSQuery("atk>100");
      expect(result.stats).toContainEqual({
        stat: "atk",
        op: ">",
        value: 100,
      });
    });

    it("应该支持多个统计条件（范围查询）", () => {
      const result = parsePSQuery("hp>100, hp<200");
      expect(result.stats).toHaveLength(2);
      expect(result.stats).toContainEqual({
        stat: "hp",
        op: ">",
        value: 100,
      });
      expect(result.stats).toContainEqual({
        stat: "hp",
        op: "<",
        value: 200,
      });
    });

    it("应该解析复合查询", () => {
      const result = parsePSQuery("type:fire, atk>100, charizard, gen:1");
      expect(result.types).toContain("Fire");
      expect(result.stats).toContainEqual({
        stat: "atk",
        op: ">",
        value: 100,
      });
      expect(result.name).toBe("charizard");
      expect(result.gens).toContain(1);
    });

    it("应该解析排除名称", () => {
      const result = parsePSQuery("!pikachu");
      expect(result.excludeNames).toContain("pikachu");
    });

    it("应该处理多余的空格", () => {
      const result = parsePSQuery("  type:fire ,  atk > 100  ");
      expect(result.types).toContain("Fire");
      expect(result.stats).toHaveLength(1);
    });

    it("应该只保留第一个名称", () => {
      const result = parsePSQuery("pikachu, charizard");
      expect(result.name).toBe("pikachu");
    });

    it("应该解析等于运算符", () => {
      const result = parsePSQuery("bst=600");
      expect(result.stats).toContainEqual({
        stat: "bst",
        op: "=",
        value: 600,
      });
    });
  });

  describe("getPokemonIconStyle", () => {
    it("应该返回正确的 backgroundPosition", () => {
      const style = getPokemonIconStyle(0);
      expect(style.backgroundPosition).toBe("0px 0px");
    });

    it("应该根据编号计算正确的列偏移", () => {
      // num=1, col=1, row=0 -> -40px 0px (md scale)
      const style = getPokemonIconStyle(1);
      expect(style.backgroundPosition).toBe("-40px 0px");
    });

    it("应该根据编号计算正确的行偏移", () => {
      // num=12, col=0, row=1 -> 0px -30px (md scale)
      const style = getPokemonIconStyle(12);
      expect(style.backgroundPosition).toBe("0px -30px");
    });

    it("应该在 xs 尺寸下缩放", () => {
      // num=1, col=1, row=0, scale=0.6 -> -24px 0px
      const style = getPokemonIconStyle(1, "xs");
      expect(style.backgroundPosition).toBe("-24px 0px");
    });

    it("应该在 sm 尺寸下缩放", () => {
      // num=1, col=1, row=0, scale=0.8 -> -32px 0px
      const style = getPokemonIconStyle(1, "sm");
      expect(style.backgroundPosition).toBe("-32px 0px");
    });

    it("应该在 lg 尺寸下缩放", () => {
      // num=1, col=1, row=0, scale=1.5 -> -60px 0px
      const style = getPokemonIconStyle(1, "lg");
      expect(style.backgroundPosition).toBe("-60px 0px");
    });

    it("应该在 xl 尺寸下缩放", () => {
      // num=1, col=1, row=0, scale=2.0 -> -80px 0px
      const style = getPokemonIconStyle(1, "xl");
      expect(style.backgroundPosition).toBe("-80px 0px");
    });

    it("应该在 md 尺寸下使用默认缩放", () => {
      const style = getPokemonIconStyle(1, "md");
      expect(style.backgroundPosition).toBe("-40px 0px");
    });

    it("应该处理较大的编号", () => {
      // num=25, col=1, row=2
      const style = getPokemonIconStyle(25, "md");
      const col = 25 % 12; // 1
      const row = Math.floor(25 / 12); // 2
      expect(style.backgroundPosition).toBe(`${-col * 40}px ${-row * 30}px`);
    });
  });
});
