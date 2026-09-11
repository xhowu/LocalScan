import { useState } from 'react';
import { getTheme, setTheme, wipeAll, listWarehouses, getActiveWarehouseId } from '../db';
import { inventorySnapshot } from '../services/sync';
import { downloadText } from '../lib/files';
import { confirmDialog, showToast } from '../lib/ui';
import { navigate } from '../router';
import { formatTime } from '../types';

type ThemeMode = 'light' | 'dark' | 'system';

export function SettingsPage({ onThemeChange }: { onThemeChange: () => void }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme());
  const [busy, setBusy] = useState(false);
  const whCount = listWarehouses().length;
  const activeId = getActiveWarehouseId();

  function changeTheme(mode: ThemeMode) {
    setTheme(mode);
    setThemeState(mode);
    onThemeChange();
    showToast('主题已切换', 'success');
  }

  async function exportPanel() {
    setBusy(true);
    try {
      const snap = inventorySnapshot();
      const rows = snap.items
        .map(
          (i) =>
            `<tr><td>${esc(i.name)}</td><td class="mono">${esc(i.code ?? '')}</td><td>${esc(i.category)}</td><td>${i.qty}</td><td class="mono">${formatTime(i.updatedAt)}</td></tr>`,
        )
        .join('');
      const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>码上记面板</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:0;background:#f3f0e8;color:#1a1e22}
header{background:#14181c;color:#e8e6e0;padding:14px 18px}h1{margin:0;font-size:18px}
main{padding:18px;max-width:960px;margin:0 auto}table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden}
th,td{border:1px solid #e7e2d6;padding:8px 10px;text-align:left}th{background:#ebe7dc}
.mono{font-family:Consolas,monospace}</style></head><body>
<header><h1>码上记 · 局域网面板</h1><p>快照 ${snap.exportedAt} · ${snap.items.length} 条</p></header>
<main><table><thead><tr><th>名称</th><th>条码</th><th>分类</th><th>数量</th><th>更新</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
      downloadText(html, 'localscan-webpanel.html', 'text/html;charset=utf-8');
      showToast('已保存：localscan-webpanel.html', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '生成失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function wipe() {
    const ok = await confirmDialog({
      title: '清空全部数据',
      message: '将删除所有仓库与物品并恢复示例数据，不可恢复。',
      danger: true,
      confirmText: '清空',
    });
    if (!ok) return;
    wipeAll();
    showToast('已清空并恢复示例', 'success');
    onThemeChange();
    navigate({ name: 'items' });
  }

  return (
    <div className="page settings-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">偏好</p>
          <h1>设置</h1>
        </div>
      </header>

      <section className="settings-group">
        <h2 className="group-title">外观</h2>
        <div className="settings-row">
          <div>
            <p className="row-title">主题</p>
            <p className="row-sub">跟随系统或强制浅色 / 深色</p>
          </div>
          <div className="seg">
            {(
              [
                ['light', '浅色'],
                ['dark', '深色'],
                ['system', '系统'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={theme === k ? 'seg-btn active' : 'seg-btn'}
                onClick={() => changeTheme(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-group">
        <h2 className="group-title">仓库</h2>
        <button type="button" className="settings-row link" onClick={() => navigate({ name: 'warehouses' })}>
          <div>
            <p className="row-title">管理仓库</p>
            <p className="row-sub">当前 {whCount} 个 · 活动 {activeId ? '已选' : '无'}</p>
          </div>
          <span className="chev">›</span>
        </button>
      </section>

      <section className="settings-group">
        <h2 className="group-title">数据</h2>
        <button type="button" className="settings-row link" onClick={() => navigate({ name: 'sync' })}>
          <div>
            <p className="row-title">导出与同步</p>
            <p className="row-sub">CSV / Excel / ZIP / 加密备份 / 同步包</p>
          </div>
          <span className="chev">›</span>
        </button>
        <button type="button" className="settings-row link" disabled={busy} onClick={() => void exportPanel()}>
          <div>
            <p className="row-title">局域网 Web 面板</p>
            <p className="row-sub">生成只读 HTML 快照文件</p>
          </div>
          <span className="chev">›</span>
        </button>
      </section>

      <section className="settings-group danger-group">
        <h2 className="group-title">危险操作</h2>
        <button type="button" className="settings-row link danger" onClick={() => void wipe()}>
          <div>
            <p className="row-title">清空全部数据</p>
            <p className="row-sub">删除所有仓库与物品</p>
          </div>
          <span className="chev">›</span>
        </button>
      </section>

      <p className="about">码上记 LocalScan · 数据默认不出设备</p>
    </div>
  );
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
