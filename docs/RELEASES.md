# 版本与资产对照表

安装包一律通过 GitHub Releases 分发，仓库内不保存 APK。
直链格式：`https://github.com/xhowu/LocalScan/releases/download/<tag>/<资产名>`

---

## v1.10.0

- tag：`v1.10.0`
- 发布：2026-09-25 ｜ versionCode 39
- 页面：https://github.com/xhowu/LocalScan/releases/tag/v1.10.0

### 离线版（`com.localscan.app`，无任何联网代码）

| 资产名 | 架构 | 字节数 | 大小 | 直链 |
|--------|------|--------|------|------|
| `LocalScan-v1.10.0.apk` | universal | 75,007,320 | 75.0 MB | `…/download/v1.10.0/LocalScan-v1.10.0.apk` |
| `LocalScan-v1.10.0-arm64.apk` | arm64-v8a | 29,524,322 | 29.5 MB | `…/download/v1.10.0/LocalScan-v1.10.0-arm64.apk` |
| `LocalScan-v1.10.0-armv7.apk` | armeabi-v7a | 23,542,734 | 23.5 MB | `…/download/v1.10.0/LocalScan-v1.10.0-armv7.apk` |
| `LocalScan-v1.10.0-x86_64.apk` | x86_64 | 31,080,806 | 31.1 MB | `…/download/v1.10.0/LocalScan-v1.10.0-x86_64.apk` |

### 联网版（`com.localscan.app.online`，含条码商品查询，默认关闭）

| 资产名 | 架构 | 字节数 | 大小 | 直链 |
|--------|------|--------|------|------|
| `LocalScan-v1.10.0-online.apk` | universal | 75,010,885 | 75.0 MB | `…/download/v1.10.0/LocalScan-v1.10.0-online.apk` |
| `LocalScan-v1.10.0-online-arm64.apk` | arm64-v8a | 29,527,887 | 29.5 MB | `…/download/v1.10.0/LocalScan-v1.10.0-online-arm64.apk` |
| `LocalScan-v1.10.0-online-armv7.apk` | armeabi-v7a | 23,546,299 | 23.5 MB | `…/download/v1.10.0/LocalScan-v1.10.0-online-armv7.apk` |
| `LocalScan-v1.10.0-online-x86_64.apk` | x86_64 | 31,084,371 | 31.1 MB | `…/download/v1.10.0/LocalScan-v1.10.0-online-x86_64.apk` |

源码快照：[`v1.10.0/`](../v1.10.0)

> **构建修正（2026-09-27）**：首版离线包因 `cap-sync` 把两个 flavor 的 web 产物写入同一目录而**误含联网版代码**（内含 `barcode-lookup` chunk）。已改为按 flavor 隔离产物并重新构建，离线 4 个资产各减小 3,553 字节（即该 chunk），联网包内容未变。

---

## v1.4.0

- tag：`v1.4.0`
- 发布：2026-09-12 ｜ versionCode 4
- 页面：https://github.com/xhowu/LocalScan/releases/tag/v1.4.0

| 资产名 | 架构 | 字节数 | 大小 | 直链 |
|--------|------|--------|------|------|
| `LocalScan-v1.4.0.apk` | universal | 31,593,043 | 31.6 MB | `…/download/v1.4.0/LocalScan-v1.4.0.apk` |

源码快照：[`v1.4.0/app/`](../v1.4.0/app) ｜ 旧官网：[`v1.4.0/site/`](../v1.4.0/site)

---

## 命名约定

- 资产名统一为 `LocalScan-v<版本>[-online][-<架构>].apk`
- `-online` 表示联网版；无后缀为离线版
- 架构后缀：`arm64`（arm64-v8a）／`armv7`（armeabi-v7a）／`x86_64`；无后缀为 universal
- 官网 `index.html` 的下载入口直接引用上表直链，改资产名必须同步改 `website/index.template.html`
