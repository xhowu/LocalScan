/** 物品分类 → 配色键（图标渐变块与胶囊标签共用同一套色） */

export type CatKey =
  | 'digital'
  | 'tool'
  | 'home'
  | 'cloth'
  | 'office'
  | 'supply'
  | 'food'
  | 'other';

/** 顺序有讲究：先匹配更具体的词 */
const RULES: Array<[RegExp, CatKey]> = [
  [/服饰|服装|衣|鞋|帽|包/, 'cloth'],
  [/食品|零食|饮料|生鲜|粮油|酒|茶/, 'food'],
  [/办公|文具|耗材办公/, 'office'],
  [/工具|五金|电动/, 'tool'],
  [/数码|电子|电脑|手机|配件/, 'digital'],
  [/耗材|日用|清洁/, 'supply'],
  [/家居|家具|厨具|收纳/, 'home'],
];

export function catKey(category: string): CatKey {
  const c = (category ?? '').trim();
  for (const [re, key] of RULES) if (re.test(c)) return key;
  return 'other';
}

/** 分类对应的中文名（用于无障碍标签） */
export const CAT_LABEL: Record<CatKey, string> = {
  digital: '数码',
  tool: '工具',
  home: '家居',
  cloth: '服饰',
  office: '办公',
  supply: '耗材',
  food: '食品',
  other: '其他',
};
