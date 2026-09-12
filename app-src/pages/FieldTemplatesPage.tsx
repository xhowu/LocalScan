import { useState } from 'react';
import { listFieldTemplates, saveFieldTemplates, type FieldTemplate } from '../db';
import { navigate } from '../router';
import { showToast, confirmDialog } from '../lib/ui';

import { CORE_FIELDS } from '../lib/app-const';

/** Core built-ins — locked, always first on edit page. */
const CORE = CORE_FIELDS;

export function FieldTemplatesPage() {
  const [list, setList] = useState<FieldTemplate[]>(() =>
    listFieldTemplates().filter((t) => t.key !== 'note'),
  );
  const [draft, setDraft] = useState('');

  function persist(next: FieldTemplate[]) {
    setList(next);
    saveFieldTemplates(next);
  }

  function addField() {
    const label = draft.trim();
    if (!label) {
      showToast('请输入字段名', 'error');
      return;
    }
    if (
      list.some((f) => f.label === label) ||
      CORE.some((b) => b.label === label)
    ) {
      showToast('字段已存在', 'error');
      return;
    }
    persist([...list, { key: `ft-${Date.now().toString(36)}`, label }]);
    setDraft('');
    showToast('已添加固定字段', 'success');
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    // do not move note above position 0? user can reorder note among customs — allow all
    const next = [...list];
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    persist(next);
  }

  async function remove(index: number) {
    const ok = await confirmDialog({
      title: '删除固定字段',
      message: `删除「${list[index].label || '未命名'}」？新建/编辑页将不再显示。`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    persist(list.filter((_, i) => i !== index));
    showToast('已删除', 'success');
  }

  return (
    <div className="page">
      <header className="nav-bar">
        <button type="button" className="back-btn" onClick={() => navigate({ name: 'settings' })}>
          ←
        </button>
        <h1>字段模板</h1>
        <span />
      </header>

      <p className="lead">
        <strong>固定字段</strong>在所有物品编辑页都会出现，可排序；
        <strong>临时字段</strong>只能在单个物品编辑页添加，不会写入模板。
      </p>

      <section className="tpl-section">
        <h2 className="group-title">核心字段（固定）</h2>
        <ul className="tpl-list">
          {CORE.map((b) => (
            <li key={b.key} className="tpl-item builtin">
              <span className="tpl-name">{b.label}</span>
              {b.hint && <span className="tpl-hint">{b.hint}</span>}
              <span className="tpl-lock">内置</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="tpl-section">
        <h2 className="group-title">自定义固定字段（可排序）</h2>
        <ul className="tpl-list">
          {list.map((f, i) => (
            <li key={f.key} className="tpl-item">
              <span className="tpl-index mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="tpl-name">
                {f.label || '未命名字段'}
              </span>
              <div className="tpl-actions">
                <button
                  type="button"
                  className="icon-btn-sm"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn-sm"
                  disabled={i === list.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="下移"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn-sm danger"
                  onClick={() => void remove(i)}
                  aria-label="删除"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="tpl-add">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="新固定字段名，如 货位 / 供应商"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addField();
              }
            }}
          />
          <button type="button" className="btn-primary" onClick={addField}>
            添加
          </button>
        </div>
      </section>
    </div>
  );
}
