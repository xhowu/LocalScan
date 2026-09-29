# 贡献指南

感谢愿意帮忙。这个项目偏向**克制**：功能取舍优先保证「无账号、无云端、数据可带走」，
所以有些看起来很合理的需求会被拒，请先读下面的边界。

## 欢迎的贡献

- 修 bug（尤其是你实际遇到的）
- 改进已有功能的体验与文案
- 补文档、修错别字、修正与实现不符的描述
- 新增**不依赖服务端**的实用能力

## 不接受的改动

- 账号体系、云同步、团队协作、多端同步服务器
- 统计埋点、广告、社交、积分
- 任何「必须依赖服务端才能工作」的功能
- 引入**联网代码进入离线版**（见下方硬红线）

## 环境准备

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | 见 `.nvmrc`（当前 22） | 前端构建 |
| JDK | **21** | Android 构建必需 |
| Android SDK | build-tools 34/35、platforms 34/36 | `ANDROID_HOME`，或写 `app/android/local.properties` |

## 常用命令

```bash
cd app
npm ci                 # 严格按 lockfile 安装
npm run lint           # oxlint
npm run build          # 离线版 → dist（含类型检查）
npm run build:online   # 联网版 → dist-online
npm run android:apk        # 构建离线版 APK
npm run android:apk:online # 构建联网版 APK
```

官网（可选）：

```bash
node website/build.mjs         # 由 website/index.template.html 生成 website/index.html
# 改完记得把产物同步到仓库根，否则线上不会变
```

## 三条硬性要求

1. **离线包红线**：离线版承诺不含任何联网代码。构建后必须满足

   ```bash
   ls app/dist/assets | grep -c barcode-lookup   # 必须是 0
   ls app/dist-online/assets | grep -c barcode-lookup  # 必须是 1
   ```

   两个 flavor 的 web 产物必须隔离（`app/scripts/cap-sync.mjs` 负责），
   否则离线包会打进联网代码 —— 这个坑真实发生过，CI 现在会拦。

2. **版本号三处同步**：`app/src/lib/app-const.ts`、`app/android/app/build.gradle`、`app/package.json`。
   CI 会校验，不一致直接报错。

3. **文档同步**：功能有变化时，同时更新
   - `app/src/pages/ChangelogPage.tsx`（App 内版本日志）
   - `docs/码上记-App使用手册.md` 与 `app/src/lib/manual-html.ts`（App 内置手册）

## 千万不要做

- **不要执行 `cap add android`**。`app/android/` 里有多个手写插件（WebView 透明、扫码、相机浮层）、
  两个 flavor 的专属资源以及图标启动图，重新 add 会覆盖这些内容。
- 不要把 APK 提交进仓库 —— 安装包一律通过 GitHub Releases 分发。
- 不要为了让 CI 变绿而删掉 `.github/workflows/ci.yml` 里的断言。

## 提交信息

沿用现有风格，前缀 + 中文描述：

```
feat(app): 新增只读网页快照的搜索框
fix(build): 修复离线版 APK 误含联网代码
docs: 更正手册中关于局域网面板的描述
chore(repo): 补 MPL-2.0 许可证与工程配置
```

## 流程

1. Fork 或新建分支（不要直接改 `main`）。
2. 改完按 `pull_request_template.md` 自查。
3. 提 PR，说明动机、影响范围、以及验证方式。
4. CI 通过后由仓库所有者 review。

## 许可

本项目采用 **MPL-2.0**。提交贡献即表示你同意你的贡献以同一许可证发布。
按 MPL-2.0 的规则，**被修改过的源文件必须继续保持 MPL 开源**，未改动的文件与新增文件可另行选择许可证。

**新增源码文件请带上这段声明头**（`app/src`、`app/scripts`、`scripts/`、`website/` 下已有的文件都已添加）：

```ts
/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
```

（`.css` / `.html` / `.md` 等非代码文件不需要单独加，仓库根的 `LICENSE` 已覆盖整个项目。）
