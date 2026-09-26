import { useState } from 'react';
import {
  allItemsIncludingDeleted,
  getActiveWarehouseId,
  getWarehouse,
  listWarehouses,
  restoreImages,
} from '../db';
import {
  exportCsv,
  exportEncryptedBackup,
  exportFileName,
  exportSyncFile,
  exportXlsx,
  exportZipWithImages,
  importEncryptedBackup,
  itemsForExport,
  parseSyncPayload,
  type ParsedSync,
} from '../services/export';
import { mergeAllWarehouses, mergeRemoteItems, type MergeResult } from '../services/sync';
import { confirmDialog, showToast } from '../lib/ui';
import { navigate } from '../router';

type Scope = 'current' | 'all';

export function SyncPage({ onChanged: _onChanged }: { onChanged?: () => void }) {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [merge, setMerge] = useState<MergeResult | null>(null);
  const [scope, setScope] = useState<Scope>('current');
  /** 导出/备份是否带上图片本体（换机全量迁移需要勾上） */
  const [withImages, setWithImages] = useState(true);
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

  const allScope = scope === 'all';
  /** 导出文件名（不含扩展名）：单仓=仓库名+日期；全仓=机型+日期+多仓 */
  const baseName = exportFileName({ allWarehouses: allScope, warehouseName: wh?.name });

  function items() {
    if (allScope) return allItemsIncludingDeleted(null).filter((i) => !i.deleted);
    return itemsForExport(whId);
  }

  /**
   * 导入前的校验与确认：说清楚「这是什么数据、有多少、会导到哪里」，
   * 并在数据包范围与当前范围不一致时给出警示（多仓包导进单仓 / 单仓包按全仓导）。
   */
  async function confirmImport(kindLabel: string, parsed: ParsedSync): Promise<boolean> {
    const whNames = parsed.warehouses?.map((w) => w.name) ?? [];
    const whIds = parsed.warehouses?.map((w) => w.id) ?? [
      ...new Set(parsed.items.map((i) => i.warehouseId ?? '')),
    ];
    const isMulti = parsed.scope === 'all' || whIds.length > 1;
    const target = allScope
      ? '全部仓库（按数据包里的原仓库还原）'
      : `当前仓库「${wh?.name ?? '未选'}」（其余仓库不受影响）`;

    const imgCount = parsed.images ? Object.keys(parsed.images).length : 0;
    const lines = [
      `类型：${kindLabel} · ${isMulti ? '多仓库数据' : '单仓库数据'}`,
      `内容：${whIds.length} 个仓库、${parsed.items.length} 条物品`,
      imgCount > 0 ? `图片：${imgCount} 张（会一并还原）` : '图片：数据包内不含图片',
    ];
    if (whNames.length > 0) {
      lines.push(`仓库：${whNames.slice(0, 6).join('、')}${whNames.length > 6 ? ' 等' : ''}`);
    }
    lines.push(`导入到：${target}`);

    const warns: string[] = [];
    if (isMulti && !allScope) {
      warns.push(
        '这是多仓库数据，但当前范围是「当前仓库」——所有物品会被合并进同一个仓库，仓库名不会还原。建议先切到「全部仓库」再导入。',
      );
    }
    if (!isMulti && allScope) {
      warns.push(
        '这是单仓库数据，但当前范围是「全部仓库」——会按数据包里的原仓库新建或合并。若只想恢复到一个仓库，请先切到「当前仓库」。',
      );
    }
    const message = warns.length ? `${lines.join('\n')}\n\n⚠ ${warns.join('\n⚠ ')}` : lines.join('\n');

    return confirmDialog({
      title: warns.length ? '导入范围不一致' : '确认导入',
      message,
      danger: true,
      confirmText: '确认导入',
      cancelText: '取消',
    });
  }

  /** 真正执行合并（范围决定按原仓库还原还是合并到当前仓库） */
  async function applyImport(parsed: ParsedSync) {
    // 先落图片再合并物品：物品里存的是 imageIds 引用，图片不在的话列表/详情就是空占位
    const n = restoreImages(parsed.images);
    const result = allScope
      ? await mergeAllWarehouses(parsed.items, parsed.warehouses)
      : await mergeRemoteItems(parsed.items, whId);
    if (n > 0) showToast(`已还原 ${n} 张图片`, 'success');
    setMerge(result);
    return result;
  }

  async function exportAll() {
    // one ZIP; run() will toast the path
    return exportZipWithImages(items(), baseName, allScope ? listWarehouses() : undefined);
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">数据</p>
          <h1>导出与同步</h1>
        </div>
        <div className="seg page-head-seg" role="group" aria-label="导出范围">
          <button
            type="button"
            className={allScope ? 'seg-btn' : 'seg-btn active'}
            aria-pressed={!allScope}
            onClick={() => setScope('current')}
          >
            当前仓库
          </button>
          <button
            type="button"
            className={allScope ? 'seg-btn active' : 'seg-btn'}
            aria-pressed={allScope}
            onClick={() => setScope('all')}
          >
            全部仓库
          </button>
        </div>
      </header>
      <p className="lead">
        数据默认留在本机。导出与同步均由你主动发起。当前范围：
        <strong>{allScope ? '全部仓库' : (wh?.name ?? '未选')}</strong>。
        {!allScope && '（点顶栏「仓库」切换当前仓库）'}
        {allScope && `共 ${listWarehouses().length} 个仓库，导入时会按原仓库还原。`}
      </p>

      {/* 与表格导出 / 点对点同步 / 加密备份并列的独立开关；开关在标题行最右侧 */}
      <section className="panel">
        <div className="panel-head-row">
          <h2>包含图片</h2>
          <div className="seg" role="group" aria-label="包含图片">
            <button
              type="button"
              className={withImages ? 'seg-btn active' : 'seg-btn'}
              aria-pressed={withImages}
              onClick={() => setWithImages(true)}
            >
              开启
            </button>
            <button
              type="button"
              className={!withImages ? 'seg-btn active' : 'seg-btn'}
              aria-pressed={!withImages}
              onClick={() => setWithImages(false)}
            >
              关闭
            </button>
          </div>
        </div>
        <p className="panel-desc">
          控制「导出同步包」与「加密备份」是否携带图片本体。开启：换新手机导入即可完整还原图片；
          关闭：只导出条目数据，文件更小、导出更快。
        </p>
      </section>

      <section className="panel">
        <h2>表格导出</h2>
        <p className="panel-desc">
          Android 保存到「文档 / LocalScan」。范围：
          <strong>{allScope ? '全部仓库' : (wh?.name ?? '未选')}</strong>，共 {items().length} 条。
        </p>
        <div className="sub-row">
          <button
            type="button"
            className="sub-btn"
            disabled={busy}
            onClick={() => void run(() => exportCsv(items(), baseName), '导出失败')}
          >
            .CSV
          </button>
          <button
            type="button"
            className="sub-btn"
            disabled={busy}
            onClick={() => void run(() => exportXlsx(items(), baseName, allScope ? listWarehouses() : undefined), '导出失败')}
          >
            .XLSX
          </button>
          <button
            type="button"
            className="sub-btn"
            disabled={busy}
            onClick={() => void run(() => exportZipWithImages(items(), baseName, allScope ? listWarehouses() : undefined), '导出失败')}
          >
            图片.ZIP
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
        <p className="panel-desc">
          {allScope
            ? '导出全部仓库；导入时按原仓库还原（同名仓库合并）。'
            : '仅同步本仓库数据；导入不会改动其他仓库。'}
          图片：<strong>{withImages ? '包含' : '不包含'}</strong>（见上方「包含图片」开关）。
        </p>
        <div className="stack">
          <button
            type="button"
            className="btn-primary full"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  exportSyncFile(items(), {
                    warehouses: allScope ? listWarehouses() : undefined,
                    fileName: baseName,
                    withImages,
                  }),
                '导出失败',
              )
            }
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
                  const parsed = await parseSyncPayload(file);
                  if (!(await confirmImport('同步包', parsed))) return;
                  const result = await applyImport(parsed);
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
        <p className="panel-desc">
          AES-GCM + PBKDF2。请牢记口令。备份含仓库信息，恢复时能还原仓库名称；图片
          <strong>{withImages ? '一并打包' : '不包含（见上方开关）'}</strong>。
        </p>
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
            onClick={() =>
              void run(
                () =>
                  exportEncryptedBackup(
                    items(),
                    pass,
                    baseName,
                    allScope ? listWarehouses() : undefined,
                    withImages,
                  ),
                '备份失败',
              )
            }
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
                  const parsed = await importEncryptedBackup(file, pass);
                  if (!(await confirmImport('加密备份', parsed))) return;
                  const result = await applyImport(parsed);
                  showToast(
                    `恢复完成：新建 ${result.created}，更新 ${result.updated}`,
                    'success',
                  );
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