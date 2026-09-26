import type { InventoryItem, Warehouse } from './types';
import { DEFAULT_CATEGORIES, nowIso, isNearExpiry, isExpired } from './types';

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
  images: new Map<string, string>(),
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
    mem.warehouses.set(wid, {
      id: wid,
      name: '我的仓库',
      note: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    for (const r of rows) {
      const item: InventoryItem = {
        id: r.id,
        warehouseId: wid,
        parentId: null,
        code: r.code ?? null,
        codeType: (r.codeType as InventoryItem['codeType']) ?? null,
        name: r.name,
        category: r.category ?? '其他',
        location: (r as { location?: string }).location ?? '',
        note: r.note ?? '',
        qty: r.qty ?? 0,
        unit: r.unit ?? '件',
        purchasePrice: r.purchasePrice ?? null,
        salePrice: null,
        currency: r.currency ?? 'CNY',
        lowStockAt: r.lowStockAt ?? 2,
        productionDate: null,
        shelfLifeMonths: null,
        expiryDate: null,
        nearExpiryMonths: 1,
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
  mem.warehouses.set(wid, {
    id: wid,
    name: '我的仓库',
    note: '本机默认仓库',
    createdAt: ts(10080),
    updatedAt: ts(5),
  });
  mem.meta.set('activeWarehouseId', wid);
  mem.meta.set('categories', [...DEFAULT_CATEGORIES]);
  mem.meta.set('theme', 'system');

  const samples: Array<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'deleted'>> = [
    {
      warehouseId: wid,
      parentId: null,
      code: '6901234567892',
      codeType: 'EAN13',
      name: '无线键盘 K3',
      category: '数码',
      location: 'A架-01',
      note: '已贴资产标',
      qty: 12,
      unit: '个',
      purchasePrice: 199,
      salePrice: null,
      currency: 'CNY',
      lowStockAt: 3,
      productionDate: null,
      shelfLifeMonths: null,
      expiryDate: null,
      nearExpiryMonths: 1,
      customFields: [],
      imageIds: [],
    },
    {
      warehouseId: wid,
      parentId: null,
      code: '6923456789012',
      codeType: 'EAN13',
      name: 'Type-C 数据线',
      category: '耗材',
      location: 'B抽-02',
      note: '',
      qty: 48,
      unit: '条',
      purchasePrice: 19.9,
      salePrice: 29.9,
      currency: 'CNY',
      lowStockAt: 10,
      productionDate: null,
      shelfLifeMonths: null,
      expiryDate: null,
      nearExpiryMonths: 1,
      customFields: [],
      imageIds: [],
    },
    {
      warehouseId: wid,
      parentId: null,
      code: '6971234500123',
      codeType: 'EAN13',
      name: '便携风扇',
      category: '数码',
      location: 'A架-03',
      note: '夏季常用',
      qty: 2,
      unit: '台',
      purchasePrice: 89,
      salePrice: null,
      currency: 'CNY',
      lowStockAt: 2,
      productionDate: null,
      shelfLifeMonths: null,
      expiryDate: null,
      nearExpiryMonths: 1,
      customFields: [],
      imageIds: [],
    },
    {
      warehouseId: wid,
      parentId: null,
      code: 'QR-BOX-M-08',
      codeType: 'QR',
      name: '收纳箱 · 中号',
      category: '家居',
      location: 'C区-堆头',
      note: '',
      qty: 15,
      unit: '个',
      purchasePrice: 35,
      salePrice: null,
      currency: 'CNY',
      lowStockAt: 4,
      productionDate: null,
      shelfLifeMonths: null,
      expiryDate: null,
      nearExpiryMonths: 1,
      customFields: [],
      imageIds: [],
    },
  ];
  samples.forEach((s, i) => {
    const id = uid();
    mem.items.set(id, {
      ...s,
      id,
      createdAt: ts(1440 - i * 37),
      updatedAt: ts(30 - i * 5),
      version: 1,
      deleted: false,
    });
  });
  // 演示数据：同一商品条码下的第二个批次（子项，生产日期不同）
  const firstSample = Array.from(mem.items.values())[0];
  if (firstSample) {
    const childId = uid();
    mem.items.set(childId, {
      ...firstSample,
      id: childId,
      parentId: firstSample.id,
      name: `${firstSample.name}（第二批）`,
      qty: 6,
      productionDate: '2026-03-01',
      shelfLifeMonths: 24,
      expiryDate: '2028-03-01',
      nearExpiryMonths: 1,
      createdAt: ts(600),
      updatedAt: ts(20),
      version: 1,
      deleted: false,
    });
  }
  mem.meta.set(KEYS.migrated, true);
  persistAll();
}

function bootstrap() {
  if (mem.ready) return;
  const items = load<InventoryItem[]>(KEYS.items, []);
  const warehouses = load<Warehouse[]>(KEYS.warehouses, []);
  const meta = load<Record<string, unknown>>(KEYS.meta, {});
  const images = load<Record<string, string>>(KEYS.images, {});
  // v2 之前的数据没有 parentId，统一补 null
  for (const i of items) mem.items.set(i.id, { ...i, parentId: i.parentId ?? null });
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

/* warehouses */
export function listWarehouses(): Warehouse[] {
  bootstrap();
  return Array.from(mem.warehouses.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getWarehouse(id: string) {
  bootstrap();
  return mem.warehouses.get(id) ?? null;
}

export function createWarehouse(name: string, note = '') {
  bootstrap();
  const now = nowIso();
  const w: Warehouse = {
    id: uid(),
    name: name.trim() || '新仓库',
    note,
    createdAt: now,
    updatedAt: now,
  };
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
  const rows = Array.from(mem.items.values()).filter((i) => i.warehouseId === warehouseId && !i.deleted);
  return {
    total: rows.length,
    inStock: rows.filter((i) => i.qty > 0).length,
    low: rows.filter((i) => i.qty <= i.lowStockAt && i.qty > 0).length,
    zero: rows.filter((i) => i.qty === 0).length,
    near: rows.filter((i) => isNearExpiry(i)).length,
    expired: rows.filter((i) => isExpired(i)).length,
  };
}

/* categories / locations */
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

export function listLocations(): string[] {
  bootstrap();
  const saved = mem.meta.get('locations');
  if (Array.isArray(saved)) return saved as string[];
  const used = new Set(
    Array.from(mem.items.values())
      .filter((i) => !i.deleted && i.location)
      .map((i) => i.location),
  );
  return Array.from(used);
}

export function addLocation(name: string) {
  bootstrap();
  const list = listLocations();
  const n = name.trim();
  if (!n) return list;
  if (!list.includes(n)) {
    list.push(n);
    mem.meta.set('locations', list);
    persistAll();
  }
  return list;
}

export function saveCategories(list: string[]) {
  bootstrap();
  mem.meta.set('categories', list.map((s) => s.trim()).filter(Boolean));
  persistAll();
}

export function saveLocations(list: string[]) {
  bootstrap();
  mem.meta.set('locations', list.map((s) => s.trim()).filter(Boolean));
  persistAll();
}

export function deleteCategory(name: string) {
  bootstrap();
  mem.meta.set('categories', listCategories().filter((c) => c !== name));
  for (const item of mem.items.values()) {
    if (item.category === name) {
      item.category = '其他';
      item.updatedAt = nowIso();
      item.version += 1;
    }
  }
  persistAll();
}

export function deleteLocation(name: string) {
  bootstrap();
  mem.meta.set('locations', listLocations().filter((c) => c !== name));
  for (const item of mem.items.values()) {
    if (item.location === name) {
      item.location = '';
      item.updatedAt = nowIso();
      item.version += 1;
    }
  }
  persistAll();
}

/* theme */
export function getTheme(): ThemeMode {
  bootstrap();
  return (mem.meta.get('theme') as ThemeMode) ?? 'system';
}

export function setTheme(mode: ThemeMode) {
  bootstrap();
  mem.meta.set('theme', mode);
  persistAll();
}

/* items */
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

export function putItem(item: InventoryItem) {
  bootstrap();
  mem.items.set(item.id, item);
  persistAll();
  return item;
}

export function findByCode(code: string, warehouseId?: string | null) {
  const wid = warehouseId ?? getActiveWarehouseId();
  const all = Array.from(mem.items.values());
  return all.find((i) => !i.deleted && i.code === code && (!wid || i.warehouseId === wid)) ?? null;
}

/* ---- 同条码多批次（子项） ---- */

/** 按批次排序：生产日期 → 到期日期 → 创建时间 */
export function sortByBatch(rows: InventoryItem[]): InventoryItem[] {
  return [...rows].sort((a, b) => {
    const ka = a.productionDate ?? a.expiryDate ?? a.createdAt;
    const kb = b.productionDate ?? b.expiryDate ?? b.createdAt;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** 同一仓库内该条码下的全部物品（父项 + 子项） */
export function listByCode(code: string, warehouseId?: string | null): InventoryItem[] {
  bootstrap();
  const wid = warehouseId ?? getActiveWarehouseId();
  const rows = Array.from(mem.items.values()).filter(
    (i) => !i.deleted && i.code === code && (!wid || i.warehouseId === wid),
  );
  return sortByBatch(rows);
}

export function listChildren(parentId: string): InventoryItem[] {
  bootstrap();
  return sortByBatch(
    Array.from(mem.items.values()).filter((i) => !i.deleted && i.parentId === parentId),
  );
}

export function countChildren(parentId: string): number {
  bootstrap();
  let n = 0;
  for (const i of mem.items.values()) if (!i.deleted && i.parentId === parentId) n += 1;
  return n;
}

export function getParentOf(item: InventoryItem): InventoryItem | null {
  bootstrap();
  if (!item.parentId) return null;
  return mem.items.get(item.parentId) ?? null;
}

/**
 * 把 parentId 归一到「根物品」。
 *
 * 规则：同一条码下只允许两层 —— 父项 + 子项。子项不能再挂子项。
 * 所以任何指向子项的 parentId 都会被上溯到它的父项；上溯不到（父项已删或不存在）
 * 就返回 null，让这条物品成为独立物品，而不是挂到一个子项下面变成孙子项。
 */
export function normalizeParentId(parentId: string | null | undefined): string | null {
  if (!parentId) return null;
  bootstrap();
  let cur = mem.items.get(parentId);
  if (!cur) return null;
  let guard = 0;
  while (cur.parentId && guard++ < 10) {
    const next = mem.items.get(cur.parentId);
    if (!next) break;
    cur = next;
  }
  return cur.deleted ? null : cur.id;
}

/** 同条码下日期完全相同的批次，用于提示重复 */
export function findSameBatch(
  code: string,
  productionDate: string | null,
  expiryDate: string | null,
  warehouseId?: string | null,
  excludeId?: string,
): InventoryItem | null {
  return (
    listByCode(code, warehouseId).find(
      (i) =>
        i.id !== excludeId &&
        (i.productionDate ?? null) === (productionDate ?? null) &&
        (i.expiryDate ?? null) === (expiryDate ?? null),
    ) ?? null
  );
}

export function createItem(
  data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'deleted'>,
) {
  bootstrap();
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
  if (item.location) addLocation(item.location);
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
  if (next.location) addLocation(next.location);
  persistAll();
  return next;
}

export function softDeleteItem(id: string) {
  const target = getItem(id);
  if (!target) return null;
  // 删除父项时，其同条码子项一并删除，避免留下无归属批次
  for (const child of listChildren(id)) updateItem(child.id, { deleted: true });
  return updateItem(id, { deleted: true });
}

/** 传 key 可原址覆盖（例如把旋转后的图片写回同一张图，避免留下孤儿数据） */
export function saveImageDataUrl(dataUrl: string, key?: string) {
  bootstrap();
  const k = key ?? uid();
  mem.images.set(k, dataUrl);
  persistAll();
  return k;
}

export function getImageDataUrl(key: string) {
  bootstrap();
  return mem.images.get(key) ?? null;
}

/**
 * 收集这些物品引用到的图片（key → dataURL），用于「换机全量迁移」。
 * 导出包如果只带 imageIds 而不带图片本身，导到另一台手机后图片全是空占位 ——
 * 这是之前图片过不去的原因。
 */
export function imagesForItems(items: InventoryItem[]): Record<string, string> {
  bootstrap();
  const out: Record<string, string> = {};
  for (const it of items) {
    for (const key of it.imageIds) {
      if (out[key]) continue;
      const v = mem.images.get(key);
      if (v) out[key] = v;
    }
  }
  return out;
}

/** 批量写入图片（导入数据包时用），已存在同 key 则覆盖 */
export function restoreImages(map: Record<string, string> | null | undefined): number {
  if (!map) return 0;
  bootstrap();
  let n = 0;
  for (const [key, value] of Object.entries(map)) {
    if (typeof value === 'string' && value.startsWith('data:')) {
      mem.images.set(key, value);
      n += 1;
    }
  }
  if (n) persistAll();
  return n;
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
  mem.ready = false;
  bootstrap();
}

export type FieldTemplate = { key: string; label: string };

/* ---- 回收站（软删除物品的查看 / 恢复 / 彻底删除） ---- */

/** 全部软删除物品（跨仓库），按更新时间倒序 */
export function listDeletedItems(): InventoryItem[] {
  bootstrap();
  return Array.from(mem.items.values())
    .filter((i) => i.deleted)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** 从回收站恢复。父项恢复时连带其已删子项批次一起恢复，返回恢复条数 */
export function restoreItem(id: string): number {
  bootstrap();
  const it = mem.items.get(id);
  if (!it || !it.deleted) return 0;
  let n = 1;
  it.deleted = false;
  it.updatedAt = nowIso();
  it.version += 1;
  for (const c of mem.items.values()) {
    if (c.deleted && c.parentId === id) {
      c.deleted = false;
      c.updatedAt = it.updatedAt;
      c.version += 1;
      n += 1;
    }
  }
  persistAll();
  return n;
}

/** 彻底删除：记录从存储移除，仅被它引用的图片一并清理 */
export function purgeItem(id: string): boolean {
  bootstrap();
  const it = mem.items.get(id);
  if (!it) return false;
  mem.items.delete(id);
  const referenced = new Set<string>();
  for (const other of mem.items.values()) {
    for (const k of other.imageIds) referenced.add(k);
  }
  for (const k of it.imageIds) {
    if (!referenced.has(k)) mem.images.delete(k);
  }
  persistAll();
  return true;
}

/** 清空回收站（彻底删除全部软删物品），返回清除条数 */
export function purgeAllDeleted(): number {
  bootstrap();
  const dead = Array.from(mem.items.values()).filter((i) => i.deleted);
  for (const it of dead) purgeItem(it.id);
  return dead.length;
}

export function listFieldTemplates(): FieldTemplate[] {
  bootstrap();
  const saved = mem.meta.get('fieldTemplates');
  if (Array.isArray(saved)) return saved as FieldTemplate[];
  return [];
}

export function saveFieldTemplates(list: FieldTemplate[]) {
  bootstrap();
  mem.meta.set(
    'fieldTemplates',
    list.filter((f) => f.label.trim()),
  );
  persistAll();
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
