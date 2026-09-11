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
  note: string;
  qty: number;
  unit: string;
  purchasePrice: number | null;
  salePrice: number | null;
  currency: string;
  lowStockAt: number;
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
    note: '',
    qty: 1,
    unit: '件',
    purchasePrice: null,
    salePrice: null,
    currency: 'CNY',
    lowStockAt: 2,
    customFields: [],
    imageIds: [],
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
