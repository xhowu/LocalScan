import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { InventoryItem, Warehouse } from '../types';
import { formatTime } from '../types';
import { getImageDataUrl, allItemsIncludingDeleted, imagesForItems } from '../db';
import { saveFile, dateStamp } from '../lib/files';

type ExportRow = Record<string, string | number>;

/**
 * 把物品排成「父项在前、其子项紧随其后」的两级结构。
 * 同条码只允许两层（父项 + 子项），但历史数据里可能有更深的层级，
 * 这里统一上溯到最顶层的物品，保证不会有行被漏掉。
 */
function orderedPairs(
  items: InventoryItem[],
): Array<{ item: InventoryItem; depth: 0 | 1; rootName: string }> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rootOf = (it: InventoryItem): InventoryItem => {
    let cur = it;
    let guard = 0;
    while (cur.parentId && byId.has(cur.parentId) && guard++ < 10) {
      cur = byId.get(cur.parentId)!;
    }
    return cur;
  };
  const order: string[] = [];
  const groups = new Map<string, { root: InventoryItem; kids: InventoryItem[] }>();
  for (const it of items) {
    const root = rootOf(it);
    let g = groups.get(root.id);
    if (!g) {
      g = { root, kids: [] };
      groups.set(root.id, g);
      order.push(root.id);
    }
    if (it.id !== root.id) g.kids.push(it);
  }
  const out: Array<{ item: InventoryItem; depth: 0 | 1; rootName: string }> = [];
  for (const id of order) {
    const g = groups.get(id)!;
    out.push({ item: g.root, depth: 0, rootName: '' });
    for (const k of g.kids) out.push({ item: k, depth: 1, rootName: g.root.name });
  }
  return out;
}

/** 表格行：前两列标出层级与所属父项，方便在 Excel 里看出父子关系 */
function rowsFromItems(items: InventoryItem[]): ExportRow[] {
  return orderedPairs(items).map(({ item: i, depth, rootName }) => ({
    层级: depth === 0 ? '父项' : '└ 子项',
    所属父项: rootName,
    条码: i.code ?? '',
    名称: i.name,
    分类: i.category,
    数量: i.qty,
    单位: i.unit,
    购入价: i.purchasePrice ?? '',
    售价: i.salePrice ?? '',
    币种: i.currency,
    备注: i.note,
    低库存阈值: i.lowStockAt,
    入库时间: formatTime(i.createdAt),
    更新时间: formatTime(i.updatedAt),
    版本: i.version,
  }));
}

/** Excel 工作表名不能含 : \ / ? * [ ] 且不超 31 字 */
function safeSheetName(name: string, used: Set<string>): string {
  let s = (name || '仓库').replace(/[:\\/?*[\]]/g, '_').slice(0, 28);
  if (!s) s = '仓库';
  let out = s;
  let n = 2;
  while (used.has(out)) out = `${s}(${n++})`;
  used.add(out);
  return out;
}

/**
 * 生成工作簿：多仓时按仓库分工作表（类似 Excel 的多 sheet），
 * 最前面再加一张「全部」总表。
 */
function buildWorkbook(items: InventoryItem[], warehouses?: Warehouse[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const multi = !!warehouses && warehouses.length > 1;
  if (!multi) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsFromItems(items)), '库存');
    return wb;
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsFromItems(items)), '全部');
  used.add('全部');
  for (const w of warehouses!) {
    const rows = rowsFromItems(items.filter((i) => i.warehouseId === w.id));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), safeSheetName(w.name, used));
  }
  return wb;
}

export async function exportCsv(items: InventoryItem[], name?: string): Promise<string> {
  const rows = rowsFromItems(items);
  const headers = Object.keys(rows[0] ?? { 名称: '' });
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = String((r as Record<string, unknown>)[h] ?? '');
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(','),
    );
  }
  const filename = name ? `${name}.csv` : `localscan-${dateStamp()}.csv`;
  return saveFile(
    new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    filename,
  );
}

export async function exportXlsx(
  items: InventoryItem[],
  name?: string,
  warehouses?: Warehouse[],
): Promise<string> {
  const wb = buildWorkbook(items, warehouses);
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const filename = name ? `${name}.xlsx` : `localscan-${dateStamp()}.xlsx`;
  return saveFile(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );
}

export async function exportZipWithImages(
  items: InventoryItem[],
  name?: string,
  warehouses?: Warehouse[],
): Promise<string> {
  const zip = new JSZip();
  const xlsx = XLSX.write(buildWorkbook(items, warehouses), { type: 'array', bookType: 'xlsx' });
  zip.file('inventory.xlsx', xlsx);
  zip.file('inventory.json', JSON.stringify(items, null, 2));
  const imgFolder = zip.folder('images');
  for (const item of items) {
    for (const imageId of item.imageIds) {
      const dataUrl = getImageDataUrl(imageId);
      if (dataUrl) {
        const base64 = dataUrl.split(',')[1] ?? '';
        imgFolder?.file(`${item.id}-${imageId}.jpg`, base64, { base64: true });
      }
    }
  }
  const out = await zip.generateAsync({ type: 'blob' });
  const filename = name ? `${name}.zip` : `localscan-backup-${dateStamp()}.zip`;
  return saveFile(out, filename);
}

