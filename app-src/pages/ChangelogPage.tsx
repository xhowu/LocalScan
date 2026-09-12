import { navigate } from '../router';
import { APP_VERSION } from '../lib/app-const';

/**
 * Semver：MAJOR 架构/数据模型 · MINOR 新功能 · PATCH 修 bug / 体验
 * 日期与会话开发时间线一致（2026-09-10 → 09-12）。
 */
const LOG: Array<{ version: string; date: string; kind: string; items: string[] }> = [
  {
    version: '1.4.0',
    date: '2026-09-12',
    kind: 'MINOR · 收敛体验（终版）',
    items: [
      '状态卡片选中底色统一为 #F5E8E6，与列表红胶囊一致',
      '过期/零库存小胶囊与选中遮罩配色对齐',
      '编辑保存/取消 replace 导航，返回层级不再回退到编辑页',
      '图片：右上角删除、底部排序；仓库侧滑打开即刷新状态',
      '清理死代码，版本日志与关于页与实现对齐',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-11',
    kind: 'MINOR · 临期体系与可管理筛选',
    items: [
      '生产日期 + 保质期（月）自动计算截止日期；临期阈值字段',
      '物品统计：在库 / 低库存 / 临期 / 过期，可点选筛选',
      '状态筛选可排序、隐藏、恢复；首页四格卡片可配置',
      '位置字段与分类位置管理；筛选记忆',
      '综合导出单份 ZIP；Toast 显示保存路径',
      '设置新增关于 App（饼图 / 技术栈 / 计算说明）',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-11',
    kind: 'MINOR · 原生扫码与壳层固定',
    items: [
      '接入 Google ML Kit 原生扫码（EAN/UPC/Code128/QR）',
      '相册读图识别；闪光灯；结果弹窗',
      '顶底栏固定并与系统栏同色；扫描页内取景框',
      '多仓库左缘滑出；导出写入 Documents/LocalScan',
      '暗色模式；临时字段与固定字段模板',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-10',
    kind: 'MINOR · 多仓库与图片',
    items: [
      '多仓库切换与统计',
      '长按卡片编辑删除；拍照上传与图片压缩',
      '导出/同步成功失败提示；加密备份入口',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-10',
    kind: 'MAJOR · 首个可用版本',
    items: [
      '本地物品库存 CRUD（无账号、无云）',
      '条码扫描与相册识别入口',
      'CSV / XLSX / 含图 ZIP 导出',
      'JSON 同步包与 AES-GCM 加密备份',
      '局域网只读 Web 面板快照',
    ],
  },
];

export function ChangelogPage() {
  return (
    <div className="page">
      <header className="nav-bar">
        <button type="button" className="back-btn" onClick={() => navigate({ name: 'settings' })}>
          ←
        </button>
        <h1>版本更新</h1>
        <span />
      </header>

      <p className="lead">
        当前版本 <strong className="mono">v{APP_VERSION}</strong>
        <br />
        <span className="field-sub">MAJOR 架构 · MINOR 新功能 · PATCH 修复</span>
      </p>

      <div className="changelog">
        {LOG.map((v) => (
          <section key={v.version} className="changelog-card">
            <div className="changelog-head">
              <h2 className="mono">v{v.version}</h2>
              <time>{v.date}</time>
            </div>
            <p className="changelog-kind">{v.kind}</p>
            <ul>
              {v.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="ai-note">注：以上文本由AI生成</p>
    </div>
  );
}
