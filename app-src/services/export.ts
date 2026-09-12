import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { InventoryItem } from '../types';
import { formatTime } from '../types';
import { getImageDataUrl, allItemsIncludingDeleted } from '../db';
import { saveFile, dateStamp } from '../lib/files';

function rowsFromItems(items: InventoryItem[]) {
  return items.map((i) => ({
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

export async function exportCsv(items: InventoryItem[]): Promise<string> {
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
  const filename = `localscan-${dateStamp()}.csv`;
  return saveFile(
    new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    filename,
  );
}

export async function exportXlsx(items: InventoryItem[]): Promise<string> {
  const ws = XLSX.utils.json_to_sheet(rowsFromItems(items));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '库存');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const filename = `localscan-${dateStamp()}.xlsx`;
  return saveFile(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );
}

export async function exportZipWithImages(items: InventoryItem[]): Promise<string> {
  const zip = new JSZip();
  const ws = XLSX.utils.json_to_sheet(rowsFromItems(items));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '库存');
  const xlsx = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
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
  const filename = `localscan-backup-${dateStamp()}.zip`;
  return saveFile(out, filename);
}

export async function exportEncryptedBackup(
  items: InventoryItem[],
  passphrase: string,
): Promise<string> {
  const payload = new TextEncoder().encode(
    JSON.stringify({ items, exportedAt: new Date().toISOString() }),
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
  const filename = `localscan-backup-${dateStamp()}.enc`;
  return saveFile(new Blob([pack], { type: 'application/octet-stream' }), filename);
}

export async function importEncryptedBackup(
  file: File,
  passphrase: string,
): Promise<InventoryItem[]> {
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
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as { items: InventoryItem[] };
    return parsed.items;
  } catch {
    throw new Error('口令错误或备份损坏');
  }
}

export async function exportSyncFile(items: InventoryItem[]): Promise<string> {
  const payload = {
    kind: 'localscan-sync' as const,
    schema: 2,
    exportedAt: new Date().toISOString(),
    items,
  };
  const filename = `localscan-sync-${dateStamp()}.json`;
  return saveFile(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    filename,
  );
}

export async function parseSyncFile(file: File): Promise<InventoryItem[]> {
  const text = await file.text();
  const data = JSON.parse(text) as { kind?: string; items?: InventoryItem[] };
  if (data.kind !== 'localscan-sync' || !Array.isArray(data.items)) {
    throw new Error('不是有效的同步数据包');
  }
  return data.items;
}

export function itemsForExport(warehouseId: string | null): InventoryItem[] {
  return allItemsIncludingDeleted(warehouseId).filter((i) => !i.deleted);
}