export async function exportEncryptedBackup(
  items: InventoryItem[],
  passphrase: string,
  name?: string,
  warehouses?: Warehouse[],
  withImages = true,
): Promise<string> {
  const payload = new TextEncoder().encode(
    JSON.stringify({
      kind: 'localscan-backup' as const,
      schema: 2,
      exportedAt: new Date().toISOString(),
      // 带上仓库表，恢复时才能把物品放回原仓库并还原仓库名。
      // 不带的话导入端只能造一个叫「导入的仓库」的新仓库。
      scope: warehouses ? ('all' as const) : ('warehouse' as const),
      warehouses,
      // 图片本体一起打包 —— 这是「一个文件换机」的关键
      images: withImages ? imagesForItems(items) : undefined,
      items,
    }),
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
  const pack = new Uint8Array(4 + salt.length + iv.length + cipher.byteLength);
  pack.set([0x4c, 0x53, 0x45, 0x4e], 0);
  pack.set(salt, 4);
  pack.set(iv, 20);
  pack.set(new Uint8Array(cipher), 32);
  const filename = name ? `${name}.enc` : `localscan-backup-${dateStamp()}.enc`;
  return saveFile(new Blob([pack], { type: 'application/octet-stream' }), filename);
}

export async function importEncryptedBackup(
  file: File,
  passphrase: string,
): Promise<ParsedSync> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] !== 0x4c || buf[1] !== 0x53 || buf[2] !== 0x45 || buf[3] !== 0x4e) {
    throw new Error('不是有效的 localscan 加密备份');
  }
  const salt = buf.slice(4, 20);
  const iv = buf.slice(20, 32);
  const data = buf.slice(32);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as {
      items?: InventoryItem[];
      warehouses?: Warehouse[];
      images?: Record<string, string>;
    };
    if (!Array.isArray(parsed.items)) throw new Error('备份内容不完整');
    const warehouses = Array.isArray(parsed.warehouses) ? parsed.warehouses : null;
    return {
      items: parsed.items,
      warehouses,
      images: parsed.images && typeof parsed.images === 'object' ? parsed.images : null,
      // 老版本备份不带仓库表 → 视为单仓数据
      scope: warehouses && warehouses.length > 0 ? 'all' : 'warehouse',
    };
  } catch (e) {
    if (e instanceof Error && e.message === '备份内容不完整') throw e;
    throw new Error('口令错误或备份损坏');
  }
}

export async function exportSyncFile(
  items: InventoryItem[],
  opts?: { warehouses?: Warehouse[]; fileName?: string; withImages?: boolean },
): Promise<string> {
  const payload = {
    kind: 'localscan-sync' as const,
    schema: 4,
    exportedAt: new Date().toISOString(),
    scope: opts?.warehouses ? ('all' as const) : ('warehouse' as const),
    // 全仓导出时带上仓库表，导入端才能把物品放回各自的仓库
    warehouses: opts?.warehouses,
    // 带上图片本体（key → dataURL）。只带 imageIds 的话换机后图片全是空占位。
    images: opts?.withImages ? imagesForItems(items) : undefined,
    items,
  };
  const filename = opts?.fileName
    ? opts.fileName.endsWith('.json')
      ? opts.fileName
      : `${opts.fileName}.json`
    : `localscan-sync-${dateStamp()}.json`;
  return saveFile(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    filename,
  );
}

/** 从 UA 里抠出机型，作为「全部仓库」导出的文件名前缀 */
export function deviceModel(): string {
  const ua = navigator.userAgent || '';
  const m = /Android[^;]*;\s*([^;)]+?)\s*(?:Build|\))/i.exec(ua);
  const model = m?.[1]?.trim();
  if (model && !/^wv$/i.test(model)) return model.replace(/\s+/g, '');
  return 'Android';
}

/**
 * 导出文件名（不含扩展名）：
 * - 单个仓库 → 仓库名 + 日期
 * - 全部仓库 → 机型名 + 日期 + 多仓
 */
export function exportFileName(opts: {
  allWarehouses?: boolean;
  warehouseName?: string | null;
}): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '') || '未命名';
  const d = dateStamp();
  if (opts.allWarehouses) return `${safe(deviceModel())}-${d}-多仓`;
  return `${safe(opts.warehouseName ?? '未命名仓库')}-${d}`;
}

export type ParsedSync = {
  items: InventoryItem[];
  warehouses: Warehouse[] | null;
  /** 数据包里的图片本体（key → dataURL），老版本包里没有就是 null */
  images: Record<string, string> | null;
  /**
   * 数据包的范围。'all' = 多仓数据；'warehouse' = 单仓数据。
   * 老版本导出包里没有这个字段，按 warehouses 是否存在推断。
   */
  scope: 'all' | 'warehouse';
};

export async function parseSyncPayload(file: File): Promise<ParsedSync> {
  const text = await file.text();
  const data = JSON.parse(text) as {
    kind?: string;
    items?: InventoryItem[];
    warehouses?: Warehouse[];
    images?: Record<string, string>;
    scope?: 'all' | 'warehouse';
  };
  if (data.kind !== 'localscan-sync' || !Array.isArray(data.items)) {
    throw new Error('不是有效的同步数据包');
  }
  return {
    items: data.items,
    warehouses: Array.isArray(data.warehouses) ? data.warehouses : null,
    images: data.images && typeof data.images === 'object' ? data.images : null,
    scope:
      data.scope ?? (Array.isArray(data.warehouses) && data.warehouses.length > 0
        ? 'all'
        : 'warehouse'),
  };
}

export async function parseSyncFile(file: File): Promise<InventoryItem[]> {
  const parsed = await parseSyncPayload(file);
  return parsed.items;
}

export function itemsForExport(warehouseId: string | null): InventoryItem[] {
  return allItemsIncludingDeleted(warehouseId).filter((i) => !i.deleted);
}

/**
 * 供「局域网 Web 面板」复用：带父子层级的表格行。
 * 父项在前、其子项紧随其后，「层级」列标出父子关系。
 */
export function exportRows(items: InventoryItem[]): ExportRow[] {
  return rowsFromItems(items);
}
