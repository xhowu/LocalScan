# 码上记 LocalScan

注重隐私、无需联网、支持多设备点对点同步的本地物品 / 库存管理工具。

## 在线预览（产品设计方案）

启用 GitHub Pages 后访问：

**https://xhowu.github.io/LocalScan/**

> 方案页为纯静态 HTML，无需构建，打开即是设计说明与交互示意。

## 产品要点

- **扫码识别**：1D 条形码 / 2D 二维码，重复校验
- **物品管理**：基础信息、财务信息、库存时间、多媒体图片
- **数据导出**：`.xlsx` / `.csv` / 含图 `.zip`
- **多设备同步**：系统分享或 WiFi 直连 / 蓝牙 P2P
- **增量同步**：仅传输 `version` 变化的数据
- **局域网 Web 面板**：手机开服务，电脑浏览器批量操作
- **防丢备份**：导出加密备份文件

## 仓库内容

| 路径 | 说明 |
|------|------|
| `index.html` + `styles.css` + `app.js` | 产品设计方案展示页（GitHub Pages 入口） |
| `app-src/` | 可运行 App 前端源码（Vite + 本地存储） |
| `app-package.json` | App 依赖清单 |

## 本地打开方案页

直接用浏览器打开根目录 `index.html` 即可，无依赖。

## 本地运行 App 源码

```bash
# 将 app-src 与 app-package.json 按正常 Vite 项目组织后
npm install
npm run dev
```

## 许可

见仓库设置。
