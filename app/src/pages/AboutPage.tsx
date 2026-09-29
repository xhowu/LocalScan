/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { useEffect, useState } from 'react';
import { navigate, goBack } from '../router';
import { APP_VERSION } from '../lib/app-const';
import { requestManualJump } from '../lib/manual-jump';

/** 与当前实现一致的近似源码占比（说明用） */
const MODULES = [
  {
    name: '页面 UI',
    loc: 3150,
    color: '#b33a2f',
    detail: '物品列表/详情/编辑、扫码（内嵌相机）、文字识别、回收站、内置使用手册、导出同步、设置、仓库抽屉、分类位置、字段与状态模板',
  },
  {
    name: '数据层',
    loc: 850,
    color: '#2f8f66',
    detail: 'localStorage：仓库与物品、分类位置、主题、筛选与卡片配置；版本与临期规则',
  },
  {
    name: '扫码识别',
    loc: 760,
    color: '#2f6fed',
    detail: 'Android：ML Kit 相机/相册 + 原生浮层取景 + 文字识别 + 条码商品查询（三级兜底）；Web 兜底 zxing + jsQR',
  },
  {
    name: '导出同步',
    loc: 500,
    color: '#b07a1a',
    detail: 'CSV / XLSX / 含图 ZIP；JSON 同步包合并；AES-GCM 备份；局域网 HTML 面板（搜索/深色）',
  },
  {
    name: '壳层样式',
    loc: 720,
    color: '#6d736f',
    detail: '与系统栏同色的顶底栏、固定布局、状态卡片与主题',
  },
] as const;

const totalLoc = MODULES.reduce((s, m) => s + m.loc, 0);

/** 功能模块：ver = 模块成立版本；子项 ver = 该子功能首次发布的版本（与版本日志对应），
 *  sec = 手册中解释该子内容的章节锚点（manual-html 的 h2/h3 id，逐条核对过） */
