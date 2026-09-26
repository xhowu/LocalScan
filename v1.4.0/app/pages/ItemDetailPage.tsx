import { useMemo, useState } from 'react';
import { getImageDataUrl, getItem, softDeleteItem, updateItem } from '../db';
import { formatDateCN, formatTime } from '../types';
import { navigate } from '../router';
import { confirmDialog, showToast } from '../lib/ui';

export function ItemDetailPage({ id }: { id: string }) {
  const [tick, setTick] = useState(0);
  const [qtyDraft, setQtyDraft] = useState<string | null>(null);
  const item = useMemo(() => {
    void tick;
    return getItem(id);
  }, [id, tick]);

  if (!item) {
    return (
      <div className="page">
        <header className="nav-bar">
          <button type="button" className="back-btn" onClick={() => navigate({ name: 'items' })}>
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
    const ok = await confirmDialog({
      title: '删除物品',
      message: `确定删除「${item!.name}」？`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    softDeleteItem(item!.id);
    showToast('已删除', 'success');
    navigate({ name: 'items' }, { replace: true });
  }

  const qtyDisplay = qtyDraft ?? String(item.qty);

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
        <h1 className="ellipsis">{item.name}</h1>
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

      {images.length > 0 && (
        <div className="gallery detail-gallery">
          {images.map((src) => (
            <img key={src.slice(0, 40)} src={src} alt="" />
          ))}
        </div>
      )}

      <div className="qty-panel">
        <button type="button" className="qty-btn" onClick={() => adjust(-1)} disabled={item.qty <= 0}>
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
        <button type="button" className="qty-btn" onClick={() => adjust(1)}>
          +
        </button>
      </div>

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
    </div>
  );
}
