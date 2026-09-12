# 码上记 LocalScan

注重隐私、无需账号与云端的本地物品 / 库存管理工具。

## 在线页面

| 页面 | 说明 |
|------|------|
| [产品设计方案](./index.html) | 设计说明与交互示意（GitHub Pages 首页） |
| [产品技术手册](./product-manual.html) | 功能、规则、架构与安装说明 |

启用 GitHub Pages 后访问：**https://xhowu.github.io/LocalScan/**

## 下载安装包

- [`releases/LocalScan-debug-v1.4.0.apk`](./releases/LocalScan-debug-v1.4.0.apk)（v1.4.0 · versionCode 4）

允许「未知来源」后安装。首次启动含示例数据，可在设置中清空。

## 产品要点

- 本地库存 CRUD · 相机/相册扫码（ML Kit）· 多仓库  
- 临期 / 过期体系 · 可配置状态卡片与筛选  
- 导出 CSV / XLSX / ZIP · JSON 同步包 · AES-GCM 加密备份  

## 仓库结构

```
index.html          产品设计方案展示页（Pages 入口）
product-manual.html 产品技术手册
releases/           安卓安装包
app-src/            App 前端源码（Vite + React + Capacitor）
app-package.json    依赖清单
```

本地打开方案页 / 手册：浏览器直接打开对应 HTML 即可。

## 关于

- 作者 · xhowu  
- AI 工具 · Xiaomi MIMO  
- 代码与文档由 AI 辅助生成并按实现核对  
