import { useMemo, useState } from 'react';
import {
  createWarehouse,
  deleteWarehouse,
  getActiveWarehouseId,
  listWarehouses,
  setActiveWarehouseId,
  updateWarehouse,
  warehouseStats,
} from '../db';
import { navigate } from '../router';
import { confirmDialog, showToast } from '../lib/ui';

export function WarehousesPage({ onChanged }: { onChanged?: () => void }) {
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const activeId = getActiveWarehouseId();

  const list = useMemo(() => {
    void tick;
    return listWarehouses();
  }, [tick]);

  function refresh() {
    setTick((t) => t + 1);
    onChanged?.();
  }

  function enter(id: string) {
    setActiveWarehouseId(id);
    refresh();
    navigate({ name: 'items' });
  }

  async function remove(id: string) {
    const ok = await confirmDialog({
      title: '删除仓库',
      message: '将删除该仓库及其全部物品，不可恢复。确定？',
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    deleteWarehouse(id);
    showToast('仓库已删除', 'success');
    refresh();
  }

  function startCreate() {
    setName('');
    setShowCreate(true);
  }

  function submitCreate() {
    const w = createWarehouse(name || '新仓库');
    setActiveWarehouseId(w.id);
    showToast(`已创建「${w.name}」`, 'success');
    setShowCreate(false);
    refresh();
    navigate({ name: 'items' });
  }

  function startRename(id: string, current: string) {
    setEditing(id);
    setName(current);
  }

  function submitRename() {
    if (!editing) return;
    updateWarehouse(editing, { name: name.trim() || '未命名' });
    showToast('已重命名', 'success');
    setEditing(null);
    refresh();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">仓库</p>
          <h1>选择仓库</h1>
        </div>
        <button type="button" className="btn-primary" onClick={startCreate}>
          新建
        </button>
      </header>
      <p className="lead">本机可维护多个独立仓库。单仓库时可直接进入；多仓库先在此选择。</p>

      <div className="wh-list">
        {list.map((w) => {
          const s = warehouseStats(w.id);
          const active = w.id === activeId;
          return (
            <article key={w.id} className={active ? 'wh-card active' : 'wh-card'}>
              <button type="button" className="wh-main" onClick={() => enter(w.id)}>
                <div className="wh-title">
                  <strong>{w.name}</strong>
                  {active && <span className="chip-badge">当前</span>}
                </div>
                <div className="wh-stats">
                  <span>
                    <b>{s.total}</b> 种物品
                  </span>
                  <span className={s.low ? 'warn' : ''}>
                    <b>{s.low}</b> 低库存
                  </span>
                </div>
              </button>
              <div className="wh-actions">
                <button type="button" className="btn-ghost sm" onClick={() => startRename(w.id, w.name)}>
                  重命名
                </button>
                <button type="button" className="btn-ghost sm danger" onClick={() => void remove(w.id)}>
                  删除
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {(showCreate || editing) && (
        <div className="modal-backdrop" onClick={() => { setShowCreate(false); setEditing(null); }}>
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
              <button type="button" className="btn-ghost" onClick={() => { setShowCreate(false); setEditing(null); }}>
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
    </div>
  );
}
