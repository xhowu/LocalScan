import { useState } from 'react';
import {
  ALL_STATUS_KEYS,
  loadEnabledStatuses,
  saveEnabledStatuses,
  loadCardStatuses,
  saveCardStatuses,
  type StatusKey,
} from '../lib/app-const';
import { navigate } from '../router';
import { showToast } from '../lib/ui';

export function StatusFiltersPage() {
  const [enabled, setEnabled] = useState<StatusKey[]>(() => loadEnabledStatuses());
  const [cards, setCards] = useState<StatusKey[]>(() => loadCardStatuses());

  const hidden = ALL_STATUS_KEYS.filter((s) => !enabled.includes(s));

  function persist(next: StatusKey[]) {
    setEnabled(next);
    saveEnabledStatuses(next);
  }

  function persistCards(next: StatusKey[]) {
    setCards(next);
    saveCardStatuses(next);
  }

  function hide(s: StatusKey) {
    if (s === '全部') {
      showToast('「全部」不可隐藏', 'error');
      return;
    }
    persist(enabled.filter((x) => x !== s));
    persistCards(cards.filter((x) => x !== s));
    showToast(`已隐藏「${s}」`, 'success');
  }

  function show(s: StatusKey) {
    const next = ALL_STATUS_KEYS.filter((k) => k === '全部' || enabled.includes(k) || k === s);
    persist(next);
    showToast(`已加入「${s}」`, 'success');
  }

  function toggleCard(s: StatusKey) {
    if (s === '全部') return;
    if (cards.includes(s)) {
      if (cards.length <= 1) {
        showToast('至少保留 1 张状态卡片', 'error');
        return;
      }
      persistCards(cards.filter((x) => x !== s));
    } else if (cards.length >= 4) {
      showToast('最多显示 4 张卡片，请先取消一张', 'error');
    } else {
      const next = [...cards, s];
      persistCards(next);
      if (!enabled.includes(s)) {
        persist(ALL_STATUS_KEYS.filter((k) => k === '全部' || enabled.includes(k) || k === s));
      }
    }
  }

  return (
    <div className="page">
      <header className="nav-bar">
        <button type="button" className="back-btn" onClick={() => navigate({ name: 'settings' })}>
          ←
        </button>
        <h1>状态筛选</h1>
        <span />
      </header>

      <p className="lead">管理物品页状态。× 隐藏不删除；勾选卡片作为首页四格。</p>

      <section className="tpl-section">
        <h2 className="group-title">首页卡片（最多 4 张）</h2>
        <div className="filter-sheet-chips">
          {ALL_STATUS_KEYS.filter((s) => s !== '全部').map((s) => (
            <button
              key={s}
              type="button"
              className={cards.includes(s) ? 'chip active' : 'chip'}
              onClick={() => toggleCard(s)}
            >
              {cards.includes(s) ? '✓ ' : ''}
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="tpl-section">
        <h2 className="group-title">筛选列表</h2>
        <ul className="tpl-list">
          {enabled.map((s, i) => (
            <li key={s} className="tpl-item">
              <span className="tpl-index mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="tpl-name">{s}</span>
              <div className="tpl-actions">
                <button
                  type="button"
                  className="icon-btn-sm"
                  disabled={i === 0 || s === '全部'}
                  onClick={() => {
                    const j = i - 1;
                    if (j < 0 || enabled[j] === '全部') return;
                    const next = [...enabled];
                    const t = next[i];
                    next[i] = next[j];
                    next[j] = t;
                    persist(next);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn-sm"
                  disabled={i === enabled.length - 1}
                  onClick={() => {
                    const j = i + 1;
                    if (j >= enabled.length) return;
                    const next = [...enabled];
                    const t = next[i];
                    next[i] = next[j];
                    next[j] = t;
                    persist(next);
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn-sm danger"
                  disabled={s === '全部'}
                  onClick={() => hide(s)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {hidden.length > 0 && (
        <section className="tpl-section">
          <h2 className="group-title">已隐藏（点 ✓ 加回）</h2>
          <ul className="tpl-list">
            {hidden.map((s) => (
              <li key={s} className="tpl-item">
                <span className="tpl-name">{s}</span>
                <div className="tpl-actions">
                  <button type="button" className="icon-btn-sm ok" onClick={() => show(s)}>
                    ✓
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
