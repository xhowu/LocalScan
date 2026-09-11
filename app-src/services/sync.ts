import type { InventoryItem } from '../types';
import { listItems, putItem, getActiveWarehouseId, createWarehouse, listWarehouses, allItemsIncludingDeleted } from '../db';

export interface MergeResult {
  created: number;
  updated: number;
  skipped: number;
  conflicts: Array<{ name: string; field: string; local: unknown; remote: unknown }>;
}

const FIELDS: Array<keyof InventoryItem> = [
  'name',
  'code',
  'codeType',
  'category',
  'note',
  'qty',
  'unit',
  'purchasePrice',
  'salePrice',
  'currency',
  'lowStockAt',
  'deleted',
];

export async function mergeRemoteItems(
  remote: InventoryItem[],
  targetWarehouseId?: string | null,
): Promise<MergeResult> {
  let wid = targetWarehouseId ?? getActiveWarehouseId();
  if (!wid) {
    wid = createWarehouse('我的仓库').id;
  }
  const localAll = listItems({ warehouseId: wid, includeDeleted: true });
  const byId = new Map(localAll.map((i) => [i.id, i]));
  const byCode = new Map<string, InventoryItem>();
  for (const i of localAll) if (i.code) byCode.set(i.code, i);

  const result: MergeResult = { created: 0, updated: 0, skipped: 0, conflicts: [] };

  for (const r of remote) {
    const local = byId.get(r.id) ?? (r.code ? byCode.get(r.code) : undefined);

    if (!local) {
      const created: InventoryItem = {
        ...r,
        warehouseId: wid,
        deleted: r.deleted ?? false,
        customFields: r.customFields ?? [],
        imageIds: r.imageIds ?? [],
      };
      await putItem(created);
      byId.set(created.id, created);
      if (created.code) byCode.set(created.code, created);
      result.created += 1;
      continue;
    }

    if (local.version === r.version && local.updatedAt === r.updatedAt) {
      result.skipped += 1;
      continue;
    }

    const remoteNewer = r.updatedAt > local.updatedAt;
    const merged: InventoryItem = { ...local };
    for (const f of FIELDS) {
      const lv = local[f];
      const rv = r[f];
      if (lv !== rv && remoteNewer) {
        result.conflicts.push({
          name: local.name || r.name,
          field: String(f),
          local: lv,
          remote: rv,
        });
        (merged as unknown as Record<string, unknown>)[f] = rv;
      }
    }
    merged.imageIds = Array.from(new Set([...local.imageIds, ...(r.imageIds ?? [])]));
    merged.customFields = r.customFields?.length ? r.customFields : local.customFields;
    merged.updatedAt = new Date(
      Math.max(Date.parse(local.updatedAt), Date.parse(r.updatedAt)),
    ).toISOString();
    merged.version = Math.max(local.version, r.version) + 1;
    await putItem(merged);
    byId.set(merged.id, merged);
    if (merged.code) byCode.set(merged.code, merged);
    result.updated += 1;
  }

  return result;
}

export function warehouseSummary() {
  return listWarehouses().map((w) => ({
    id: w.id,
    name: w.name,
    items: listItems({ warehouseId: w.id }).length,
  }));
}

export function inventorySnapshot() {
  const items = allItemsIncludingDeleted();
  return {
    kind: 'localscan-snapshot' as const,
    schema: 2,
    exportedAt: new Date().toISOString(),
    maxVersion: items.reduce((m, i) => Math.max(m, i.version), 0),
    items,
  };
}
