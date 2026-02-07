/**
 * 颜色生成工具
 * 生成美观的颜色阶梯，符合 colormap 规范
 */

/**
 * 生成基于 HSL 的渐变色阶梯
 * 从红色到紫色，符合视觉美观的 colormap
 * 第一个颜色（最高价格）是红色，最后一个颜色（最低价格）是紫色
 */
export function generateColorScale(count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return ["#ef4444"]; // 红色

  const colors: string[] = [];

  // 使用 HSL 色彩空间生成渐变色
  // Hue: 0 (红色) -> 270 (紫色)
  // Saturation: 85-95% (高饱和度，颜色鲜艳)
  // Lightness: 50-55% (中等亮度，确保可读性)

  // 按价格降序：最高价格 = 红色(0°)，最低价格 = 紫色(270°)
  for (let i = 0; i < count; i++) {
    const ratio = i / (count - 1); // 0 到 1，0 是最高价格（红色），1 是最低价格（紫色）

    // Hue: 从红色(0)渐变到紫色(270)
    const hue = 0 + ratio * 270;

    // Saturation: 85-95%，确保颜色鲜艳
    const saturation = 85 + ratio * 10;

    // Lightness: 50-55%，确保对比度
    const lightness = 50 + (1 - ratio) * 5;

    // 转换为十六进制
    const color = hslToHex(hue, saturation, lightness);
    colors.push(color);
  }

  return colors;
}

/**
 * HSL 转 HEX
 */
function hslToHex(h: number, s: number, l: number): string {
  h = h % 360;
  s = s / 100;
  l = l / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return `#${[r, g, b]
    .map((x) => {
      const hex = x.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    })
    .join("")}`;
}

/**
 * 为 tiers 分配颜色
 * 如果 tiers 已有颜色，保留；如果没有，生成新颜色
 */
export function assignColorsToTiers(
  tiers: Array<{ price: number; color?: string }>,
): Array<{ price: number; color: string }> {
  if (tiers.length === 0) return [];

  // 按价格降序排序
  const sortedTiers = [...tiers].sort((a, b) => b.price - a.price);

  // 默认颜色列表（需要重新分配的颜色）
  const defaultColors = ["#6b7280", "#3b82f6", "#9ca3af", ""];

  // 检查哪些 tier 需要颜色
  const needsColor = sortedTiers.filter(
    (t) =>
      !t.color ||
      defaultColors.includes(t.color) ||
      !/^#[0-9A-Fa-f]{6}$/.test(t.color), // 无效的颜色格式
  );

  // 如果所有 tier 都有有效颜色，直接返回
  if (needsColor.length === 0) {
    return sortedTiers.map((t) => ({ price: t.price, color: t.color! }));
  }

  // 生成颜色阶梯（为所有 tiers 生成，确保颜色分布均匀）
  const colorScale = generateColorScale(sortedTiers.length);

  // 分配颜色（按价格降序：最高价格 = 红色，最低价格 = 紫色）
  // index 0 = 最高价格 = 红色（colorScale[0]）
  // index n-1 = 最低价格 = 紫色（colorScale[n-1]）
  return sortedTiers.map((tier, index) => {
    // 如果已有有效颜色且不是默认颜色，保留
    const isValidColor =
      tier.color &&
      !defaultColors.includes(tier.color) &&
      /^#[0-9A-Fa-f]{6}$/.test(tier.color);

    if (isValidColor) {
      return { price: tier.price, color: tier.color! };
    }
    // 否则使用生成的颜色（按价格顺序：最高价格用红色，最低价格用紫色）
    return { price: tier.price, color: colorScale[index] };
  });
}
