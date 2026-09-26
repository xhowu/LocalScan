import { useState } from 'react';
import { getActiveWarehouseId, getWarehouse } from '../db';
import {
  exportCsv,
  exportEncryptedBackup,
  exportSyncFile,
  exportXlsx,
  exportZipWithImages,
  importEncryptedBackup,
  itemsForExport,
  parseSyncFile,
} from '../services/export';
import { mergeRemoteItems, type MergeResult } from '../services/sync';
import { showToast } from '../lib/ui';
import { navigate } from '../router';

export function SyncPage({ onChanged: _onChanged }: { onChanged?: () => void }) {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [merge, setMerge] = useState<MergeResult | null>(null);
  // Always follow the global active warehouse (top bar)
  const whId = getActiveWarehouseId() ?? '';
  const wh = whId ? getWarehouse(whId) : null;

  async function run(fn: () => Promise<string | void> | string | void, failTitle = '操作失败') {
    setBusy(true);
    setMerge(null);
    try {
      const result = await fn();
      if (typeof result === 'string' && result) {
        showToast(`已保存到：${result}`, 'success');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      showToast(`${failTitle}：${msg}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  function items() {
    return itemsForExport(whId);
  }

  async function exportAll() {
    // one ZIP; run() will toast the path
    return exportZipWithImages(items());
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">数据</p>
          <h1>导出与同步</h1>
        </div>
      </header>
      <p className="lead">
        数据默认留在本机。导出与同步均由你主动发起。目标仓库跟随顶栏：
        <strong> {wh?.name ?? '未选'}</strong>
        （点顶栏「仓库」切换）。
      </p>

      <section className="panel">
        <h2>表格导出</h2>
        <p className="panel-desc">
          Android 保存到「文档 / LocalScan」。当前 <strong>{wh?.name}</strong> 共{' '}
          {items().length} 条。
        </p>
        <div className="sub-row">
          <button
            type="button"
            className="sub-btn"
            disabled={busy}
            onClick={() => void run(() => exportCsv(items()), '导出失败')}
          >
            .CSV
          </button>
          <button
            type="button"
            className="sub-btn"
            disabled={busy}
            onClick={() => void run(() => exportXlsx(items()), '导出失败')}
          >
            .XLSX
          </button>
          <button
            type="button"
            className="sub-btn"
            disabled={busy}
            onClick={() => void run(() => exportZipWithImages(items()), '导出失败')}
          >
            .ZIP
          </button>
        </div>
        <div className="stack" style={{ marginTop: '0.65rem' }}>
          <button
            type="button"
            className="btn-primary full"
            disabled={busy}
            onClick={() => void run(exportAll, '导出失败')}
          >
            导出综合（一份 ZIP：CSV + XLSX + 图片）
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>点对点同步</h2>
        <p className="panel-desc">仅同步本仓库数据；导入不会改动其他仓库。</p>
        <div className="stack">
          <button
            type="button"
            className="btn-primary full"
            disabled={busy}
            onClick={() => void run(() => exportSyncFile(items()), '导出失败')}
          >
            导出同步包 .json
          </button>
          <label className="btn-ghost full file-btn">
            导入同步包并合并
            <input
              type="file"
              accept="application/json,.json"
              hidden
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                try {
                  const remote = await parseSyncFile(file);
                  const result = await mergeRemoteItems(remote, whId);
                  setMerge(result);
                  showToast(
                    `合并完成：新建 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}`,
                    'success',
                  );
                } catch (err) {
                  showToast(err instanceof Error ? err.message : '导入失败', 'error');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
        {merge && merge.conflicts.length > 0 && (
          <details className="conflicts">
            <summary>字段冲突 {merge.conflicts.length} 处（以较新时间戳为准）</summary>
            <ul>
              {merge.conflicts.slice(0, 20).map((c, i) => (
                <li key={`${c.field}-${i}`}>
                  <strong>{c.name}</strong> · {c.field}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="panel">
        <h2>防丢加密备份</h2>
        <p className="panel-desc">AES-GCM + PBKDF2。请牢记口令。</p>
        <label className="field">
          <span>备份口令</span>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="至少 6 位"
          />
        </label>
        <div className="stack" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn-primary full"
            disabled={busy || pass.length < 6}
            onClick={() => void run(() => exportEncryptedBackup(items(), pass), '备份失败')}
          >
            导出加密备份 .enc
          </button>
          <label className="btn-ghost full file-btn">
            导入加密备份 .enc
            <input
              type="file"
              accept="*/*"
              hidden
              disabled={busy || pass.length < 6}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                try {
                  const remote = await importEncryptedBackup(file, pass);
                  const result = await mergeRemoteItems(remote, whId);
                  setMerge(result);
                  showToast(`恢复完成：新建 ${result.created}，更新 ${result.updated}`, 'success');
                } catch (err) {
                  showToast(err instanceof Error ? err.message : '恢复失败', 'error');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
      </section>

      <button type="button" className="btn-ghost full" onClick={() => navigate({ name: 'items' })}>
        返回列表
      </button>
    </div>
  );
}