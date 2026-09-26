import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { confirmDialog, haptic, showToast } from '../lib/ui';
import { MarqueeText } from '../lib/MarqueeText';
import { catKey } from '../lib/cat-color';
import type { InventoryItem } from '../types';
import { batchLabel, isNearExpiry, isExpired } from '../types';
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
  // 有子项 / 无子项：看该物品下是否挂了同条码批次（均为中性状态，字色不特殊）
  if (filter === '有子项') return listItems().some((k) => k.parentId === item.id);
  if (filter === '无子项') return !listItems().some((k) => k.parentId === item.id);
  const t = Date.parse(item.createdAt);
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  const day = 86400000;
  if (filter === '近1天新增') return now - t <= day;
  if (filter === '近1周新增') return now - t <= 7 * day;
  if (filter === '近1月新增') return now - t <= 30 * day;
  return true;
}

/** 状态卡「语气」：决定字色与选中遮罩，字色常驻不随选中变化 */
const WARN_STATUSES: StatusKey[] = ['低库存', '临期', '无日期', '无条码'];
const DANGER_STATUSES: StatusKey[] = ['零库存', '过期'];

function statTone(st: StatusKey): 'neutral' | 'warn' | 'danger' {
  if (DANGER_STATUSES.includes(st)) return 'danger';
  if (WARN_STATUSES.includes(st)) return 'warn';
  return 'neutral';
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
  /** 已展开子项的父项 id（默认全部收起，避免列表被批次撑长） */
  // 子项展开状态持久化：进详情再返回，哪些父项的子项列表展开保持原样
  const [expandedKids, setExpandedKids] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem('localscan.expandedKids');
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('localscan.expandedKids', JSON.stringify([...expandedKids]));
    } catch {
      /* 存储不可用时静默：仅影响返回后的展开状态还原 */
    }
  }, [expandedKids]);
  const longTimer = useRef<number>(0);
  const pressPos = useRef<{ x: number; y: number } | null>(null);
  /** 菜单打开时刻：用于给「同一手势的抬指 click / 抖动」一个关闭宽限期 */
  const menuOpenedAt = useRef(0);
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

  /**
   * 把同条码子项挂在父项下面展示。
   * 子项不允许再有子项，但历史数据里可能已经产生（改规则之前建的），
   * 所以这里统一「上溯到根」：任何带 parentId 的物品都挂到它的根物品下当子项，
   * 否则那种孙子项会因为只渲染两层而从列表里消失。
   */
  const grouped = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const byParent = new Map<string, InventoryItem[]>();
    const roots: InventoryItem[] = [];
    const rootIdOf = (it: InventoryItem): string | null => {
      let cur = it;
      let guard = 0;
      while (cur.parentId && byId.has(cur.parentId) && guard++ < 10) {
        cur = byId.get(cur.parentId)!;
      }
      return cur.id === it.id ? null : cur.id;
    };
    for (const it of items) {
      const rid = rootIdOf(it);
      if (rid) {
        const list = byParent.get(rid) ?? [];
        list.push(it);
        byParent.set(rid, list);
      } else {
        roots.push(it);
      }
    }
    return { roots, byParent };
  }, [items]);

  useEffect(() => {
    /*
     * 关掉长按菜单的时机：点击别处、滚动列表、或在列表上滑动。
     * scroll 事件不冒泡，必须用**捕获阶段**才能收到内部滚动容器（.main）的滚动；
     * 事件来自菜单自身时跳过，否则手指在菜单上轻微移动会把菜单误关掉。
     *
     * 宽限期：菜单是长按 450ms 弹出的，**抬指那一瞬还会产生一个 click**、
     * 手指也可能带 1~2px 的抖动 —— 这些都来自打开菜单的同一个手势，
     * 不能拿来关闭，否则菜单"弹出即消失"（太容易取消）。所以：
     *   - click 在菜单打开后 600ms 内忽略（就是那一下抬指产生的）
     *   - touchmove / scroll 在 260ms 内忽略（抬指抖动、滚动惯性余量）
     * 宽限期过后，点击别处或滑动列表照常关闭。
     */
    const close = (e?: Event) => {
      const t = e?.target as Element | null;
      if (t && typeof t.closest === 'function' && t.closest('.ctx-menu')) return;
      const age = Date.now() - menuOpenedAt.current;
      if (e?.type === 'click' && age < 600) return;
      if ((e?.type === 'touchmove' || e?.type === 'scroll') && age < 260) return;
      setMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('touchmove', close, { passive: true });
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('touchmove', close);
    };
  }, []);

  function openMenu(id: string, x: number, y: number) {
    menuOpenedAt.current = Date.now();
      setMenu({ id, x, y });
      haptic();
  }

  function refresh() {
    setTick((t) => t + 1);
  }

  function onPointerDown(e: React.PointerEvent, item: InventoryItem) {
    pressPos.current = { x: e.clientX, y: e.clientY };
    window.clearTimeout(longTimer.current);
    longTimer.current = window.setTimeout(() => {
      openMenu(item.id, e.clientX, e.clientY);
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

  function toggleKids(id: string) {
    setExpandedKids((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderRow(item: InventoryItem, depth: 0 | 1) {
    const kids = grouped.byParent.get(item.id) ?? [];
    const thumb = item.imageIds.map((k) => getImageDataUrl(k)).find(Boolean);
    return (
      <button
        type="button"
        className={`item-row glass-in pressable${depth ? ' is-child' : ''}`}
        onClick={() => navigate({ name: 'detail', id: item.id })}
        onPointerDown={(e) => onPointerDown(e, item)}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenu(item.id, e.clientX, e.clientY);
        }}
      >
        {thumb ? (
          <img className="item-thumb-img" src={thumb} alt="" />
        ) : (
          <div className={`thumb cat-${catKey(item.category)}`} aria-hidden="true" />
        )}
        <div className="item-body">
          <div className="item-top">
            <strong className="item-name">
              <MarqueeText text={item.name} />
            </strong>
            <div className="badge-row">
              {kids.length > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="kids-toggle"
                  aria-expanded={expandedKids.has(item.id)}
                  aria-label={`${kids.length} 个子项，点击${expandedKids.has(item.id) ? '收起' : '展开'}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleKids(item.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleKids(item.id);
                    }
                  }}
                >
                  <span className="caret" aria-hidden="true">
                    ▶
                  </span>
                  {kids.length}
                </span>
              )}
              {isExpired(item) && <span className="badge expired-pill">过期</span>}
              {!isExpired(item) && isNearExpiry(item) && <span className="badge near-pill">临期</span>}
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
            <span className={`cat-tag cat-${catKey(item.category)}`}>{item.category}</span>
            {depth === 1 && <span className="batch-chip">{batchLabel(item)}</span>}
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
              {item.purchasePrice != null || item.salePrice != null ? `/${item.unit}` : item.unit}
            </span>
            {/* 备注只在父项显示：子项行更窄，多一项就会换行、卡片会被顶高 */}
            {depth !== 1 && item.note && <span className="note-sub">{item.note}</span>}
          </p>
        </div>
      </button>
    );
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
          return (
            <button
              key={st}
              type="button"
              className={`stat tone-${statTone(st)}${active ? ' selected' : ''}`}
              onClick={() => toggleCard(st)}
              aria-pressed={active}
            >
              <strong>{n}</strong>
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
          {grouped.roots.map((item) => {
            const kids = grouped.byParent.get(item.id) ?? [];
            const open = expandedKids.has(item.id);
            return (
              <li key={item.id} className={kids.length ? 'item-group' : undefined}>
                {renderRow(item, 0)}
                {open && kids.length > 0 && (
                  <div className="item-kids">
                    {kids.map((child) => (
                      <div key={child.id} className="item-kid">
                        {renderRow(child, 1)}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Portal 到 body：fixed 在滚动容器/有 transform 的祖先里会被当成相对内容定位，
          弹窗就会出现在别的卡片上 */}
      {menu &&
        createPortal(
          <div
            className="ctx-menu glass"
            style={{
              left: Math.min(menu.x, window.innerWidth - 140),
              top: Math.min(menu.y + 8, window.innerHeight - 120),
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
          </div>,
          document.body,
        )}

    </div>
  );
}
