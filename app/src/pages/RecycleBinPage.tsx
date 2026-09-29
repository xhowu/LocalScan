/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { useMemo, useState } from 'react';
import { goBack } from '../router';
import { listDeletedItems, listWarehouses, purgeAllDeleted, purgeItem, restoreItem } from '../db';
import { formatTime } from '../types';
import { confirmDialog, showToast } from '../lib/ui';

/**
 * 回收站：展示全部软删除物品，可恢复（父项连带子项批次）或彻底删除。
 * 软删除数据一直保留在本地存储里，这里提供查看与挽回的入口。
 */
export function RecycleBinPage() {
  const [tick, setTick] = useState(0);
  const items = useMemo(() => {
    void tick;
    return listDeletedItems();
  }, [tick]);
  const warehouses = useMemo(() => listWarehouses(), []);

  function whName(id: string) {
    return warehouses.find((w) => w.id === id)?.name ?? '已删除的仓库';
  }

  async function restore(id: string) {
    const n = restoreItem(id);
    showToast(n > 1 ? `已恢复 ${n} 项（含子项批次）` : '已恢复', 'success');
    setTick((t) => t + 1);
  }

  async function purge(id: string, name: string) {
    const ok = await confirmDialog({
      title: '彻底删除',
      message: `「${name}」将从存储中永久移除，无法再恢复。`,
      danger: true,
      confirmText: '彻底删除',
    });
    if (!ok) return;
    purgeItem(id);
    showToast('已彻底删除', 'success');
    setTick((t) => t + 1);
  }

  async function purgeAll() {
    if (!items.length) return;
    const ok = await confirmDialog({
      title: '清空回收站',
      message: `将彻底删除回收站中的 ${items.length} 项（含子项批次），无法再恢复。`,
      danger: true,
      confirmText: '清空',
    });
    if (!ok) return;
    const n = purgeAllDeleted();
    showToast(`已彻底删除 ${n} 项`, 'success');
    setTick((t) => t + 1);
  }

  return (
    <div className="page">
      <header className="nav-bar">
        <button type="button" className="back-btn" onClick={() => goBack({ name: 'settings' })}>
          ←
        </button>
        <h1>回收站</h1>
        {items.length > 0 && (
          <button type="button" className="btn-ghost sm danger" onClick={() => void purgeAll()}>
            清空
          </button>
        )}
      </header>

      <p className="lead field-sub">
        软删除的物品会保留在这里，恢复后回到原仓库；彻底删除后无法找回。
      </p>

      {items.length === 0 ? (
        <div className="empty-box glass-in">
          <p className="empty-title">回收站是空的</p>
          <p className="empty-desc">删除的物品会先进入这里，确认不需要后再彻底删除。</p>
        </div>
      ) : (
        <ul className="recycle-list">
          {items.map((it) => (
            <li key={it.id} className="recycle-row glass-in">
              <div className="recycle-main">
                <p className="recycle-name ellipsis">{it.name || '（未命名）'}</p>
                <p className="recycle-sub mono">
                  {whName(it.warehouseId)} · 数量 {it.qty} {it.unit} · 删除于{' '}
                  {formatTime(it.updatedAt)}
                </p>
              </div>
              <div className="recycle-actions">
                <button
                  type="button"
                  className="btn-ghost sm pressable"
                  onClick={() => restore(it.id)}
                >
                  恢复
                </button>
                <button
                  type="button"
                  className="btn-ghost sm danger pressable"
                  onClick={() => void purge(it.id, it.name || '（未命名）')}
                >
                  彻底删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
