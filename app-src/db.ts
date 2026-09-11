import type { InventoryItem, Warehouse } from './types';
import { DEFAULT_CATEGORIES, nowIso } from './types';

const KEYS = {
  items: 'localscan.items.v2',
  warehouses: 'localscan.warehouses.v2',
  meta: 'localscan.meta.v2',
  images: 'localscan.images.v2',
  migrated: 'localscan.migrated.v2',
};

type ThemeMode = 'light' | 'dark' | 'system';

const mem = {
  items: new Map<string, InventoryItem>(),
  warehouses: new Map<string, Warehouse>(),
  images: new Map<string, string>(), // id -> dataUrl
  meta: new Map<string, unknown>(),
  ready: false,
};

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function persistAll() {
  save(KEYS.items, Array.from(mem.items.values()));
  save(KEYS.warehouses, Array.from(mem.warehouses.values()));
  save(KEYS.meta, Object.fromEntries(mem.meta));
  save(KEYS.images, Object.fromEntries(mem.images));
}

function migrateV1() {
  try {
    const oldItems = localStorage.getItem('localscan.items');
    const oldMeta = localStorage.getItem('localscan.meta');
    const migrated = localStorage.getItem(KEYS.migrated);
    if (migrated || !oldItems) return;
    const rows = JSON.parse(oldItems) as Array<Partial<InventoryItem> & { id: string; name: string }>;
    if (!rows.length) return;
    const wid = uid();
    const wh: Warehouse = {
      id: wid,
      name: '我的仓库',
      note: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    mem.warehouses.set(wid, wh);
    for (const r of rows) {
      const item: InventoryItem = {
        id: r.id,
        warehouseId: wid,
        code: r.code ?? null,
        codeType: (r.codeType as InventoryItem['codeType']) ?? null,
        name: r.name,
        category: r.category ?? '其他',
        note: r.note ?? '',
        qty: r.qty ?? 0,
        unit: r.unit ?? '件',
        purchasePrice: r.purchasePrice ?? null,
        salePrice: null,
        currency: r.currency ?? 'CNY',
        lowStockAt: r.lowStockAt ?? 2,
        customFields: [],
        imageIds: r.imageIds ?? [],
        createdAt: r.createdAt ?? nowIso(),
        updatedAt: r.updatedAt ?? nowIso(),
        version: r.version ?? 1,
        deleted: r.deleted ?? false,
      };
      mem.items.set(item.id, item);
    }
    if (oldMeta) {
      const meta = JSON.parse(oldMeta) as Record<string, unknown>;
      for (const [k, v] of Object.entries(meta)) mem.meta.set(k, v);
    }
    mem.meta.set('activeWarehouseId', wid);
    mem.meta.set(KEYS.migrated, true);
    persistAll();
    localStorage.removeItem('localscan.items');
    localStorage.removeItem('localscan.meta');
  } catch {
    /* ignore */
  }
}

function seed() {
  const wid = uid();
  const t0 = Date.now();
  const ts = (offsetMin: number) => new Date(t0 - offsetMin * 60_000).toISOString();
  const wh: Warehouse = {
    id: wid,
    name: '我的仓库',
    note: '本机默认仓库',
    createdAt: ts(10080),
    updatedAt: ts(5),
  };
  mem.warehouses.set(wid, wh);
  mem.meta.set('activeWarehouseId', wid);
  mem.meta.set('categories', ['数码', '工具', '家居', '服饰', '耗材', '办公', '食品', '其他']);
  mem.meta.set('theme', 'system');

  const samples: Array<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'deleted'>> = [
    {
      warehouseId: wid,
      code: '6901234567892',
      codeType: 'EAN13',
      name: '无线键盘 K3',
      category: '数码',
      note: '已贴资产标',
      qty: 12,
      unit: '个',
      purchasePrice: 199,
      salePrice: null,
      currency: 'CNY',
      lowStockAt: 3,
      customFields: [],
      imageIds: [],
    },
    {
      warehouseId: wid,
      code: '6923456789012',
      codeType: 'EAN13',
      name: 'Type-C 数据线',
      category: '耗材',
      note: '',
      qty: 48,
      unit: '条',
      purchasePrice: 19.9,
      salePrice: 29.9,
      currency: 'CNY',
      lowStockAt: 10,
      customFields: [],
      imageIds: [],
    },
    {
      warehouseId: wid,
      code: '6971234500123',
      codeType: 'EAN13',
      name: '便携风扇',
      category: '数码',
      note: '夏季常用',
      qty: 2,
      unit: '台',
      purchasePrice: 89,
      salePrice: null,
      currency: 'CNY',
      lowStockAt: 2,
      customFields: [],
      imageIds: [],
    },
    {
      warehouseId: wid,
      code: 'QR-BOX-M-08',
      codeType: 'QR',
      name: '收纳箱 · 中号',
      category: '家居',
      note: '',
      qty: 15,
      unit: '个',
      purchasePrice: 35,
      salePrice: null,
      currency: 'CNY',
      lowStockAt: 4,
      customFields: [],
      imageIds: [],
    },
  ];

  // Stagger timestamps so each item has a distinct, realistic time
  samples.forEach((s, i) => {
    const created = ts(1440 - i * 37);
    const item: InventoryItem = {
      ...s,
      id: uid(),
      createdAt: created,
      updatedAt: ts(30 - i * 5),
      version: 1,
      deleted: false,
    };
    mem.items.set(item.id, item);
  });
  mem.meta.set(KEYS.migrated, true);
  persistAll();
}

function bootstrap() {
  if (mem.ready) return;
  const items = load<InventoryItem[]>(KEYS.items, []);
  const warehouses = load<Warehouse[]>(KEYS.warehouses, []);
  const meta = load<Record<string, unknown>>(KEYS.meta, {});
  const images = load<Record<string, string>>(KEYS.images, {});

  for (const i of items) mem.items.set(i.id, i);
  for (const w of warehouses) mem.warehouses.set(w.id, w);
  for (const [k, v] of Object.entries(meta)) mem.meta.set(k, v);
  for (const [k, v] of Object.entries(images)) mem.images.set(k, v);
  mem.ready = true;

  if (!mem.meta.get(KEYS.migrated) && mem.warehouses.size === 0 && mem.items.size === 0) {
    const hasV1 = localStorage.getItem('localscan.items');
    if (hasV1) migrateV1();
    else seed();
  }
}

/* ---------- warehouses ---------- */

export function listWarehouses(): Warehouse[] {
  bootstrap();
  return Array.from(mem.warehouses.values()).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function getWarehouse(id: string) {
  bootstrap();
  return mem.warehouses.get(id) ?? null;
}

export function createWarehouse(name: string, note = '') {
  bootstrap();
  const now = nowIso();
  const w: Warehouse = { id: uid(), name: name.trim() || '新仓库', note, createdAt: now, updatedAt: now };
  mem.warehouses.set(w.id, w);
  persistAll();
  return w;
}

export function updateWarehouse(id: string, patch: Partial<Warehouse>) {
  bootstrap();
  const prev = mem.warehouses.get(id);
  if (!prev) throw new Error('仓库不存在');
  const next = { ...prev, ...patch, id, updatedAt: nowIso() };
  mem.warehouses.set(id, next);
  persistAll();
  return next;
}

export function deleteWarehouse(id: string) {
  bootstrap();
  mem.warehouses.delete(id);
  for (const [k, item] of mem.items) {
    if (item.warehouseId === id) mem.items.delete(k);
  }
  if (mem.meta.get('activeWarehouseId') === id) {
    const rest = listWarehouses();
    mem.meta.set('activeWarehouseId', rest[0]?.id ?? null);
  }
  persistAll();
}

export function getActiveWarehouseId(): string | null {
  bootstrap();
  const id = mem.meta.get('activeWarehouseId') as string | null;
  if (id && mem.warehouses.has(id)) return id;
  const first = listWarehouses()[0];
  return first?.id ?? null;
}

export function setActiveWarehouseId(id: string) {
  bootstrap();
  mem.meta.set('activeWarehouseId', id);
  persistAll();
}

export function warehouseStats(warehouseId: string) {
  bootstrap();
  const rows = Array.from(mem.items.values()).filter(
    (i) => i.warehouseId === warehouseId && !i.deleted,
  );
  return {
    total: rows.length,
    low: rows.filter((i) => i.qty <= i.lowStockAt).length,
    inStock: rows.filter((i) => i.qty > 0).length,
  };
}

/* ---------- categories ---------- */

export function listCategories(): string[] {
  bootstrap();
  const saved = mem.meta.get('categories');
  if (Array.isArray(saved) && saved.length) return saved as string[];
  const used = new Set(
    Array.from(mem.items.values())
      .filter((i) => !i.deleted)
      .map((i) => i.category),
  );
  for (const c of DEFAULT_CATEGORIES) used.add(c);
  return Array.from(used);
}

export function addCategory(name: string) {
  bootstrap();
  const list = listCategories();
  const n = name.trim();
  if (!n) return list;
  if (!list.includes(n)) {
    list.push(n);
    mem.meta.set('categories', list);
    persistAll();
  }
  return list;
}

/* ---------- theme ---------- */

export function getTheme(): ThemeMode {
  bootstrap();
  return (mem.meta.get('theme') as ThemeMode) ?? 'system';
}

export function setTheme(mode: ThemeMode) {
  bootstrap();
  mem.meta.set('theme', mode);
  persistAll();
}

/* ---------- items ---------- */

export function listItems(opts?: {
  warehouseId?: string | null;
  includeDeleted?: boolean;
  query?: string;
  category?: string | null;
}): InventoryItem[] {
  bootstrap();
  const wid = opts?.warehouseId ?? getActiveWarehouseId();
  let rows = Array.from(mem.items.values());
  if (wid) rows = rows.filter((i) => i.warehouseId === wid);
  if (!opts?.includeDeleted) rows = rows.filter((i) => !i.deleted);
  if (opts?.category && opts.category !== '全部') {
    rows = rows.filter((i) => i.category === opts.category);
  }
  const q = (opts?.query ?? '').trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.code ?? '').toLowerCase().includes(q) ||
        i.note.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q),
    );
  }
  rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return rows;
}

