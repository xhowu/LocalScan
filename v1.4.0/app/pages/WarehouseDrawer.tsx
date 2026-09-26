import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createWarehouse,
  deleteWarehouse,
  getActiveWarehouseId,
  listItems,
  listWarehouses,
  setActiveWarehouseId,
  updateWarehouse,
} from '../db';
import { confirmDialog, showToast } from '../lib/ui';
import { loadCardStatuses, type StatusKey } from '../lib/app-const';
import { isNearExpiry, isExpired } from '../types';
import type { InventoryItem } from '../types';

function countStatus(rows: InventoryItem[], status: StatusKey): number {
  switch (status) {
    case '在库':
      return rows.filter((i) => i.qty > 0).length;
    case '低库存':
      return rows.filter((i) => i.qty <= i.lowStockAt && i.qty > 0).length;
    case '零库存':
      return rows.filter((i) => i.qty === 0).length;
    case '临期':
      return rows.filter((i) => isNearExpiry(i)).length;
    case '过期':
      return rows.filter((i) => isExpired(i)).length;
    case '无日期':
      return rows.filter((i) => !i.expiryDate).length;
    case '有条码':
      return rows.filter((i) => !!i.code).length;
    case '无条码':
      return rows.filter((i) => !i.code).length;
    default:
      return rows.length;
  }
}

function statusTone(status: StatusKey): '' | 'warn' | 'zero-text' {
  if (status === '零库存' || status === '过期') return 'zero-text';
  if (status === '低库存' || status === '临期') return 'warn';
  return '';
}

export function WarehouseDrawer({
  open,
  canDismiss,
  onClose,
  onChanged,
}: {
  open: boolean;
  canDismiss: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [name, setName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const dragStart = useRef<number | null>(null);

  // force fresh stats every time drawer opens
  useEffect(() => {
    if (open) setTick((t) => t + 1);
  }, [open]);

  const list = useMemo(() => {
    void tick;
    return listWarehouses();
  }, [tick]);

  const activeId = getActiveWarehouseId();

  const cardStatuses = useMemo(() => {
    void tick;
    return loadCardStatuses();
  }, [tick]);

  function statsOf(wid: string) {
    const rows = listItems({ warehouseId: wid });
    return {
      total: rows.length,
      cards: cardStatuses.map((s) => ({ s, n: countStatus(rows, s), tone: statusTone(s) })),
    };
  }

  function refresh() {
    setTick((t) => t + 1);
    onChanged?.();
  }

  function enter(id: string) {
    setActiveWarehouseId(id);
    refresh();
    showToast(`已切换到「${list.find((w) => w.id === id)?.name ?? '仓库'}」`, 'success');
    // stay on current page — do not force navigate
    if (canDismiss) onClose();
  }

  async function remove(id: string) {
    const ok = await confirmDialog({
      title: '删除仓库',
      message: '将删除该仓库及其全部物品，不可恢复。',
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    deleteWarehouse(id);
    showToast('已删除', 'success');
    refresh();
  }

  function submitCreate() {
    const w = createWarehouse(name || '新仓库');
    setActiveWarehouseId(w.id);
    showToast(`已创建「${w.name}」`, 'success');
    setShowCreate(false);
    setName('');
    refresh();
    if (canDismiss) onClose();
  }

  function submitRename() {
    if (!editing) return;
    updateWarehouse(editing, { name: name.trim() || '未命名' });
    showToast('已重命名', 'success');
    setEditing(null);
    setName('');
    refresh();
  }

  // follow-finger drag on panel
  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = e.clientX;
    setDragX(0);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragStart.current == null) return;
    const dx = e.clientX - dragStart.current;
    if (dx > 0) setDragX(Math.min(dx, 280));
  }
  function onPointerUp() {
    if (dragX > 90 && canDismiss) onClose();
    setDragX(0);
    dragStart.current = null;
  }

  if (!open) return null;

  const panelStyle = dragX
    ? { transform: `translateX(${dragX}px)` }
    : undefined;

  return (
    <div className="drawer-root open" role="dialog" aria-label="选择仓库">
      <div
        className="drawer-backdrop"
        onClick={() => {
          if (canDismiss) onClose();
        }}
      >
        {canDismiss && (
          <span className="drawer-back-hint" aria-hidden="true">
            ‹
          </span>
        )}
      </div>
      <aside
        className="drawer-panel in"
        style={panelStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <header className="drawer-head">
          <div>
            <p className="eyebrow">本机仓库</p>
            <h2>选择仓库</h2>
          </div>
          <button
            type="button"
            className="btn-primary sm"
            onClick={() => {
              setName('');
              setShowCreate(true);
            }}
          >
            新建仓库
          </button>
        </header>

        <div className="wh-list">
          {list.map((w) => {
            const st = statsOf(w.id);
            const active = w.id === activeId;
            return (
              <article key={w.id} className={active ? 'wh-card active' : 'wh-card'}>
                <button type="button" className="wh-main" onClick={() => enter(w.id)}>
                  <div className="wh-title">
                    <strong>{w.name}</strong>
                    <span className="wh-count">{st.total} 种</span>
                    {active && <span className="chip-badge">当前</span>}
                  </div>
                  <div className="wh-stats">
                    {st.cards.map(({ s, n, tone }) => (
                      <span key={s} className={tone}>
                        <b>{n}</b> {s}
                      </span>
                    ))}
                  </div>
                </button>
                <div className="wh-actions">
                  <button
                    type="button"
                    className="btn-ghost sm"
                    onClick={() => {
                      setEditing(w.id);
                      setName(w.name);
                    }}
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    className="btn-ghost sm danger"
                    onClick={() => void remove(w.id)}
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {(showCreate || editing) && (
          <div
            className="modal-backdrop"
            onClick={() => {
              setShowCreate(false);
              setEditing(null);
            }}
          >
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3>{showCreate ? '新建仓库' : '重命名仓库'}</h3>
              <input
                className="modal-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="仓库名称"
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setShowCreate(false);
                    setEditing(null);
                    setName('');
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => (showCreate ? submitCreate() : submitRename())}
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
