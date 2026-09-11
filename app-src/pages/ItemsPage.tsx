import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getActiveWarehouseId,
  listCategories,
  listItems,
  softDeleteItem,
  statsForActive,
  getWarehouse,
} from '../db';
import { navigate } from '../router';
import { confirmDialog, showToast } from '../lib/ui';
import type { InventoryItem } from '../types';

export function ItemsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('全部');
  const [filter, setFilter] = useState<'全部' | '低库存' | '有条码'>('全部');
  const [tick, setTick] = useState(0);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const longTimer = useRef<number>(0);
  const pressPos = useRef<{ x: number; y: number } | null>(null);

  const wid = getActiveWarehouseId();
  const wh = wid ? getWarehouse(wid) : null;
  const categories = useMemo(() => {
    void tick;
    return ['全部', ...listCategories()];
  }, [tick]);

  const s = useMemo(() => {
    void tick;
    return statsForActive();
  }, [tick]);

  const items = useMemo(() => {
    void tick;
    let rows = listItems({ query, category: category === '全部' ? null : category });
    if (filter === '低库存') rows = rows.filter((i) => i.qty <= i.lowStockAt);
    if (filter === '有条码') rows = rows.filter((i) => !!i.code);
    return rows;
  }, [query, category, filter, tick]);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  function refresh() {
    setTick((t) => t + 1);
  }

  function onPointerDown(e: React.PointerEvent, item: InventoryItem) {
    pressPos.current = { x: e.clientX, y: e.clientY };
    window.clearTimeout(longTimer.current);
    longTimer.current = window.setTimeout(() => {
      setMenu({ id: item.id, x: e.clientX, y: e.clientY });
      if (navigator.vibrate) navigator.vibrate(12);
    }, 450);
  }

  function onPointerUp() {
    window.clearTimeout(longTimer.current);
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = pressPos.current;
    if (!p) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) {
      window.clearTimeout(longTimer.current);
    }
  }

  async function onDelete(item: InventoryItem) {
    setMenu(null);
    const ok = await confirmDialog({
      title: '删除物品',
      message: `确定删除「${item.name}」？`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    softDeleteItem(item.id);
    showToast('已删除', 'success');
    refresh();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{wh?.name ?? '我的仓库'}</p>
          <h1>全部物品</h1>
        </div>
        <button type="button" className="btn-primary" onClick={() => navigate({ name: 'scan' })}>
          扫码
        </button>
      </header>

      <label className="search glass-in">
        <span className="search-icon" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索名称 / 条码 / 备注"
          aria-label="搜索"
        />
      </label>

      <div className="stats">
        <div className="stat">
          <strong>{s.inStock}</strong>
          <span>在库</span>
        </div>
        <div className="stat">
          <strong className={s.low ? 'warn' : ''}>{s.low}</strong>
          <span>低库存</span>
        </div>
        <div className="stat">
          <strong>{s.addedToday}</strong>
          <span>今日新增</span>
        </div>
      </div>

      <div className="scroll-x cats" role="tablist" aria-label="分类">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={category === c ? 'chip active' : 'chip'}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="filters">
        {(['全部', '低库存', '有条码'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'chip active' : 'chip'}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="empty-box glass-in">
          <p className="empty-title">还没有匹配的物品</p>
          <p className="empty-desc">扫码或手动添加，开始建立本地库存。</p>
          <button type="button" className="btn-primary" onClick={() => navigate({ name: 'edit' })}>
            添加物品
          </button>
        </div>
      ) : (
        <ul className="item-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="item-row glass-in"
                onClick={() => navigate({ name: 'detail', id: item.id })}
                onPointerDown={(e) => onPointerDown(e, item)}
                onPointerUp={onPointerUp}
                onPointerMove={onPointerMove}
                onPointerCancel={onPointerUp}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ id: item.id, x: e.clientX, y: e.clientY });
                }}
              >
                <div className={`thumb cat-${hashCat(item.category)}`} aria-hidden="true" />
                <div className="item-body">
                  <div className="item-top">
                    <strong>{item.name}</strong>
                    <span className={item.qty <= item.lowStockAt ? 'badge warn' : 'badge ok'}>
                      {item.qty}
                    </span>
                  </div>
                  <p className="item-meta">
                    <span className="cat-tag">{item.category}</span>
                    {item.code && <span className="mono">{item.code}</span>}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {menu && (
        <div
          className="ctx-menu glass"
          style={{
            left: Math.min(menu.x, window.innerWidth - 140),
            top: menu.y + 8,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const id = menu.id;
              setMenu(null);
              navigate({ name: 'edit', id });
            }}
          >
            编辑
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              const item = items.find((i) => i.id === menu.id);
              if (item) void onDelete(item);
            }}
          >
            删除
          </button>
        </div>
      )}

      <button type="button" className="fab" onClick={() => navigate({ name: 'edit' })} aria-label="添加">
        +
      </button>
    </div>
  );
}

function hashCat(cat: string) {
  let n = 0;
  for (let i = 0; i < cat.length; i++) n = (n + cat.charCodeAt(i)) % 6;
  return n;
}