const FEATURES: Array<{
  name: string;
  ver: string;
  items: Array<{ text: string; ver: string; sec: string }>;
}> = [
  {
    name: '物品管理',
    ver: '1.0.0',
    items: [
      { text: '增删改查 · 数量 ± 与键盘输入', ver: '1.0.0', sec: 'sec-7' },
      { text: '长按快捷菜单', ver: '1.1.0', sec: 'sec-6' },
      { text: '拍照上传与图片压缩', ver: '1.1.0', sec: 'sec-9' },
      { text: '图片删除 / 排序', ver: '1.4.0', sec: 'sec-12' },
      { text: '名称恒速滚动跑马灯', ver: '1.5.0', sec: 'sec-6' },
      { text: '图片查看器：双指缩放 / 双击 / 切换', ver: '1.5.0', sec: 'sec-12' },
      { text: '旋转语义：编辑写回 / 详情预览', ver: '1.5.1', sec: 'sec-12' },
    ],
  },
  {
    name: '扫码',
    ver: '1.2.0',
    items: [
      { text: 'ML Kit 原生识别（EAN/UPC/Code128/QR）', ver: '1.2.0', sec: 'sec-14' },
      { text: '相册读图 · 闪光灯 · 结果弹窗 · 手动输入', ver: '1.2.0', sec: 'sec-14' },
      { text: '内嵌相机浮层（WebView 保持不透明）', ver: '1.8.0', sec: 'sec-14' },
      { text: '相机严格状态机：仅页面在顶部时开启', ver: '1.9.6', sec: 'sec-14' },
      { text: '聚焦输入即关相机 / 键盘适配', ver: '1.9.8', sec: 'sec-14' },
      { text: '结果弹窗出现时轻微震动', ver: '1.10.0', sec: 'sec-14' },
    ],
  },
  {
    name: '日期与临期',
    ver: '1.3.0',
    items: [
      { text: '生产 + 保质月 → 截止日期', ver: '1.3.0', sec: 'sec-20' },
      { text: '临期阈值（可按物品设置）', ver: '1.3.0', sec: 'sec-20' },
      { text: '日期即时校验（天数/闰年/超前提示）', ver: '1.9.0', sec: 'sec-20' },
    ],
  },
  {
    name: '状态筛选',
    ver: '1.3.0',
    items: [
      { text: '在库 / 低库存 / 零库存 / 临期 / 过期', ver: '1.3.0', sec: 'sec-19' },
      { text: '无日期 / 无条码警示', ver: '1.3.0', sec: 'sec-19' },
      { text: '可排序 / 隐藏 / 恢复', ver: '1.3.0', sec: 'sec-19' },
      { text: '首页四格卡片可配置', ver: '1.3.0', sec: 'sec-19' },
    ],
  },
  {
    name: '批次子项',
    ver: '1.5.0',
    items: [
      { text: '同条码多批次（各自日期与数量）', ver: '1.5.0', sec: 'sec-11' },
      { text: '父项归组 · 详情互跳 · 重复提示', ver: '1.5.0', sec: 'sec-11' },
      { text: '子项两层限制（孙项自动平铺）', ver: '1.7.0', sec: 'sec-11' },
    ],
  },
  {
    name: '联网查询（联网版）',
    ver: '1.5.0',
    items: [
      { text: '扫码命中查询商品信息', ver: '1.5.0', sec: 'sec-16' },
      { text: 'GS1 失败自动改查开源库', ver: '1.8.7', sec: 'sec-16' },
      { text: '三级兜底：GS1 → MXNZP → OFF', ver: '1.9.4', sec: 'sec-16' },
      { text: '手动输入同链路', ver: '1.9.5', sec: 'sec-16' },
    ],
  },
  {
    name: '文字识别',
    ver: '1.5.0',
    items: [
      { text: '拍照 / 相册 ML Kit 中文 OCR', ver: '1.5.0', sec: 'sec-15' },
      { text: '自动抽取名称 / 规格 / 净含量 / 日期', ver: '1.5.0', sec: 'sec-15' },
    ],
  },
  {
    name: '多仓库',
    ver: '1.1.0',
    items: [
      { text: '抽屉切换（顶栏按钮，自左缘滑出）', ver: '1.1.0', sec: 'sec-17' },
      { text: '状态卡片与物品页同步', ver: '1.1.0', sec: 'sec-17' },
      { text: '全仓导出按原仓库还原', ver: '1.6.0', sec: 'sec-17' },
    ],
  },
  {
    name: '分类与模板',
    ver: '1.2.0',
    items: [
      { text: '临时字段与固定字段模板', ver: '1.2.0', sec: 'sec-18' },
      { text: '位置字段与分类位置管理', ver: '1.3.0', sec: 'sec-18' },
    ],
  },
  {
    name: '导出',
    ver: '1.0.0',
    items: [
      { text: 'CSV / XLSX 表格导出', ver: '1.0.0', sec: 'sec-22' },
      { text: '多仓库自动分工作表', ver: '1.7.0', sec: 'sec-22' },
      { text: '范围开关（当前 / 全部仓库）', ver: '1.6.0', sec: 'sec-22' },
      { text: '含图 ZIP：表格 + 数据 + 图片打包', ver: '1.3.0', sec: 'sec-23' },
    ],
  },
  {
    name: '同步备份',
    ver: '1.0.0',
    items: [
      { text: 'JSON 同步包合并', ver: '1.0.0', sec: 'sec-24' },
      { text: 'AES-GCM 加密备份', ver: '1.0.0', sec: 'sec-25' },
      { text: '导入前校验弹窗', ver: '1.6.0', sec: 'sec-24' },
      { text: '换机全量迁移（图片本体随包）', ver: '1.7.0', sec: 'sec-24' },
    ],
  },
  {
    name: '局域网面板',
    ver: '1.0.0',
    items: [
      { text: '只读 HTML 快照（多 sheet 页签）', ver: '1.0.0', sec: 'sec-29' },
      { text: '搜索 / 自适应 / 表头吸顶重做', ver: '1.8.7', sec: 'sec-29' },
      { text: '深浅色三态开关', ver: '1.9.0', sec: 'sec-29' },
      { text: '双版本独立文件名互斥', ver: '1.9.3', sec: 'sec-29' },
    ],
  },
  {
    name: '回收站',
    ver: '1.9.0',
    items: [
      { text: '软删除物品集中查看', ver: '1.9.0', sec: 'sec-10' },
      { text: '恢复（父项连带子项）/ 彻底删除', ver: '1.9.0', sec: 'sec-10' },
    ],
  },
  {
    name: '手册',
    ver: '1.9.0',
    items: [
      { text: '内置全功能说明 · 目录跳转', ver: '1.9.0', sec: 'sec-1' },
      { text: '全文搜索荧光高亮', ver: '1.9.2', sec: 'sec-1' },
      { text: '搜索控件悬浮化', ver: '1.9.8', sec: 'sec-1' },
      { text: '回车跳第一处命中', ver: '1.9.9', sec: 'sec-1' },
    ],
  },
  {
    name: '显示与操作',
    ver: '1.2.0',
    items: [
      { text: '深浅色主题', ver: '1.2.0', sec: 'sec-30' },
      { text: 'Android 返回键 / 手势导航', ver: '1.5.0', sec: 'sec-32' },
      { text: '字体大小四档', ver: '1.5.1', sec: 'sec-30' },
      { text: '安全区适配', ver: '1.5.1', sec: 'sec-4' },
      { text: '双击顶栏回顶', ver: '1.9.9', sec: 'sec-32' },
      { text: '长按语义区分：控件不可选，内容可复制', ver: '1.10.0', sec: 'sec-32' },
      { text: '返回定位：下级返回保留位置与展开', ver: '1.10.0', sec: 'sec-32' },
    ],
  },
];

