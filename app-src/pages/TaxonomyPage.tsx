import { useState } from 'react';
import {
  listCategories,
  listLocations,
  saveCategories,
  saveLocations,
  deleteCategory,
  deleteLocation,
} from '../db';
import { navigate } from '../router';
import { showToast, confirmDialog } from '../lib/ui';

type Tab = 'category' | 'location';

export function TaxonomyPage({ kind }: { kind: Tab }) {
  const [tab, setTab] = useState<Tab>(kind);
  const [cats, setCats] = useState<string[]>(() => listCategories());
  const [locs, setLocs] = useState<string[]>(() => listLocations());
  const [draft, setDraft] = useState('');

  const list = tab === 'category' ? cats : locs;

  function setList(next: string[]) {
    if (tab === 'category') {
      setCats(next);
      saveCategories(next);
    } else {
      setLocs(next);
      saveLocations(next);
    }
  }

  function add() {
    const name = draft.trim();
    if (!name) {
      showToast('请输入名称', 'error');
      return;
    }
    if (list.includes(name)) {
      showToast('已存在', 'error');
      return;
    }
    setList([...list, name]);
    setDraft('');
    showToast('已添加', 'success');
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    const t = next[index];
    next[index] = next[j];
    next[j] = t;
    setList(next);
  }

  function rename(index: number, name: string) {
    const next = [...list];
    const old = next[index];
    next[index] = name;
    setList(next);
    if (!old || old === name) return;
    void (async () => {
      try {
        const db = await import('../db');
        const wid = db.getActiveWarehouseId();
        for (const item of db.listItems({ warehouseId: wid, includeDeleted: true })) {
          if (tab === 'category' && item.category === old) await db.updateItem(item.id, { category: name });
          if (tab === 'location' && item.location === old) await db.updateItem(item.id, { location: name });
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : '重命名同步失败', 'error');
      }
    })();
  }

  async function remove(index: number) {
    const name = list[index];
    const ok = await confirmDialog({
      title: tab === 'category' ? '删除分类' : '删除位置',
      message: `删除「${name}」？已用该${tab === 'category' ? '分类' : '位置'}的物品会改为「${tab === 'category' ? '其他' : '空'}」。`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    if (tab === 'category') {
      deleteCategory(name);
      setCats(listCategories());
    } else {
      deleteLocation(name);
      setLocs(listLocations());
    }
    showToast('已删除', 'success');
  }

  return (
    <div className="page">
      <header className="nav-bar">
        <button type="button" className="back-btn" onClick={() => navigate({ name: 'settings' })}>
          ←
        </button>
        <h1>分类与位置</h1>
        <span />
      </header>

      <div className="filter-bar">
        <button
          type="button"
          className={tab === 'category' ? 'chip active' : 'chip'}
          onClick={() => setTab('category')}
        >
          分类
        </button>
        <button
          type="button"
          className={tab === 'location' ? 'chip active' : 'chip'}
          onClick={() => setTab('location')}
        >
          位置
        </button>
      </div>

      <p className="lead">
        {tab === 'category' ? '分类用于物品筛选与编辑。' : '位置用于库位管理，可与分类组合筛选。'}
      </p>

      {list.length === 0 ? (
        <div className="empty-box">
          <p className="empty-title">暂无数据</p>
          <p className="empty-desc">在下方输入并添加。</p>
        </div>
      ) : (
        <ul className="tpl-list">
          {list.map((item, i) => (
            <li key={`${item}-${i}`} className="tpl-item">
              <span className="tpl-index mono">{String(i + 1).padStart(2, '0')}</span>
              <input
                className="tpl-rename"
                value={item}
                onChange={(e) => rename(i, e.target.value)}
              />
              <div className="tpl-actions">
                <button
                  type="button"
                  className="icon-btn-sm"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn-sm"
                  disabled={i === list.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn-sm danger"
                  onClick={() => void remove(i)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="tpl-add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={tab === 'category' ? '新分类名，如 数码' : '新位置，如 A架-01'}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn-primary" onClick={add}>
          添加
        </button>
      </div>
    </div>
  );
}
