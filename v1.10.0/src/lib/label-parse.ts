/**
 * 中文商品标签文本解析。
 * 输入 OCR 得到的文本行，输出可映射到物品字段的候选值。
 * 纯启发式，不联网；识别不到就返回 null，由界面决定是否留空。
 */

import { addMonths, parseDateInput, toDateInput } from '../types';

export type LabelFields = {
  name: string | null;
  code: string | null;
  brand: string | null;
  spec: string | null;
  netContent: string | null;
  productionDate: string | null;
  shelfLifeMonths: number | null;
  shelfLifeText: string | null;
  expiryDate: string | null;
  manufacturer: string | null;
  origin: string | null;
  storage: string | null;
  ingredients: string | null;
  standard: string | null;
};

const FULLWIDTH_DIGITS = '０１２３４５６７８９';

function toHalf(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String(FULLWIDTH_DIGITS.indexOf(c)))
    .replace(/[：]/g, ':')
    .replace(/[．]/g, '.')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')');
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function buildDate(y: number, m: number, d: number): string | null {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 归一化各种日期写法：20260301 / 2026-03-01 / 2026年3月1日 / 26.3.1 */
export function normalizeDate(raw: string): string | null {
  const s = toHalf(raw).replace(/\s/g, '');
  let m = s.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (m) return buildDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/(\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (m) {
    const y = Number(m[1]);
    return buildDate(y >= 70 ? 1900 + y : 2000 + y, Number(m[2]), Number(m[3]));
  }
  m = s.match(/(?<!\d)(20\d{6})(?!\d)/);
  if (m) {
    const v = m[1];
    return buildDate(Number(v.slice(0, 4)), Number(v.slice(4, 6)), Number(v.slice(6, 8)));
  }
  return null;
}

const RE = {
  dateLabeled:
    /(?:生产|制造|灌装|包装|出生|加工)日期[^\S\n]{0,4}[:\s]?[^\S\n]{0,2}([0-9０-９]{2,4}\s*[-/.年]?\s*[0-9０-９]{1,2}\s*[-/.月]?\s*[0-9０-９]{1,2}\s*日?)/,
  expiryLabeled:
    /(?:有效日期|到期日期|保质期至|此日期前食用|限用日期)[^\S\n]{0,4}[:\s]?[^\S\n]{0,2}([0-9０-９]{2,4}\s*[-/.年]?\s*[0-9０-９]{1,2}\s*[-/.月]?\s*[0-9０-９]{1,2}\s*日?)/,
  barcodeDate: /(?<!\d)(20\d{6})(?!\d)/,
  shelfLife: /(?:保质期|保存期|保质期限|品质保持期|保质)[^\d０-９]{0,6}([0-9０-９]+(?:\.[0-9]+)?)\s*(个月|月|天|日|年|周)/,
  netContent:
    /净\s*含\s*量[^\dA-Za-z０-９]{0,4}([0-9０-９.]+\s*(?:kg|KG|g|G|ml|mL|ML|L|克|千克|公斤|毫升|升|斤|袋|包|瓶|罐|盒|枚|片|支|条|张))(?:\s*[×xX*]\s*([0-9０-９]+)\s*(?:袋|包|瓶|罐|盒|枚|片|支|条|张))?/i,
  spec: /规\s*格[^\S\n]{0,4}[:\s]?[^\S\n]{0,2}([^\n]{1,30})/,
  name: /(?:产品名称|商品名称|品\s*名|名\s*称)[^\S\n]{0,4}[:\s]?[^\S\n]{0,2}([^\n]{1,30})/,
  brand: /品\s*牌[^\S\n]{0,4}[:\s]?[^\S\n]{0,2}([^\n]{1,20})/,
  manufacturer:
    /(?:生产企业|生产商|制造商|委托生产商|委托方|受托方|生产厂家|出品|经销商)[^\S\n]{0,4}[:\s]?[^\S\n]{0,2}([^\n]{1,40})/,
  origin: /(?:产\s*地|原产国|生产地址|原产地)[^\S\n]{0,4}[:\s]?[^\S\n]{0,2}([^\n]{1,30})/,
  storage: /(?:贮存条件|贮存方法|储藏方法|保存方法|储存条件|贮藏条件|贮藏方法)[^\S\n]{0,4}[:\s]?[^\S\n]{0,2}([^\n]{1,40})/,
  ingredients: /(?:配\s*料|配料表|原料)[^\S\n]{0,4}[:\s]?[^\S\n]{0,2}([^\n]{1,80})/,
  standard: /(?:产品标准号|执行标准|标准代号|标准号)[^\S\n]{0,4}[:\s]?[^\S\n]{0,2}([A-Za-z0-9./\- ]{3,30})/,
};

/** 明显不是商品名称的行（避免把营养表/厂家信息当成名称） */
const NAME_BLOCKLIST =
  /净\s*含\s*量|配\s*料|保质期|生产日期|贮存|储藏|执行标准|产品标准|营养成分|能量|蛋白质|脂肪|碳水化合物|钠|地址|电话|传真|网址|www|http|客服|服务热线|条形码|条码|SC\d|Q\/|GB|撕开|开封|温馨提示|贮存条件|生产许可|产地|经销商|过敏原/;

const UNIT_TO_MONTHS = (n: number, unit: string): number => {
  if (unit === '年') return Math.round(n * 12);
  if (unit === '个月' || unit === '月') return Math.round(n);
  if (unit === '周') return Math.max(1, Math.round((n * 7) / 30));
  return Math.max(1, Math.round(n / 30)); // 天 / 日
};

function pick(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m) return null;
  const v = (m[1] ?? '').trim().replace(/[，,。;；]+$/, '');
  return v || null;
}

/** 从整段文本里抽第一个看起来像日期的值 */
function pickDate(text: string, labeled: RegExp): string | null {
  const m = text.match(labeled);
  if (m) {
    const d = normalizeDate(m[1]);
    if (d) return d;
  }
  return null;
}

function guessName(lines: string[]): string | null {
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 2 || line.length > 24) continue;
    if (NAME_BLOCKLIST.test(line)) continue;
    if (/^[\d\s\W]+$/.test(line)) continue;
    if (/\d{4,}/.test(line)) continue;
    return line;
  }
  return null;
}

