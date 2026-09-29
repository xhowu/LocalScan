/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { useMemo, useRef, useState } from 'react';
import {
  countChildren,
  getImageDataUrl,
  getItem,
  getParentOf,
  listChildren,
  normalizeParentId,
  softDeleteItem,
  updateItem,
} from '../db';
import { batchLabel, formatDateCN, formatTime, isExpired, isNearExpiry } from '../types';
import { navigate, goBack } from '../router';
import { confirmDialog, showToast } from '../lib/ui';
import { ImageViewer, type ViewerOrigin } from '../lib/ImageViewer';
import { MarqueeText } from '../lib/MarqueeText';

export function ItemDetailPage({ id }: { id: string }) {
  const [tick, setTick] = useState(0);
  const [qtyDraft, setQtyDraft] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ index: number; origin: ViewerOrigin | null } | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  const item = useMemo(() => {
    void tick;
    return getItem(id);
  }, [id, tick]);

  const children = useMemo(() => {
    void tick;
    return listChildren(id);
  }, [id, tick]);

  const parent = useMemo(() => {
    void tick;
    return item ? getParentOf(item) : null;
  }, [item, tick]);

  if (!item) {
    return (
      <div className="page">
        <header className="nav-bar">
          <button type="button" className="back-btn" onClick={() => goBack({ name: 'items' })}>
            ←
          </button>
          <h1>物品详情</h1>
          <span />
        </header>
        <p className="empty">物品不存在</p>
      </div>
    );
  }

  const images = item.imageIds.map((k) => getImageDataUrl(k)).filter((u): u is string => !!u);

  function openViewer(index: number) {
    const el = galleryRef.current?.querySelectorAll('img')[index];
    const rect = el?.getBoundingClientRect();
    setViewer({
      index,
      origin: rect
        ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
        : null,
    });
  }

  function adjust(delta: number) {
    const next = updateItem(item!.id, { qty: Math.max(0, item!.qty + delta) });
    setQtyDraft(null);
    setTick((t) => t + 1);
    showToast(`数量 ${next.qty}`, 'info');
  }

  function commitQty() {
    if (qtyDraft == null) return;
    const n = Math.max(0, Number(qtyDraft) || 0);
    const next = updateItem(item!.id, { qty: n });
    setQtyDraft(null);
    setTick((t) => t + 1);
    showToast(`数量 ${next.qty}`, 'success');
  }

  async function remove() {
    const n = countChildren(item!.id);
    const ok = await confirmDialog({
      title: '删除物品',
      message: n
        ? `确定删除「${item!.name}」？其下 ${n} 个子项批次也会一并删除。`
        : `确定删除「${item!.name}」？`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    softDeleteItem(item!.id);
    showToast('已删除', 'success');
    navigate({ name: 'items' }, { replace: true });
  }

  function addChild() {
    // 子项不能再加子项：若当前是子项，挂到它的父项下（保证只有两层）
    const pid = normalizeParentId(item!.id);
    navigate({
      name: 'edit',
      code: item!.code,
      parent: pid ?? undefined,
      from: `item/${item!.id}`,
    });
  }

  const qtyDisplay = qtyDraft ?? String(item.qty);
  const hasCode = !!item.code;

  /* 状态胶囊：与物品页统计卡同一套判定规则 */
  const statuses: Array<{ label: string; tone: 'neutral' | 'warn' | 'danger' }> = [];
  if (item.qty > 0) statuses.push({ label: '在库', tone: 'neutral' });
  else statuses.push({ label: '零库存', tone: 'danger' });
  if (item.qty > 0 && item.qty <= item.lowStockAt) statuses.push({ label: '低库存', tone: 'warn' });
  if (isExpired(item)) statuses.push({ label: '过期', tone: 'danger' });
  else if (isNearExpiry(item)) statuses.push({ label: '临期', tone: 'warn' });
  if (!item.expiryDate) statuses.push({ label: '无日期', tone: 'warn' });
  if (!item.code) statuses.push({ label: '无条码', tone: 'warn' });

  return (
    <div className="page">
      <header className="nav-bar">
        <button
          type="button"
          className="back-btn"
          onClick={() => navigate({ name: 'items' }, { replace: true })}
          aria-label="返回"
        >
          ←
        </button>
        <h1 className="ellipsis nav-title">
          <MarqueeText text={item.name} />
        </h1>
        <div className="nav-actions">
          <button
            type="button"
            className="btn-ghost sm"
            onClick={() => navigate({ name: 'edit', id: item.id, from: `item/${item.id}` })}
          >
            编辑
          </button>
          <button type="button" className="btn-ghost sm danger" onClick={() => void remove()}>
            删除
          </button>
        </div>
      </header>

      {parent && (
        <button
          type="button"
          className="parent-link glass-in"
          onClick={() => navigate({ name: 'detail', id: parent.id })}
        >
          <span className="parent-link-label">同条码父项</span>
          <span className="parent-link-name ellipsis">{parent.name}</span>
          <span className="parent-link-arrow" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      {images.length > 0 && (
        <div className="gallery detail-gallery" ref={galleryRef}>
          {images.map((src, i) => (
            <button
              key={src.slice(0, 40)}
              type="button"
              className="gallery-tap pressable"
              onClick={() => openViewer(i)}
              aria-label={`查看第 ${i + 1} 张图片`}
            >
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}

      <div className="detail-status">
        {statuses.map((st) => (
          <span key={st.label} className={`capsule ${st.tone}`}>
            {st.label}
          </span>
        ))}
      </div>

      <div className="qty-panel">
        <button type="button" className="qty-btn pressable" onClick={() => adjust(-1)} disabled={item.qty <= 0}>
          −
        </button>
        <div className="qty-value">
          <input
            className="qty-input mono"
            inputMode="numeric"
            value={qtyDisplay}
            onFocus={() => setQtyDraft(String(item.qty))}
            onChange={(e) => setQtyDraft(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onBlur={commitQty}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitQty();
            }}
            aria-label="数量"
          />
          <span>{item.unit}</span>
        </div>
        <button type="button" className="qty-btn pressable" onClick={() => adjust(1)}>
          +
        </button>
      </div>

      {!item.parentId && (children.length > 0 || hasCode) && (
        <section className="child-block">
          <div className="child-block-head">
            <div>
              <p className="child-block-title">子项批次</p>
              <p className="child-block-sub">
                同一商品条码下的不同日期 / 批次，共 {children.length} 项
              </p>
            </div>
            {hasCode && !item!.parentId && (
              <button type="button" className="btn-ghost sm pressable" onClick={addChild}>
                + 新增子项
              </button>
            )}
          </div>
          {children.length === 0 ? (
            <p className="child-empty">暂无子项，可为不同生产日期的同款物品新建批次。</p>
          ) : (
            <ul className="child-list">
              {children.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="child-row glass-in pressable"
                    onClick={() => navigate({ name: 'detail', id: c.id })}
                  >
                    <span className="child-name ellipsis">{c.name}</span>
                    <span className="child-batch mono">{batchLabel(c)}</span>
                    <span
                      className={
                        c.qty === 0
                          ? 'badge zero'
                          : c.qty <= c.lowStockAt
                            ? 'badge warn'
                            : 'badge ok'
                      }
                    >
                      {c.qty}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <dl className="detail-list">
        <div>
          <dt>条码</dt>
          <dd className="mono">{item.code || '—'}</dd>
        </div>
        <div>
          <dt>分类</dt>
          <dd>{item.category}</dd>
        </div>
        <div>
          <dt>位置</dt>
          <dd>{item.location || '—'}</dd>
        </div>
        <div>
          <dt>币种</dt>
          <dd className="mono">{item.currency}</dd>
        </div>
        <div>
          <dt>购入价</dt>
          <dd className="mono">
            {item.purchasePrice == null ? '—' : item.purchasePrice.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt>售价</dt>
          <dd className="mono">{item.salePrice == null ? '—' : item.salePrice.toFixed(2)}</dd>
        </div>
        <div>
          <dt>低库存阈值</dt>
          <dd className="mono">{item.lowStockAt}</dd>
        </div>
        <div>
          <dt>生产日期</dt>
          <dd className="mono">
            {item.productionDate
              ? formatDateCN(item.productionDate)
              : '—'}
          </dd>
        </div>
        <div>
          <dt>保质期</dt>
          <dd className="mono">
            {item.shelfLifeMonths != null ? `${item.shelfLifeMonths} 个月` : '—'}
          </dd>
        </div>
        <div>
          <dt>截止日期</dt>
          <dd className="mono">{item.expiryDate ? formatDateCN(item.expiryDate) : '—'}</dd>
        </div>
        {item.customFields
          .filter((f) => f.label.trim())
          .map((f) => (
            <div key={f.key}>
              <dt>{f.label}</dt>
              <dd>{f.value || '—'}</dd>
            </div>
          ))}
        <div>
          <dt>备注</dt>
          <dd>{item.note || '—'}</dd>
        </div>
        <div>
          <dt>入库时间</dt>
          <dd className="mono">{formatTime(item.createdAt)}</dd>
        </div>
        <div>
          <dt>更新时间</dt>
          <dd className="mono">{formatTime(item.updatedAt)}</dd>
        </div>
        <div>
          <dt>版本</dt>
          <dd className="mono">v{item.version}</dd>
        </div>
      </dl>

      {viewer && (
        <ImageViewer
          images={images}
          startIndex={viewer.index}
          origin={viewer.origin}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
