/** 全局字体缩放（设置 → 字体大小） */

export type FontScale = 'small' | 'normal' | 'large' | 'xlarge';

export const FONT_SCALE_OPTIONS: Array<{ key: FontScale; label: string; value: number }> = [
  { key: 'small', label: '小', value: 0.9 },
  { key: 'normal', label: '标准', value: 1 },
  { key: 'large', label: '大', value: 1.1 },
  { key: 'xlarge', label: '特大', value: 1.22 },
];

const KEY = 'localscan.fontScale.v1';

export function loadFontScale(): FontScale {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && FONT_SCALE_OPTIONS.some((o) => o.key === raw)) return raw as FontScale;
  } catch {
    /* ignore */
  }
  return 'normal';
}

export function saveFontScale(scale: FontScale) {
  try {
    localStorage.setItem(KEY, scale);
  } catch {
    /* quota */
  }
}

/** 写进 :root 的 --font-scale，App.css 里 html{font-size:calc(16px * var(--font-scale))} 负责放大 */
export function applyFontScale(scale: FontScale = loadFontScale()) {
  const opt = FONT_SCALE_OPTIONS.find((o) => o.key === scale) ?? FONT_SCALE_OPTIONS[1];
  document.documentElement.style.setProperty('--font-scale', String(opt.value));
}
