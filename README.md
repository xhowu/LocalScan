# 码上记 LocalScan

[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-brightgreen.svg)](./LICENSE)
[![Latest release](https://img.shields.io/github/v/release/xhowu/LocalScan?label=release)](https://github.com/xhowu/LocalScan/releases)
[![CI](https://github.com/xhowu/LocalScan/actions/workflows/ci.yml/badge.svg)](https://github.com/xhowu/LocalScan/actions/workflows/ci.yml)
[![Website](https://img.shields.io/badge/site-xhowu.github.io%2FLocalScan-blue)](https://xhowu.github.io/LocalScan/)

注重隐私、无需账号与云端的**本地**物品 / 库存管理工具。数据默认不出设备，不绑账号、不上云。

在线站点：**https://xhowu.github.io/LocalScan/**

许可 [MPL-2.0](./LICENSE) ｜ 贡献指南 [CONTRIBUTING.md](./CONTRIBUTING.md) ｜ 安全策略 [SECURITY.md](./SECURITY.md) ｜ 变更日志 [CHANGELOG.md](./CHANGELOG.md)

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
scripts/                                仓库维护脚本（变更日志、第三方清单自动生成）
app/                                    主线 App 源码（= v1.10.0）
v1.10.0/                                v1.10.0 源码快照（归档）
v1.4.0/                                 v1.4.0 归档
  ├─ app/                               源码快照
  ├─ site/                              旧官网（历史）
  └─ dev-bounce-demo/                   回弹调试示例工程（历史）
docs/                                   使用手册、版本-资产对照表、第三方许可证清单
.github/                                工程配置：CI、issue / PR 模板、依赖机器人
```

约定：

- **官网是产物**：`index.html` / `design.html` / `styles.css` 由 `website/build.mjs` 生成（从 `website/index.template.html` + `website/parts/` 组装），Pages 直接服务根目录这三个文件。改官网请改 `website/`，然后跑 `node website/build.mjs`。
- **`app/` 是活代码**：日常开发与构建都在这（原生工程 `app/android/`、`node_modules`、`dist*` 均被忽略）。
- **版本归档**：`vX.Y.Z/` 是该版本冻结的源码快照，只增不改；安装包不在仓库内，挂 Releases。
- **`CHANGELOG.md` 与 `docs/THIRD-PARTY.md` 是自动生成的**，不要手改；重新生成用
  `node scripts/gen-changelog.mjs` 和 `node scripts/gen-third-party.mjs`（CI 会校验是否同步）。

## 开发

### App（app/）

```bash
cd app
npm ci                       # 严格按 lockfile 安装（CI 用同一命令）
npm run dev                  # Web 开发服务器
npm run build                # 离线版 → dist
npm run build:online         # 联网版 → dist-online
npm run android:apk          # 一键：build + cap-sync + assembleOfflineDebug
npm run android:apk:online   # 一键：联网版
```

**Android 原生工程已随源码入库**（`app/android/`，含手写 Java 插件、两个 flavor 的专属资源、
flavor/ABI 拆分与版本号配置、图标与启动图）。克隆后**不需要也不要**重新执行 `cap add android`
——那会覆盖这些手改内容。

构建前置：**JDK 21** + **Android SDK**（build-tools 34+，platform 34 或 36）。
`ANDROID_HOME` 未设置时在 `app/android/local.properties` 里指定 `sdk.dir`（该文件不入库）。

不入库、由命令重建的生成物：`app/android/app/build/`、`.gradle/`、`local.properties`、
`app/src/main/assets/public/`、`capacitor-cordova-android-plugins/`。

若某环境下 `gradlew` 不可用，可直接用系统 Gradle：
`gradle -p android assembleOfflineDebug --max-workers=1`（低配机器再加 `-Dorg.gradle.parallel=false`）。

版本号需**多处同步**（CI 会校验前三处必须一致）：

| 位置 | 内容 |
|---|---|
| `app/src/lib/app-const.ts` | `APP_VERSION` |
| `app/android/app/build.gradle` | `versionCode` / `versionName` |
| `app/package.json` | `version` |
| `app/src/pages/ChangelogPage.tsx` | 追加一条版本日志（`CHANGELOG.md` 由它自动生成） |

**离线包红线**：离线版承诺不含任何联网代码，构建后产物里不允许出现 `barcode-lookup`：

```bash
ls app/dist/assets | grep -c barcode-lookup          # 必须为 0
ls app/dist-online/assets | grep -c barcode-lookup   # 必须为 1
```

两个 flavor 的 web 产物必须隔离（由 `app/scripts/cap-sync.mjs` 负责）。
这条断言已写进 CI，改坏了会直接拦下来。

### 官网（website/ → 仓库根）

```bash
node website/parts/extract.mjs        # 从 App 源码提取手册 / 版本日志 / 图标 → parts/
node website/build.mjs                # 模板 + 素材 → website/index.html
cp website/index.html index.html      # 根目录才是 Pages 服务的位置
cp website/design.html website/styles.css .   # 设计方案页由 iframe 直接嵌入，需同步到根
```

两个脚本都基于自身位置定位，**克隆到任何路径都能跑**（无需改路径）。
`parts/` 里的素材已入库，只有改了 App 的手册 / 版本日志 / 图标才需要重跑 `extract.mjs`。

### 发布新版本

1. 改版本号（三处，见上）→ `npm run android:apk` 与 `npm run android:apk:online`
2. 按 ABI 得到 8 个包，重命名为 `LocalScan-v<版本>[-online][-<架构>].apk`
3. 建 Release 并上传（`gh release create v<版本> …`）——资产名必须与官网直链完全一致
4. 同步 `website/index.template.html` 里的直链与包体大小 → 重建官网 → 复制到根
5. 更新 `docs/RELEASES.md`；把当版源码复制成 `v<版本>/` 快照

## 许可

本项目采用 **[Mozilla Public License 2.0](./LICENSE)**（MPL-2.0）。用大白话说：

- **可以直接用**：个人使用、公司内部使用、拿去改，都不需要任何授权，也不需要公开你的改动。
- **改动要公开**：如果你**分发**了改过的版本（发安装包给别人、上架商店、放到网上），
  那么**被修改过的那部分文件必须继续以 MPL 开源**。
- **新增的独立文件可以闭源**：你可以把本项目与闭源代码组合在一起发布，只要不修改原来的文件。
- **必须保留声明**：不能删除原作者署名与许可证文本。

这不是法律意见；如需严格判断请咨询律师。第三方组件的许可证见
[docs/THIRD-PARTY.md](./docs/THIRD-PARTY.md)。

## 关于

- 作者 · xhowu
- 项目地址 · https://github.com/xhowu/LocalScan
- AI · MIMO & DeepSeek & GLM