/** 功能模块 → 手册章节锚点（manual-html 的 h2/h3 id），全部与手册实际章节核对过 */
const FEATURE_SEC: Record<string, string> = {
  物品管理: 'sec-5',
  扫码: 'sec-13',
  日期与临期: 'sec-20',
  状态筛选: 'sec-19',
  批次子项: 'sec-11',
  '联网查询（联网版）': 'sec-16',
  文字识别: 'sec-15',
  多仓库: 'sec-17',
  分类与模板: 'sec-18',
  导出: 'sec-21',
  同步备份: 'sec-24',
  局域网面板: 'sec-29',
  回收站: 'sec-10',
  手册: 'sec-1',
  显示与操作: 'sec-30',
};

/** 左侧竖条用色：与代码结构饼图同一调色板，视觉呼应 */
const FEATURE_COLORS = [
  '#b8433a', '#c96f2b', '#b39422', '#7da33c', '#3f9a5f',
  '#2fa08d', '#2b93b5', '#3a7fd5', '#5f6fd1', '#7d5fc9',
  '#a45fc9', '#c25f9e', '#c25267', '#8a6f4d', '#6d736f',
];

/** 展开状态持久化：进手册再返回关于页时，模块展开/收起与离开时一致，
 *  页面总高度不变 —— 配合 App 的滚动位置记忆，返回即回到原位 */
const ABOUT_UI_KEY = 'localscan.aboutOpenFeat';

