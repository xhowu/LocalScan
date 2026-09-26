export interface Warehouse {
  id: string;
  name: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomField {
  key: string;
  label: string;
  value: string;
}

export type CodeType = 'EAN13' | 'EAN8' | 'UPC' | 'CODE128' | 'QR' | 'CODE39' | 'OTHER' | null;

export interface InventoryItem {
  id: string;
  warehouseId: string;
  code: string | null;
  codeType: CodeType;
  name: string;
  category: string;
  /** 存放位置，可自定义，如 A架-03 */
  location: string;
  note: string;
  qty: number;
  unit: string;
  purchasePrice: number | null;
  salePrice: number | null;
  currency: string;
  lowStockAt: number;
  /** 生产日期 yyyy-mm-dd */
  productionDate: string | null;
  /** 保质期（月） */
  shelfLifeMonths: number | null;
  /** 截止/到期日期 yyyy-mm-dd */
  expiryDate: string | null;
  /** 临期阈值（月）：距截止日期 N 个月内算临期 */
  nearExpiryMonths: number | null;
  customFields: CustomField[];
  imageIds: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
  deleted: boolean;
}

export type InventoryItemInput = Omit<
  InventoryItem,
  'id' | 'warehouseId' | 'createdAt' | 'updatedAt' | 'version' | 'deleted'
> & {
  id?: string;
  warehouseId?: string;
};

export const DEFAULT_CATEGORIES = [
  '数码',
  '工具',
  '家居',
  '服饰',
  '耗材',
  '办公',
  '食品',
  '其他',
] as const;

export function emptyItem(warehouseId: string): InventoryItemInput {
  return {
    warehouseId,
    code: null,
    codeType: null,
    name: '',
    category: '其他',
    location: '',
    note: '',
    qty: 1,
    unit: '件',
    purchasePrice: null,
    salePrice: null,
    currency: 'CNY',
    lowStockAt: 2,
    productionDate: null,
    shelfLifeMonths: null,
    expiryDate: null,
    nearExpiryMonths: 1,
    customFields: [],
    imageIds: [],
  };
}

/** Parse 20260911 or 2026-09-11 → Date (local noon to avoid TZ issues) */
export function parseDateInput(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  if (/^\d{8}$/.test(s)) {
    y = Number(s.slice(0, 4));
    m = Number(s.slice(4, 6));
    d = Number(s.slice(6, 8));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const p = s.split('-').map(Number);
    y = p[0];
    m = p[1];
    d = p[2];
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function toDateInput(d: Date | null): string {
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function formatDateCN(iso: string | null): string {
  if (!iso) return '';
  const d = parseDateInput(iso);
  if (!d) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日`;
}

export function addMonths(d: Date, months: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const target = new Date(y, m + months, 1, 12, 0, 0);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return target;
}

export function monthsBetween(a: Date, b: Date): number {
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return months;
}

/** 是否已过期 */
export function isExpired(item: { expiryDate: string | null }): boolean {
  if (!item.expiryDate) return false;
  const exp = parseDateInput(item.expiryDate);
  if (!exp) return false;
  return exp.getTime() < Date.now() - 86400000;
}

/** 是否临期：expiry - now <= nearExpiryMonths */
export function isNearExpiry(item: {
  expiryDate: string | null;
  nearExpiryMonths: number | null;
}): boolean {
  if (!item.expiryDate) return false;
  const exp = parseDateInput(item.expiryDate);
  if (!exp) return false;
  if (exp.getTime() < Date.now() - 86400000) return false; // expired is not near
  const months = item.nearExpiryMonths ?? 1;
  const limit = addMonths(new Date(), months);
  return exp.getTime() <= limit.getTime();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}