export function parseLabelText(lines: string[]): LabelFields {
  const cleaned = lines.map((l) => toHalf(l.trim())).filter(Boolean);
  const text = cleaned.join('\n');
  const flat = cleaned.join(' ');

  const productionDate =
    pickDate(flat, RE.dateLabeled) ?? (RE.barcodeDate.test(flat) ? normalizeDate(flat.match(RE.barcodeDate)![1]) : null);

  let shelfLifeMonths: number | null = null;
  let shelfLifeText: string | null = null;
  const shelf = flat.match(RE.shelfLife);
  if (shelf) {
    const n = Number(shelf[1]);
    if (Number.isFinite(n) && n > 0) {
      shelfLifeMonths = UNIT_TO_MONTHS(n, shelf[2]);
      shelfLifeText = `${shelf[1]}${shelf[2]}`;
    }
  }

  let expiryDate = pickDate(flat, RE.expiryLabeled);
  if (!expiryDate && productionDate && shelfLifeMonths) {
    const prod = parseDateInput(productionDate);
    if (prod) expiryDate = toDateInput(addMonths(prod, shelfLifeMonths));
  }

  const net = flat.match(RE.netContent);
  const netContent = net ? `${net[1]}${net[2] ? `×${net[2]}` : ''}`.replace(/\s+/g, '') : null;

  const codeMatch = flat.match(/(?<!\d)(69\d{11}|\d{12,14}|\d{8})(?!\d)/);

  const specRaw = pick(text, RE.spec);
  const spec = specRaw ? specRaw.replace(/\s+/g, ' ').trim().slice(0, 30) : null;

  return {
    name: pick(text, RE.name) ?? guessName(cleaned),
    code: codeMatch ? codeMatch[1] : null,
    brand: pick(text, RE.brand),
    spec: spec && !/^(见|详见)/.test(spec) ? spec : null,
    netContent,
    productionDate,
    shelfLifeMonths,
    shelfLifeText,
    expiryDate,
    manufacturer: pick(text, RE.manufacturer),
    origin: pick(text, RE.origin),
    storage: pick(text, RE.storage),
    ingredients: pick(text, RE.ingredients),
    standard: pick(text, RE.standard),
  };
}