function FeatureList() {
  const [open, setOpen] = useState<number | null>(() => {
    try {
      const raw = sessionStorage.getItem(ABOUT_UI_KEY);
      return raw == null ? null : (JSON.parse(raw) as number | null);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(ABOUT_UI_KEY, JSON.stringify(open));
    } catch {
      /* 存储不可用时静默：仅影响返回后的展开状态还原 */
    }
  }, [open]);
  /** 两段式确认：已按下待确认的子功能行（key = 模块-子项），再按一次才真正跳转 */
  const [armed, setArmed] = useState<string | null>(null);
  return (
    <div className="feat-acc">
      {FEATURES.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.name} className={isOpen ? 'feat open' : 'feat'}>
            <button
              type="button"
              className="feat-head"
              onClick={() => {
                setArmed(null);
                setOpen(isOpen ? null : i);
              }}
              aria-expanded={isOpen}
            >
              <i className="feat-bar" style={{ background: FEATURE_COLORS[i % FEATURE_COLORS.length] }} />
              <span className="feat-name">
                {f.name}
                <span className="mono feat-ver-chip">v{f.ver}</span>
              </span>
              {!isOpen && <span className="feat-count">{f.items.length} 项</span>}
              {!isOpen ? (
                <span className="feat-chev" aria-hidden="true">
                  ›
                </span>
              ) : (
                <span
                  className="feat-manual-btn"
                  role="button"
                  tabIndex={0}
                  aria-label={`进入手册查看${f.name}说明`}
                  onClick={(e) => {
                    e.stopPropagation();
                    requestManualJump(FEATURE_SEC[f.name] ?? 'sec-1');
                    navigate({ name: 'manual' });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      requestManualJump(FEATURE_SEC[f.name] ?? 'sec-1');
                      navigate({ name: 'manual' });
                    }
                  }}
                >
                  说明<i className="feat-manual-arr">›</i>
                </span>
              )}
            </button>
            <div className="feat-body">
              <div className="feat-body-in">
                {f.items.map((it, j) => {
                  const key = `${i}-${j}`;
                  const isArmed = armed === key;
                  return (
                    <div
                      key={it.text}
                      className={isArmed ? 'feat-row armed' : 'feat-row'}
                      title={isArmed ? '再按行收起「说明」' : '按下出现「说明」入口'}
                      onClick={() => setArmed(isArmed ? null : key)}
                    >
                      <span className="feat-txt">{it.text}</span>
                      <span className="mono feat-row-ver">{it.ver}</span>
                      <span
                        className="mono feat-row-say"
                        role="button"
                        tabIndex={0}
                        title="进入手册对应章节"
                        aria-label="进入手册对应章节"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestManualJump(it.sec);
                          navigate({ name: 'manual' });
                          setArmed(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            requestManualJump(it.sec);
                            navigate({ name: 'manual' });
                            setArmed(null);
                          }
                        }}
                      >
                        说明<i className="feat-manual-arr">›</i>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
      <p className="feat-hint">按子功能条出现 / 收起「说明›」，按红字「说明›」进入手册对应章节</p>
    </div>
  );
}

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
        <button type="button" className="back-btn" onClick={() => goBack({ name: 'settings' })}>
          ←
        </button>
        <h1>关于码上记</h1>
        <span />
      </header>

      <section className="hero-card">
        <p className="hero-title">
          码上记『LocalScan』 <span className="mono">v{APP_VERSION}</span>
        </p>
        <p className="hero-sub">
          {__ONLINE__ ? '联网版 · 可与离线版共存' : '离线版 · 可与联网版共存'} · 无账号 · 无云
          <br />
          本地库存，数据默认不出设备
        </p>
        <div className="hero-actions">
          <button
            type="button"
            className="hero-btn"
            onClick={() => navigate({ name: 'changelog' })}
          >
            版本日志
          </button>
          <a
            className="hero-btn ghost"
            href="https://github.com/xhowu/LocalScan"
            target="_blank"
            rel="noreferrer"
          >
            GitHub 项目
          </a>
          <button
            type="button"
            className="hero-btn"
            onClick={() => navigate({ name: 'manual' })}
          >
            App 手册
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>代码结构占比（约 {totalLoc} 行）</h2>
        <p className="chart-note">饼图占比为源码行数粗估，仅用于结构说明。</p>
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
        <h2>功能</h2>
        <FeatureList />
      </section>

      <section className="panel">
        <h2>技术栈</h2>
        <dl className="detail-list">
          <div>
            <dt>前端</dt>
            <dd>React 19 + TypeScript + Vite 8</dd>
          </div>
          <div>
            <dt>壳层</dt>
            <dd>Capacitor 8 · Android（WebView 保持不透明，相机经原生浮层嵌入）</dd>
          </div>
          <div>
            <dt>扫码与识别</dt>
            <dd>Google ML Kit（条码 / 中文 OCR）· zxing + jsQR 兜底</dd>
          </div>
          <div>
            <dt>存储</dt>
            <dd>localStorage JSON（物品 / 仓库 / 图片 dataURL / 配置），无账号无云</dd>
          </div>
          <div>
            <dt>加密</dt>
            <dd>AES-256-GCM，PBKDF2（SHA-256 · 120000 次）派生密钥</dd>
          </div>
          <div>
            <dt>导出</dt>
            <dd>SheetJS 生成 XLSX · JSZip 打包 · 图片最长边 1080px / ≤500KB 压缩</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2>计算规则</h2>
        <dl className="detail-list">
          <div>
            <dt>截止日期</dt>
            <dd>生产日期 + 保质期（月），本地日历加月（1 月 31 日 + 1 月 = 2 月 28 日）</dd>
          </div>
          <div>
            <dt>日期校验</dt>
            <dd>年份 4 位（0000–9999）· 月 01–12 · 日按当月天数（含闰年）；无效当场细分提示，晚于今天提示"超前生产"，有效绿字回显截止日期</dd>
          </div>
          <div>
            <dt>过期</dt>
            <dd>截止日期早于昨天（含 1 天宽限，当天到期不算过期）</dd>
          </div>
          <div>
            <dt>临期</dt>
            <dd>未过期，且截止 − 今天 ≤ 临期阈值（月，默认 1，可按物品设置）</dd>
          </div>
          <div>
            <dt>状态判定</dt>
            <dd>在库 &gt;0 · 低库存 ≤ 阈值且 &gt;0 · 零库存 =0；无日期 / 无条码为警示</dd>
          </div>
          <div>
            <dt>批次</dt>
            <dd>同仓库同条码两层：父项 + 子项，子项不可再挂子项；按生产日期排序</dd>
          </div>
          <div>
            <dt>同步合并</dt>
            <dd>id 匹配，同码唯一父项兜底；较新 updatedAt 覆盖并记冲突；version 取大 +1；图片并集</dd>
          </div>
        </dl>
      </section>
      <p className="ai-note">注：以上文本由AI生成</p>
    </div>
  );
}
