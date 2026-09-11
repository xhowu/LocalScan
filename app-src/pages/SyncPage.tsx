import { useState } from 'react';
import {
  getActiveWarehouseId,
  getWarehouse,
  listWarehouses,
  setActiveWarehouseId,
} from '../db';
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

export function SyncPage() {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [merge, setMerge] = useState<MergeResult | null>(null);
  const [whId, setWhId] = useState(() => getActiveWarehouseId() ?? '');
  const warehouses = listWarehouses();
  const wh = whId ? getWarehouse(whId) : null;

  async function run(fn: () => Promise<string | void> | string | void, failTitle = '操作失败') {
    setBusy(true);
    setMerge(null);
    try {
      const result = await fn();
      if (typeof result === 'string' && result) {
        showToast(`已保存：${result}（浏览器下载目录）`, 'success');
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

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">数据</p>
          <h1>导出与同步</h1>
        </div>
      </header>
      <p className="lead">数据默认留在本机。导出与同步均由你主动发起，不经云端。</p>

      <div className="field">
        <span>目标仓库</span>
        <select
          value={whId}
          onChange={(e) => {
            setWhId(e.target.value);
            setActiveWarehouseId(e.target.value);
          }}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <section className="panel glass-in">
        <h2>导出 · {wh?.name ?? '当前仓库'}</h2>
        <p className="panel-desc">共 {items().length} 条物品。成功后会提示文件名，文件保存在系统下载目录。</p>
        <div className="stack">
          <button
            type="button"
            className="btn-ghost full"
            disabled={busy}
            onClick={() => void run(() => exportCsv(items()), '导出失败')}
          >
            导出 .csv
          </button>
          <button
            type="button"
            className="btn-ghost full"
            disabled={busy}
            onClick={() => void run(() => exportXlsx(items()), '导出失败')}
          >
            导出 .xlsx
          </button>
          <button
            type="button"
            className="btn-ghost full"
            disabled={busy}
            onClick={() => void run(() => exportZipWithImages(items()), '导出失败')}
          >
            导出含图片 .zip
          </button>
        </div>
      </section>

      <section className="panel glass-in">
        <h2>点对点同步</h2>
        <p className="panel-desc">导出 JSON 同步包，通过系统分享发到另一设备导入并合并。</p>
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
                  <strong>{c.name}</strong> · {c.field}：本机 <span className="mono">{String(c.local)}</span> → 远端{' '}
                  <span className="mono">{String(c.remote)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="panel glass-in">
        <h2>防丢加密备份</h2>
        <p className="panel-desc">AES-GCM + PBKDF2。请牢记口令，丢失口令无法恢复。</p>
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
            导入加密备份
            <input
              type="file"
              accept=".enc,application/octet-stream"
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
