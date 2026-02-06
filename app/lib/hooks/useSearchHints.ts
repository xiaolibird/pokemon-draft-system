import { useState, useEffect } from 'react'

const PLACEHOLDERS = [
  'PS 搜索格式: type:Water, atk>100, bst>500...',
  '例如: type:fire, not type:flying (火系且非飞行系)',
  '例如: gen:1, gen:2, gen:3, gen:4 (前四代)',
  '例如: spe>=100, spe<137 (速度 100-136)',
  '例如: hp>100, def>100, spd>100 (坦克项)',
  '例如: type:dragon, bst>600 (准神/神兽)',
  '例如: atk>120, spe>100 (物攻手)',
  '例如: spa>120, spe>100 (特攻手)',
  '例如: type:fairy, bst<500 (平民妖精系)',
  '例如: bst>650 (超梦/洛奇亚等一级神)',
  '例如: def>130, spd>130 (极品双盾)',
  '例如: not type:normal, spe>110 (非普系高速)',
  '例如: hp>150 (大肉弹 如幸福蛋)',
  '例如: atk<50, spa<50 (极低双攻)',
  '例如: spe<30, atk>100 (空间肉打手)',
  '例如: gen:9 (最新的朱紫世代)',
  '例如: type:Steel, bst>550 (高种族钢系)',
  '例如: hp<100, bst>580 (低血高属性)',
  '例如: type:Ghost, not type:Poison (非毒系鬼)',
]

export function useSearchHints() {
  const [placeholder] = useState(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)],
  )

  return placeholder
}
