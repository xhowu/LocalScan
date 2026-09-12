import { useState } from 'react';
import { navigate } from '../router';
import { APP_VERSION } from '../lib/app-const';

/** 与当前实现一致的近似源码占比（说明用） */
const MODULES = [
  {
    name: '页面 UI',
    loc: 2600,
    color: '#b33a2f',
    detail: '物品列表/详情/编辑、扫码、导出同步、设置、仓库侧滑、分类位置、字段与状态模板',
  },
  {
    name: '数据层',
    loc: 850,
    color: '#2f8f66',
    detail: 'localStorage：仓库与物品、分类位置、主题、筛选与卡片配置；版本与临期规则',
  },
  {
    name: '扫码识别',
    loc: 520,
    color: '#2f6fed',
    detail: 'Android：Google ML Kit 相机与相册；Web 兜底 zxing + jsQR',
  },
  {
    name: '导出同步',
    loc: 420,
    color: '#b07a1a',
    detail: 'CSV / XLSX / 含图 ZIP；JSON 同步包合并；AES-GCM 备份；局域网 HTML 快照',
  },
  {
    name: '壳层样式',
    loc: 720,
    color: '#6d736f',
    detail: '与系统栏同色的顶底栏、固定布局、状态卡片与主题',
  },
] as const;

const totalLoc = MODULES.reduce((s, m) => s + m.loc, 0);

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, start);
  const e = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

export function AboutPage() {
  const [active, setActive] = useState(0);
  let acc = 0;
  const slices = MODULES.map((m) => {
    const start = acc;
    const angle = (m.loc / totalLoc) * 360;
    acc += angle;
    return { ...m, start, end: acc, pct: Math.round((m.loc / totalLoc) * 1000) / 10 };
  });
  const cur = slices[active];

  return (
    <div className="page">
      <header className="nav-bar">
        <button type="button" className="back-btn" onClick={() => navigate({ name: 'settings' })}>
          ←
        </button>
        <h1>关于码上记</h1>
        <span />
      </header>

      <p className="lead">
        <strong className="mono">v{APP_VERSION}</strong> · 本地库存，数据默认不出设备
      </p>

      <section className="panel">
        <h2>代码结构占比（约 {totalLoc} 行）</h2>
        <div className="chart-wrap">
          <svg viewBox="0 0 240 240" className="pie-chart" role="img" aria-label="代码结构饼图">
            {slices.map((s, i) => (
              <path
                key={s.name}
                d={slicePath(120, 120, 100, s.start, s.end - 0.4)}
                fill={s.color}
                opacity={i === active ? 1 : 0.5}
                onClick={() => setActive(i)}
                style={{ cursor: 'pointer' }}
              />
            ))}
            <circle cx="120" cy="120" r="58" fill="var(--card)" />
            <text x="120" y="112" textAnchor="middle" className="pie-center-label">
              {cur.name}
            </text>
            <text x="120" y="132" textAnchor="middle" className="pie-center-pct">
              {cur.pct}%
            </text>
          </svg>
          <ul className="pie-legend">
            {slices.map((s, i) => (
              <li key={s.name}>
                <button
                  type="button"
                  className={i === active ? 'legend-row active' : 'legend-row'}
                  onClick={() => setActive(i)}
                >
                  <i style={{ background: s.color }} />
                  <span>{s.name}</span>
                  <span className="mono">
                    {s.loc} 行 · {s.pct}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="chart-detail">{cur.detail}</p>
      </section>

      <section className="panel">
        <h2>已实现功能</h2>
        <dl className="detail-list">
          <div>
            <dt>物品管理</dt>
            <dd>CRUD；数量 ± 与键盘输入；图片压缩 / 删除 / 排序</dd>
          </div>
          <div>
            <dt>扫码</dt>
            <dd>相机 ML Kit；相册读图；闪光灯；手动输入；结果弹窗</dd>
          </div>
          <div>
            <dt>多仓库</dt>
            <dd>侧滑切换；状态与物品页四格卡片同步；导出绑定当前仓</dd>
          </div>
          <div>
            <dt>分类位置</dt>
            <dd>新建改名排序删除；列表筛选并记忆</dd>
          </div>
          <div>
            <dt>日期</dt>
            <dd>生产 + 保质月 → 截止；临期阈值驱动临期/过期统计</dd>
          </div>
          <div>
            <dt>状态筛选</dt>
            <dd>在库/低库存/零库存/临期/过期等；可隐藏排序；首页卡片可配</dd>
          </div>
          <div>
            <dt>导出</dt>
            <dd>CSV / XLSX / 含图 ZIP；综合单份 ZIP；Android → Documents/LocalScan</dd>
          </div>
          <div>
            <dt>同步备份</dt>
            <dd>JSON 同步包合并 · AES-GCM .enc · 局域网只读面板</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2>技术栈与计算</h2>
        <dl className="detail-list">
          <div>
            <dt>前端</dt>
            <dd>React 19 + TypeScript + Vite</dd>
          </div>
          <div>
            <dt>壳层</dt>
            <dd>Capacitor 8 · Android</dd>
          </div>
          <div>
            <dt>扫码</dt>
            <dd>Google ML Kit；zxing + jsQR 兜底</dd>
          </div>
          <div>
            <dt>存储</dt>
            <dd>localStorage JSON</dd>
          </div>
          <div>
            <dt>截止日期</dt>
            <dd>生产日期 + 保质期（月）· 本地日历加月</dd>
          </div>
          <div>
            <dt>临期</dt>
            <dd>未过期，且截止 − 今天 ≤ 临期阈值（月）</dd>
          </div>
          <div>
            <dt>过期</dt>
            <dd>截止日期 &lt; 今天 − 1 日（宽限）</dd>
          </div>
          <div>
            <dt>同步</dt>
            <dd>id/条码匹配；较新 updatedAt 覆盖字段；version + 1</dd>
          </div>
        </dl>
        <p className="chart-note">饼图占比为源码行数粗估，仅用于结构说明。</p>
      </section>
      <p className="ai-note">注：以上文本由AI生成</p>
    </div>
  );
}
