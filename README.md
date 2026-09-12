# 码上记 LocalScan

注重隐私、无需账号与云端的本地物品 / 库存管理工具。

## 站点入口（一站两页）

| 页面 | 说明 | 链接 |
|------|------|------|
| **产品页** | 官网式产品介绍与技术手册 | [product-manual.html](./product-manual.html) |
| **设计方案** | 设计说明与交互示意 | [index.html](./index.html) |

在线：

- 产品：https://xhowu.github.io/LocalScan/product-manual.html
- 设计：https://xhowu.github.io/LocalScan/

## 安装包

- **v1.4.0**（versionCode 4）：[`releases/LocalScan-debug-v1.4.0.apk`](./releases/LocalScan-debug-v1.4.0.apk)

允许「未知来源」后安装；首次启动含示例数据，可在设置中清空。

## 产品要点

- 本地库存 CRUD · 相机/相册扫码（Google ML Kit）· 多仓库
- 临期 / 过期体系 · 可配置状态卡片与筛选
- 导出 CSV / XLSX / ZIP · JSON 同步包 · AES-GCM 加密备份

## 仓库结构

```
index.html          设计方案页（Pages 默认入口）
product-manual.html 产品页 / 技术手册
releases/           安卓安装包
app-src/            App 源码（Vite + React + Capacitor）
app-package.json    依赖清单
```

## 版本

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.4.0 | 2026-09-12 | 终版：状态卡片配色、导航层级、图片工具、仓库统计 |
| v1.3.0 | 2026-09-11 | 临期体系、可管理筛选、关于页 |
| v1.2.0 | 2026-09-11 | ML Kit 原生扫码、壳层固定 |
| v1.0.0 | 2026-09-10 | 首个可用版本 |

## 关于

- 作者 · xhowu
- AI 工具 · Xiaomi MIMO
- 代码与文档由 AI 辅助生成并按实现核对
