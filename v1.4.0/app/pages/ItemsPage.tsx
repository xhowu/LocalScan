import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getActiveWarehouseId,
  getImageDataUrl,
  listCategories,
  listLocations,
  listItems,
  softDeleteItem,
  getWarehouse,
} from '../db';
import { navigate } from '../router';
import { confirmDialog, showToast } from '../lib/ui';
import type { InventoryItem } from '../types';
import { isNearExpiry, isExpired } from '../types';
import { loadItemFilters, saveItemFilters, loadEnabledStatuses, loadCardStatuses, type StatusKey } from '../lib/app-const';

type StatusFilter = StatusKey;

function matchStatus(item: InventoryItem, filter: StatusFilter): boolean {
  if (filter === '全部') return true;
  if (filter === '在库') return item.qty > 0;
  if (filter === '低库存') return item.qty <= item.lowStockAt && item.qty > 0;
  if (filter === '零库存') return item.qty === 0;
  if (filter === '临期') return isNearExpiry(item);
  if (filter === '过期') return isExpired(item);
  if (filter === '无日期') return !item.expiryDate;
  if (filter === '有条码') return !!item.code;
  if (filter === '无条码') return !item.code;
  const t = Date.parse(item.createdAt);
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  const day = 86400000;
  if (filter === '近1天新增') return now - t <= day;
  if (filter === '近1周新增') return now - t <= 7 * day;
  if (filter === '近1月新增') return now - t <= 30 * day;
  return true;
}

export function ItemsPage() {
  const initialFilters = useMemo(() => loadItemFilters(), []);
  const [query, setQuery] = useState(initialFilters.query);
  const [category, setCategory] = useState<string>(initialFilters.category);
  const [location, setLocation] = useState<string>(initialFilters.location);
  const [filter, setFilter] = useState<StatusFilter>(
    (loadEnabledStatuses() as string[]).includes(initialFilters.status)
      ? (initialFilters.status as StatusFilter)
      : '全部',
  );
  const [tick, setTick] = useState(0);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const longTimer = useRef<number>(0);
  const pressPos = useRef<{ x: number; y: number } | null>(null);
  const enabledStatuses = useMemo(() => {
    void tick;
    return loadEnabledStatuses();
  }, [tick]);

  const wid = getActiveWarehouseId();
  const wh = wid ? getWarehouse(wid) : null;

  useEffect(() => {
    saveItemFilters({ query, category, location, status: filter });
  }, [query, category, location, filter]);
  const categories = useMemo(() => {
    void tick;
    return ['全部', ...listCategories()];
  }, [tick]);

  const locations = useMemo(() => {
    void tick;
    return ['全部', ...listLocations()];
  }, [tick]);

  const items = useMemo(() => {
    void tick;
    let rows = listItems({ query, category: category === '全部' ? null : category });
    if (location !== '全部') rows = rows.filter((i) => i.location === location);
    rows = rows.filter((i) => matchStatus(i, filter));
    return rows;
  }, [query, category, location, filter, tick]);

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

  const filterLabel = [
        category === '全部' ? '' : category,
        location === '全部' ? '' : location,
        filter === '全部' ? '' : filter,
      ]
        .filter(Boolean)
        .join(' · ') || '全部物品';

  const cardStatuses = useMemo(() => {
    void tick;
    return loadCardStatuses();
  }, [tick]);

  function countFor(status: StatusKey): number {
    return listItems().filter((i) => matchStatus(i, status)).length;
  }

  function toggleCard(status: StatusKey) {
    setFilter((f) => (f === status ? '全部' : status));
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

      <div className="stats stats-4">
        {cardStatuses.map((st) => {
          const n = countFor(st);
          const active = filter === st;
          const tone =
            st === '过期' || st === '零库存'
              ? 'expired'
              : st === '低库存' || st === '临期'
                ? 'warn'
                : 'normal';
          return (
            <button
              key={st}
              type="button"
              className={[
                'stat',
                active ? 'selected' : '',
                tone === 'warn' ? 'tone-warn' : '',
                tone === 'expired' ? 'tone-expired' : '',
                active && tone === 'warn' ? 'warn' : '',
                active && tone === 'expired' ? 'expired' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => toggleCard(st)}
              aria-pressed={active}
            >
              <strong
                className={
                  tone === 'expired' ? 'danger' : tone === 'warn' && n ? 'warn' : ''
                }
              >
                {n}
              </strong>
              <span>{st}</span>
            </button>
          );
        })}
      </div>

      {/* One-row filter: current selection + filter button */}
      <div className="filter-bar">
        <button
          type="button"
          className="filter-current"
          onClick={() => setFilterOpen(true)}
          aria-haspopup="dialog"
        >
          <span className="filter-label">当前</span>
          <span className="filter-value">
            {filterLabel} · {items.length}种
          </span>
        </button>
        <button
          type="button"
          className={filterOpen || category !== '全部' || filter !== '全部' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => setFilterOpen((v) => !v)}
          aria-label="筛选"
          aria-expanded={filterOpen}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {filterOpen && (
        <div className="filter-sheet" role="dialog" aria-label="筛选">
          <div className="filter-sheet-section">
            <p className="filter-sheet-title">分类</p>
            <div className="filter-sheet-chips">
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
          </div>
          <div className="filter-sheet-section">
            <p className="filter-sheet-title">位置</p>
            <div className="filter-sheet-chips">
              {locations.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={location === c ? 'chip active' : 'chip'}
                  onClick={() => setLocation(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-sheet-section">
            <p className="filter-sheet-title">状态</p>
            <div className="filter-sheet-chips">
              {enabledStatuses.map((f) => (
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
          </div>
          <div className="filter-sheet-actions">
            <button
              type="button"
              className="btn-ghost sm"
              onClick={() => {
                setCategory('全部');
                setLocation('全部');
                setFilter('全部');
              }}
            >
              重置
            </button>
            <button type="button" className="btn-primary sm" onClick={() => setFilterOpen(false)}>
              完成
            </button>
          </div>
        </div>
      )}

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
                {(() => {
                  const thumb = item.imageIds.map((k) => getImageDataUrl(k)).find(Boolean);
                  if (thumb) {
                    return <img className="item-thumb-img" src={thumb} alt="" />;
                  }
                  return <div className={`thumb cat-${hashCat(item.category)}`} aria-hidden="true" />;
                })()}
                <div className="item-body">
                  <div className="item-top">
                    <strong>{item.name}</strong>
                    <div className="badge-row">
                      {isExpired(item) && <span className="badge expired-pill">过期</span>}
                      {!isExpired(item) && isNearExpiry(item) && (
                        <span className="badge near-pill">临期</span>
                      )}
                      <span
                        className={
                          item.qty === 0
                            ? 'badge zero'
                            : item.qty <= item.lowStockAt
                              ? 'badge warn'
                              : 'badge ok'
                        }
                      >
                        {item.qty}
                      </span>
                    </div>
                  </div>
                  <p className="item-meta">
                    <span className="cat-tag">{item.category}</span>
                    {item.purchasePrice != null && (
                      <span className="price-tag">
                        {item.currency === 'CNY' ? '¥' : item.currency + ' '}
                        {item.purchasePrice}
                      </span>
                    )}
                    {item.salePrice != null && (
                      <span className="sale-tag">
                        {item.currency === 'CNY' ? '¥' : item.currency + ' '}
                        {item.salePrice}
                      </span>
                    )}
                    <span className="mono unit-tag">
                      {(item.purchasePrice != null || item.salePrice != null) ? `/${item.unit}` : item.unit}
                    </span>
                    {item.note && <span className="note-sub">{item.note}</span>}
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
