import { useEffect, useState } from 'react';
import {
  allItemsIncludingDeleted,
  getTheme,
  setTheme,
  wipeAll,
  listWarehouses,
  getActiveWarehouseId,
  getWarehouse,
  listFieldTemplates,
} from '../db';
import { exportRows } from '../services/export';
import { saveText } from '../lib/files';
import { confirmDialog, showToast } from '../lib/ui';
import { navigate } from '../router';
import { APP_VERSION } from '../lib/app-const';
import {
  FONT_SCALE_OPTIONS,
  applyFontScale,
  loadFontScale,
  saveFontScale,
  type FontScale,
} from '../lib/font-scale';
import type { LookupConfig, LookupProvider } from '../services/barcode-lookup';

type ThemeMode = 'light' | 'dark' | 'system';

export function SettingsPage({
  onThemeChange,
  onOpenWarehouses,
  onWiped,
}: {
  onThemeChange: () => void;
  onOpenWarehouses?: () => void;
  onWiped?: () => void;
}) {
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme());
  const [busy, setBusy] = useState(false);
  const [lookupCfg, setLookupCfg] = useState<LookupConfig | null>(null);
  const [fontScale, setFontScale] = useState<FontScale>(() => loadFontScale());
  const templates = listFieldTemplates();
  const whCount = listWarehouses().length;

  /* 联网版：条码查询配置（离线版构建时这段会被编译期移除） */
  useEffect(() => {
    if (!__ONLINE__) return;
    void import('../services/barcode-lookup').then((m) => setLookupCfg(m.loadLookupConfig()));
  }, []);

  function patchLookup(next: Partial<LookupConfig>) {
    setLookupCfg((cur) => {
      if (!cur) return cur;
      const merged = { ...cur, ...next };
      void import('../services/barcode-lookup').then((m) => m.saveLookupConfig(merged));
      return merged;
    });
  }

  function getWarehouseName() {
    const id = getActiveWarehouseId();
    return id ? getWarehouse(id)?.name ?? '未选' : '未选';
  }

  function changeTheme(mode: ThemeMode) {
    setTheme(mode);
    setThemeState(mode);
    onThemeChange();
    showToast('主题已切换', 'success');
  }

  function changeFontScale(next: FontScale) {
    saveFontScale(next);
    applyFontScale(next);
    setFontScale(next);
  }

  /**
   * 局域网 Web 面板：多仓库用「工作表页签」的形式呈现（类似 Excel 的多 sheet），
   * 每张表按「父项 → 其子项」的顺序排列，子项带缩进标记。
   */
  async function exportPanel() {
    setBusy(true);
    try {
      const whs = listWarehouses();
      const all = allItemsIncludingDeleted(null).filter((i) => !i.deleted);
      const sheets = [
        { name: '全部', rows: exportRows(all) },
        ...whs.map((w) => ({
          name: w.name,
          rows: exportRows(all.filter((i) => i.warehouseId === w.id)),
        })),
      ];

      const tabs = sheets
        .map(
          (s, i) =>
            `<button type="button" class="tab${i === 0 ? ' active' : ''}" data-i="${i}">${esc(s.name)}<b>${s.rows.length}</b></button>`,
        )
        .join('');

      const body = sheets
        .map((s, i) => {
          const rows = s.rows
            .map((r) => {
              const child = String(r['层级']).includes('子项');
              return `<tr class="${child ? 'child' : ''}"><td class="lvl">${esc(String(r['层级']))}</td><td>${esc(String(r['名称']))}</td><td class="mono">${esc(String(r['条码']))}</td><td>${esc(String(r['分类']))}</td><td class="num">${r['数量']}</td><td>${esc(String(r['单位']))}</td><td class="mono">${r['购入价']}</td><td class="mono">${r['售价']}</td><td>${esc(String(r['备注']))}</td><td class="mono">${esc(String(r['更新时间']))}</td></tr>`;
            })
            .join('');
          return `<section class="sheet${i === 0 ? '' : ' hidden'}" data-sheet="${i}" data-title="${esc(s.name)}">
<p class="sheet-title">${esc(s.name)} · ${s.rows.length} 行</p>
<div class="table-wrap"><table><thead><tr><th>层级</th><th>名称</th><th>条码</th><th>分类</th><th>数量</th><th>单位</th><th>购入价</th><th>售价</th><th>备注</th><th>更新时间</th></tr></thead><tbody>${rows}</tbody></table></div>
</section>`;
        })
        .join('');

      const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>码上记面板</title>
<style>
:root{
  --bg:#f3f0e8;--card:#fff;--line:#e7e2d6;--ink:#1a1e22;--muted:#6f747c;
  --head:#14181c;--head-ink:#e8e6e0;--th:#ebe7dc;--accent:#b33a2f;--zebra:#faf7f1;
}
html[data-theme='dark']{--bg:#121519;--card:#1d2228;--line:#2c333b;--ink:#e8e6e0;--muted:#9aa1a9;
  --head:#0b0e11;--head-ink:#e8e6e0;--th:#242b33;--accent:#e07064;--zebra:#181d23}
@media (prefers-color-scheme:dark){
  html:not([data-theme='light']){--bg:#121519;--card:#1d2228;--line:#2c333b;--ink:#e8e6e0;--muted:#9aa1a9;
    --head:#0b0e11;--head-ink:#e8e6e0;--th:#242b33;--accent:#e07064;--zebra:#181d23}
}
*{box-sizing:border-box}
body{font:14px/1.55 system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;margin:0;background:var(--bg);color:var(--ink)}
header{background:var(--head);color:var(--head-ink);padding:16px 20px 14px;position:sticky;top:0;z-index:20;box-shadow:0 2px 10px rgba(0,0,0,.18)}
.brand{display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap}
h1{margin:0;font-size:17px;letter-spacing:.02em}
.brand .ver{font-size:11px;opacity:.6;font-family:ui-monospace,Consolas,monospace}
header p{margin:.3rem 0 0;opacity:.72;font-size:12px}
.stats{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.chip{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:3px 10px;font-size:12px}
.chip b{color:#ffb4a8;font-weight:700}
.headrow{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}
.theme-btn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);color:inherit;border-radius:999px;padding:4px 12px;font:inherit;font-size:12px;cursor:pointer}
html[data-theme='dark'] .theme-btn{background:#1d2228;border-color:#2c333b}
html[data-theme='light'] .theme-btn{background:#fff;border-color:#d9d3c6}
@media (prefers-color-scheme:dark){.chip b{color:#e07064}}
nav.tabs{position:sticky;top:0;background:var(--bg);display:flex;gap:6px;flex-wrap:wrap;padding:10px 20px;z-index:10;border-bottom:1px solid var(--line)}
nav.tabs .tab{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}
nav.tabs .tab b{margin-left:6px;font-weight:700;color:var(--accent)}
nav.tabs .tab.active{background:var(--accent);border-color:var(--accent);color:#fff}
nav.tabs .tab.active b{color:#fff}
.search{padding:10px 20px 0}
.search input{width:100%;padding:9px 14px;font:inherit;font-size:14px;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:10px;outline:none}
.search input:focus{border-color:var(--accent)}
main{padding:12px 20px 32px;max-width:1100px;margin:0 auto}
.sheet-title{margin:6px 0 8px;font-weight:600;color:var(--muted);font-size:13px}
.sheet.hidden{display:none}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--card)}
table{width:100%;border-collapse:collapse;min-width:760px}
th,td{padding:8px 12px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--line)}
tbody tr:last-child td{border-bottom:none}
th{position:sticky;top:0;background:var(--th);font-size:12px;color:var(--muted);z-index:5}
td.lvl{color:var(--muted);font-size:12px}
td.num{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:nth-child(even){background:var(--zebra)}
tbody tr:hover{background:color-mix(in srgb,var(--accent) 7%,transparent)}
tr.child td:nth-child(2){padding-left:28px;position:relative}
tr.child td:nth-child(2)::before{content:"└";position:absolute;left:12px;color:var(--muted);opacity:.7}
td.mono{font-family:ui-monospace,Consolas,monospace;font-size:13px}
.empty-row td{text-align:center;color:var(--muted);padding:22px}
footer{padding:14px 20px 26px;color:var(--muted);font-size:12px;text-align:center}
@media (max-width:600px){
  header,nav.tabs,.search{padding-left:12px;padding-right:12px}
  main{padding:10px 12px 26px}
  th,td{padding:7px 9px}
}
</style></head><body>
<header>
  <div class="brand"><h1>码上记 · 局域网面板</h1><span class="ver">v${esc(APP_VERSION)}</span></div>
  <p>快照 ${esc(new Date().toLocaleString('zh-CN'))} · 只读</p>
  <div class="headrow">
    <div class="stats"><span class="chip">仓库 <b>${sheets.length - 1}</b></span><span class="chip">物品 <b>${all.length}</b></span></div>
    <button id="theme-btn" class="theme-btn" type="button">主题 · 跟随系统</button>
  </div>
</header>
<nav class="tabs">${tabs}</nav>
<div class="search"><input id="q" type="search" placeholder="搜索名称 / 条码 / 分类 / 备注…" autocomplete="off"></div>
<main>${body}</main>
<footer>码上记 局域网只读快照 · 数据不出设备</footer>
<script>
var tabs=document.querySelectorAll('nav.tabs .tab');
tabs.forEach(function(b){b.addEventListener('click',function(){
  tabs.forEach(function(x){x.classList.toggle('active',x===b)});
  document.querySelectorAll('section.sheet').forEach(function(s){s.classList.toggle('hidden',s.dataset.sheet!==b.dataset.i)});
  applyFilter();
})});
var THEME_LABEL={auto:'跟随系统',dark:'深色',light:'浅色'};
var pref=localStorage.getItem('ls-panel-theme')||'auto';
var tbtn=document.getElementById('theme-btn');
function applyTheme(){
  if(pref==='auto')delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme=pref;
  tbtn.textContent='主题 · '+THEME_LABEL[pref];
}
tbtn.addEventListener('click',function(){
  pref=pref==='auto'?'dark':(pref==='dark'?'light':'auto');
  localStorage.setItem('ls-panel-theme',pref);
  applyTheme();
});
applyTheme();
var q=document.getElementById('q');
function applyFilter(){
  var kw=(q.value||'').trim().toLowerCase();
  var sheet=document.querySelector('section.sheet:not(.hidden)');
  if(!sheet)return;
  var shown=0;
  sheet.querySelectorAll('tbody tr').forEach(function(tr){
    var hit=!kw||tr.textContent.toLowerCase().indexOf(kw)>=0;
    tr.style.display=hit?'':'none';
    if(hit)shown++;
  });
  sheet.querySelector('.sheet-title').textContent=sheet.dataset.title+' · '+shown+' 行';
}
q.addEventListener('input',applyFilter);
</script>
</body></html>`;
      // 文件名带版本身份：Android 分区存储下共享目录里的文件归属首个创建它的应用，
      // 另一个版本（不同包名）无法覆盖别人的文件 —— 各写各的文件名就互不影响
      const fname = __ONLINE__ ? 'localscan-webpanel-online.html' : 'localscan-webpanel.html';
      const path = await saveText(html, fname, 'text/html;charset=utf-8');
      showToast(`已保存到：${path}`, 'success');
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
    // 第二道确认：给一个反悔机会，避免误触直接清库
    const ok2 = await confirmDialog({
      title: '再次确认',
      message: `即将永久删除 ${whCount} 个仓库及其全部物品（含图片引用），并恢复示例数据。此操作无法撤销，确定继续吗？`,
      danger: true,
      confirmText: '确认清空',
    });
    if (!ok2) return;
    wipeAll();
    showToast('已清空并恢复示例', 'success');
    onThemeChange();
    onWiped?.();
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

        <div className="settings-row">
          <div>
            <p className="row-title">字体大小</p>
            <p className="row-sub">同比缩放</p>
          </div>
          <div className="seg">
            {FONT_SCALE_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={fontScale === o.key ? 'seg-btn active' : 'seg-btn'}
                onClick={() => changeFontScale(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-group">
        <h2 className="group-title">仓库</h2>
        <button
          type="button"
          className="settings-row link"
          onClick={() => onOpenWarehouses?.()}
        >
          <div>
            <p className="row-title">当前仓库</p>
            <p className="row-sub">
              {getWarehouseName()} · 共 {whCount} 个
            </p>
          </div>
          <span className="chev">‹</span>
        </button>
      </section>

      <section className="settings-group">
        <h2 className="group-title">物品参数</h2>
        <button
          type="button"
          className="settings-row link"
          onClick={() => navigate({ name: 'taxonomy', kind: 'category' })}
        >
          <div>
            <p className="row-title">分类与位置</p>
            <p className="row-sub">编辑、排序、删除分类与库位</p>
          </div>
          <span className="chev">›</span>
        </button>
        <button
          type="button"
          className="settings-row link"
          onClick={() => navigate({ name: 'status-filters' })}
        >
          <div>
            <p className="row-title">状态筛选</p>
            <p className="row-sub">显示 / 隐藏 / 排序物品页状态</p>
          </div>
          <span className="chev">›</span>
        </button>
        <button
          type="button"
          className="settings-row link"
          onClick={() => navigate({ name: 'field-templates' })}
        >
          <div>
            <p className="row-title">自定义字段模板</p>
            <p className="row-sub">管理编辑页固定字段 · 当前 {templates.length} 个</p>
          </div>
          <span className="chev">›</span>
        </button>
      </section>

      {__ONLINE__ && lookupCfg && (
        <section className="settings-group">
          <h2 className="group-title">联网查询</h2>
          <div className="lookup-card glass-in">
            <div className="lookup-row">
              <div>
                <p className="row-title">条码商品信息查询</p>
                <p className="row-sub">
                  {lookupCfg.provider === 'off'
                    ? '已关闭 · 扫码不会联网'
                    : '命中后自动查询 · 结果仅用于填单'}
                </p>
              </div>
              <div className="seg">
                <button
                  type="button"
                  className={lookupCfg.provider !== 'off' ? 'seg-btn active' : 'seg-btn'}
                  onClick={() => patchLookup({ provider: 'gs1-cn' })}
                >
                  开启
                </button>
                <button
                  type="button"
                  className={lookupCfg.provider === 'off' ? 'seg-btn active' : 'seg-btn'}
                  onClick={() => patchLookup({ provider: 'off' })}
                >
                  关闭
                </button>
              </div>
            </div>

            {lookupCfg.provider !== 'off' && (
              <>
                <div className="lookup-divider" />
                <div className="lookup-row">
                  <div>
                    <p className="row-title">数据源</p>
                    <p className="row-sub">默认库：GS1 - MXNZP - OFF</p>
                  </div>
                  <div className="seg">
                    {(
                      [
                        ['gs1-cn', '默认库'],
                        ['custom', '自定义接口'],
                      ] as Array<[LookupProvider, string]>
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        className={lookupCfg.provider === k ? 'seg-btn active' : 'seg-btn'}
                        onClick={() => patchLookup({ provider: k })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {lookupCfg.provider === 'gs1-cn' && (
                  <>
                  <div className="lookup-fields">
                    <label className="field">
                      <span>API Key（可选）</span>
                      <input
                        className="mono"
                        value={lookupCfg.apiKey}
                        onChange={(e) => patchLookup({ apiKey: e.target.value })}
                        placeholder="留空用匿名额度"
                      />
                    </label>
                    <label className="field narrow">
                      <span>超时 ms</span>
                      <input
                        className="mono"
                        inputMode="numeric"
                        value={lookupCfg.timeoutMs}
                        onChange={(e) =>
                          patchLookup({
                            timeoutMs: Number(e.target.value.replace(/\D/g, '')) || 8000,
                          })
                        }
                      />
                    </label>
                  </div>
                  <p className="lookup-note">填写自己的GS1 API Key，可提升GS1额度，提高体验</p>
                  </>
                )}

                {lookupCfg.provider === 'custom' && (
                  <>
                    <label className="field">
                      <span>接口地址（{'{code}'} 占位）</span>
                      <input
                        className="mono"
                        value={lookupCfg.customUrl}
                        onChange={(e) => patchLookup({ customUrl: e.target.value })}
                        placeholder="https://example.com/api/barcode/{code}"
                      />
                    </label>
                    <label className="field">
                      <span>请求头（可选，一行一条，如 X-API-Key: xxx）</span>
                      <input
                        className="mono"
                        value={lookupCfg.customHeader}
                        onChange={(e) => patchLookup({ customHeader: e.target.value })}
                        placeholder="X-API-Key: your-key"
                      />
                    </label>
                    <div className="lookup-fields">
                      <label className="field narrow">
                        <span>超时 ms</span>
                        <input
                          className="mono"
                          inputMode="numeric"
                          value={lookupCfg.timeoutMs}
                          onChange={(e) =>
                            patchLookup({
                              timeoutMs: Number(e.target.value.replace(/\D/g, '')) || 8000,
                            })
                          }
                        />
                      </label>
                    </div>
                    <p className="lookup-note">填写自建/自购服务，以提高体验</p>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      )}

      <section className="settings-group">
        <h2 className="group-title">数据</h2>
        <button type="button" className="settings-row link" onClick={() => navigate({ name: 'sync' })}>
          <div>
            <p className="row-title">导出与同步</p>
            <p className="row-sub">CSV / Excel / ZIP / 加密备份 / 同步包</p>
          </div>
          <span className="chev">›</span>
        </button>
        <button
          type="button"
          className="settings-row link"
          onClick={() => navigate({ name: 'recycle' })}
        >
          <div>
            <p className="row-title">回收站</p>
            <p className="row-sub">查看已删除的物品 · 恢复或彻底删除</p>
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

      <section className="settings-group">
        <h2 className="group-title">关于</h2>
        <button
          type="button"
          className="settings-row link"
          onClick={() => navigate({ name: 'changelog' })}
        >
          <div>
            <p className="row-title">版本</p>
            <p className="row-sub mono">
              v{APP_VERSION} · {__ONLINE__ ? '联网版' : '离线版'} · 点击查看更新日志
            </p>
          </div>
          <span className="chev">›</span>
        </button>
        <button
          type="button"
          className="settings-row link"
          onClick={() => navigate({ name: 'about' })}
        >
          <div>
            <p className="row-title">关于 App</p>
            <p className="row-sub">功能结构、技术栈与计算说明</p>
          </div>
          <span className="chev">›</span>
        </button>
      </section>

      <div className="about-footer">
        <p>码上记 LocalScan · 数据默认不出设备</p>
        <p className="footer-sep">—</p>
        <p>作者 · xhowu</p>
        <p>
          <a
            className="author-link"
            href="https://github.com/xhowu/LocalScan"
            target="_blank"
            rel="noreferrer"
          >
            项目地址 · https://github.com/xhowu/LocalScan
          </a>
        </p>
        <p>AI · MIMO & DeepSeek & GLM</p>
        <p>注 · 所有代码均由AI生成</p>
      </div>
    </div>
  );
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
