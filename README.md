# 码上记 LocalScan

注重隐私、无需账号与云端的**本地**物品 / 库存管理工具。数据默认不出设备，不绑账号、不上云。

在线站点：**https://xhowu.github.io/LocalScan/**

## 下载

安装包一律通过 [Releases](https://github.com/xhowu/LocalScan/releases) 分发（不进仓库）。

| 版本 | 说明 | 下载 |
|------|------|------|
| **v1.10.0 · 离线版**（推荐） | 无任何联网代码，联网查询在编译期整体移除 | [Releases / v1.10.0](https://github.com/xhowu/LocalScan/releases/tag/v1.10.0) |
| **v1.10.0 · 联网版** | 含条码商品信息查询（默认关闭，可共存安装） | [Releases / v1.10.0](https://github.com/xhowu/LocalScan/releases/tag/v1.10.0) |
| **v1.4.0**（归档） | 首个可用版本 | [Releases / v1.4.0](https://github.com/xhowu/LocalScan/releases/tag/v1.4.0) |

v1.10.0 每个版本按 CPU 架构可选：

| 架构 | 适用 | 大小 |
|------|------|------|
| universal | 全架构兼容（含模拟器） | 75.0 MB |
| arm64-v8a | 2016 年后的绝大多数手机（**推荐**） | 29.5 MB |
| armeabi-v7a | 老 32 位设备 | 23.5 MB |
| x86_64 | 模拟器 | 31.1 MB |

完整的版本-资产对照（含直链）见 [docs/RELEASES.md](./docs/RELEASES.md)。

## 仓库结构

```
index.html / design.html / styles.css   官网产物（GitHub Pages 站点根）
website/                                官网构建源（模板 + 组装脚本 + 素材）
app/                                    主线 App 源码（= v1.10.0）
v1.10.0/                                v1.10.0 源码快照（归档）
v1.4.0/                                 v1.4.0 归档
  ├─ app/                               源码快照
  ├─ site/                              旧官网（历史）
  └─ dev-bounce-demo/                   回弹调试示例工程（历史）
docs/                                   使用手册、版本-资产对照表
```

约定：

- **官网是产物**：`index.html` / `design.html` / `styles.css` 由 `website/build.mjs` 生成（从 `website/index.template.html` + `website/parts/` 组装），Pages 直接服务根目录这三个文件。改官网请改 `website/`，然后跑 `node website/build.mjs`。
- **`app/` 是活代码**：日常开发与构建都在这（原生工程 `app/android/`、`node_modules`、`dist*` 均被忽略）。
- **版本归档**：`vX.Y.Z/` 是该版本冻结的源码快照，只增不改；安装包不在仓库内，挂 Releases。

## 开发（app/）

```bash
cd app
npm install
npm run build           # 离线版 → dist
npm run build:online    # 联网版 → dist-online
npm run android:apk     # 构建离线版 APK
npm run android:apk:online
```

Android 构建参数（版本号、flavor、ABI 拆分）在 `app/android/app/build.gradle`；App 版本号同步于 `app/src/lib/app-const.ts`。

## 关于

- 作者 · xhowu
- 项目地址 · https://github.com/xhowu/LocalScan
- AI · MIMO & DeepSeek & GLM