export function getItem(id: string) {
  bootstrap();
  return mem.items.get(id) ?? null;
}

export function findByCode(code: string, warehouseId?: string | null) {
  const wid = warehouseId ?? getActiveWarehouseId();
  const all = Array.from(mem.items.values());
  return (
    all.find((i) => !i.deleted && i.code === code && (!wid || i.warehouseId === wid)) ?? null
  );
}

export function createItem(
  data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'deleted'>,
) {
  bootstrap();
  // Always use the device clock at call time
  const stamp = new Date().toISOString();
  const item: InventoryItem = {
    ...data,
    warehouseId: data.warehouseId || getActiveWarehouseId() || '',
    id: uid(),
    createdAt: stamp,
    updatedAt: stamp,
    version: 1,
    deleted: false,
  };
  mem.items.set(item.id, item);
  if (item.category) addCategory(item.category);
  persistAll();
  return item;
}

export function updateItem(id: string, patch: Partial<InventoryItem>) {
  bootstrap();
  const prev = mem.items.get(id);
  if (!prev) throw new Error('物品不存在');
  const stamp = new Date().toISOString();
  const next: InventoryItem = {
    ...prev,
    ...patch,
    id,
    updatedAt: stamp,
    version: prev.version + 1,
  };
  mem.items.set(id, next);
  if (next.category) addCategory(next.category);
  persistAll();
  return next;
}

