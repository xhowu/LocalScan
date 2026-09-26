import type { InventoryItem, Warehouse } from '../types';
import {
  listItems,
  putItem,
  getItem,
  getActiveWarehouseId,
  createWarehouse,
  listWarehouses,
  allItemsIncludingDeleted,
  uid,
} from '../db';

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
  // 批次信息也要参与合并，否则子项的生产/到期日期同步不过来
  'productionDate',
  'expiryDate',
  'shelfLifeMonths',
  'deleted',
];

/**
 * Merge remote items into ONE target warehouse only.
 * Never overwrite items that belong to other warehouses (by id).
 * If remote id already exists elsewhere, allocate a new id.
 */
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
  const byCode = new Map<string, InventoryItem[]>();
  for (const i of localAll) {
    if (!i.code) continue;
    const list = byCode.get(i.code) ?? [];
    list.push(i);
    byCode.set(i.code, list);
  }

  const result: MergeResult = { created: 0, updated: 0, skipped: 0, conflicts: [] };
  /** 远端 id → 本地 id（新建时可能重新分配 id） */
  const idMap = new Map<string, string>();
  /** 待回连父项的子项：本地 id → 远端 parentId */
  const pendingParents: Array<[string, string]> = [];

  for (const r of remote) {
    // Only treat as "same item" if it already lives in THIS warehouse
    let local = byId.get(r.id);
    /**
     * 同条码可能有多个批次，只有唯一命中时才按条码视为同一物品。
     * 关键：远端只要带 parentId 就是子项批次 —— 它与父项条码必然相同，
     * 绝不能走条码匹配，否则子项会被"更新"进父项、整个批次丢失。
     */
    if (!local && r.code && !r.parentId) {
      const sameCode = (byCode.get(r.code) ?? []).filter((i) => !i.parentId);
      if (sameCode.length === 1) local = sameCode[0];
    }

    if (!local) {
      let newId = r.id || uid();
      // If this id is owned by another warehouse, mint a new id — do NOT steal
      const existing = getItem(newId);
      if (existing && existing.warehouseId !== wid) {
        newId = uid();
      }
      const created: InventoryItem = {
        ...r,
        id: newId,
        warehouseId: wid, // force target warehouse
        parentId: null, // 父项稍后统一回连
        deleted: r.deleted ?? false,
        customFields: r.customFields ?? [],
        imageIds: r.imageIds ?? [],
      };
      await putItem(created);
      byId.set(created.id, created);
      if (created.code) {
        const list = byCode.get(created.code) ?? [];
        list.push(created);
        byCode.set(created.code, list);
      }
      idMap.set(r.id, newId);
      if (r.parentId) pendingParents.push([newId, r.parentId]);
      result.created += 1;
      continue;
    }

    idMap.set(r.id, local.id);
    if (local.version === r.version && local.updatedAt === r.updatedAt) {
      result.skipped += 1;
      continue;
    }

    const remoteNewer = r.updatedAt > local.updatedAt;
    const merged: InventoryItem = { ...local };
    merged.warehouseId = wid; // never leave target warehouse

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
    merged.parentId = local.parentId ?? null;
    if (r.parentId) pendingParents.push([merged.id, r.parentId]);
    merged.updatedAt = new Date(
      Math.max(Date.parse(local.updatedAt), Date.parse(r.updatedAt)),
    ).toISOString();
    merged.version = Math.max(local.version, r.version) + 1;
    await putItem(merged);
    byId.set(merged.id, merged);
    result.updated += 1;
  }

  // 回连子项到父项：父项必须在本仓库、且不能是自己
  for (const [childId, remoteParentId] of pendingParents) {
    const parentLocalId = idMap.get(remoteParentId) ?? remoteParentId;
    if (parentLocalId === childId) continue;
    const parent = byId.get(parentLocalId) ?? getItem(parentLocalId);
    if (!parent || parent.warehouseId !== wid || parent.deleted) continue;
    const child = byId.get(childId);
    if (!child || child.parentId === parentLocalId) continue;
    const next = { ...child, parentId: parentLocalId };
    await putItem(next);
    byId.set(childId, next);
  }

  return result;
}

/**
 * 全仓导入：按物品各自所属的仓库分组，逐个仓库合并。
 * 远端仓库按 id 优先、其次按名称匹配本地仓库；都没有就新建一个。
 */
export async function mergeAllWarehouses(
  remote: InventoryItem[],
  remoteWarehouses?: Warehouse[] | null,
): Promise<MergeResult> {
  const total: MergeResult = { created: 0, updated: 0, skipped: 0, conflicts: [] };

  // 远端仓库 id → 本地仓库 id
  const idMap = new Map<string, string>();
  const local = listWarehouses();
  for (const w of remoteWarehouses ?? []) {
    const hit =
      local.find((l) => l.id === w.id) ?? local.find((l) => l.name.trim() === w.name.trim());
    idMap.set(w.id, hit ? hit.id : createWarehouse(w.name, w.note ?? '').id);
  }

  const grouped = new Map<string, InventoryItem[]>();
  for (const r of remote) {
    const k = r.warehouseId ?? '';
    const arr = grouped.get(k) ?? [];
    arr.push(r);
    grouped.set(k, arr);
  }

  for (const [remoteWid, rows] of grouped) {
    let localWid = idMap.get(remoteWid);
    if (!localWid) {
      // 数据包里没带仓库表（例如加密备份）：先按远端 id 找本地同 id 仓库
      // （同一台设备的备份/恢复场景，id 是一致的），找不到才新建
      const sameId = listWarehouses().find((l) => l.id === remoteWid);
      const name = remoteWarehouses?.find((w) => w.id === remoteWid)?.name ?? '导入的仓库';
      localWid = sameId ? sameId.id : createWarehouse(name).id;
      idMap.set(remoteWid, localWid);
    }
    const r = await mergeRemoteItems(rows, localWid);
    total.created += r.created;
    total.updated += r.updated;
    total.skipped += r.skipped;
    total.conflicts.push(...r.conflicts);
  }

  return total;
}

export function warehouseSummary() {  return listWarehouses().map((w) => ({
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