export function softDeleteItem(id: string) {
  return updateItem(id, { deleted: true });
}

export function saveImageDataUrl(dataUrl: string) {
  bootstrap();
  const key = uid();
  mem.images.set(key, dataUrl);
  persistAll();
  return key;
}

export function getImageDataUrl(key: string) {
  bootstrap();
  return mem.images.get(key) ?? null;
}

export function wipeAll() {
  bootstrap();
  mem.items.clear();
  mem.warehouses.clear();
  mem.images.clear();
  mem.meta.clear();
  localStorage.removeItem(KEYS.items);
  localStorage.removeItem(KEYS.warehouses);
  localStorage.removeItem(KEYS.meta);
  localStorage.removeItem(KEYS.images);
  localStorage.removeItem(KEYS.migrated);
  seed();
}

export function statsForActive() {
  const rows = listItems();
  const inStock = rows.filter((i) => i.qty > 0).length;
  const low = rows.filter((i) => i.qty <= i.lowStockAt).length;
  const today = new Date().toISOString().slice(0, 10);
  const addedToday = rows.filter((i) => i.createdAt.startsWith(today)).length;
  return { total: rows.length, inStock, low, addedToday };
}

export function allItemsIncludingDeleted(warehouseId?: string | null) {
  bootstrap();
  const wid = warehouseId ?? null;
  const rows = Array.from(mem.items.values());
  return wid ? rows.filter((i) => i.warehouseId === wid) : rows;
}

export function putItem(item: InventoryItem) {
  bootstrap();
  mem.items.set(item.id, item);
  persistAll();
  return item;
}

export type { DEFAULT_CATEGORIES };
