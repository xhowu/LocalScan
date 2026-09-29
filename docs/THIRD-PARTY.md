# 第三方组件与许可证

本文件列出本项目使用的主要第三方组件及其许可证。

- 前端部分**自动读取 `app/node_modules` 中各包自身的 `license` 字段**，由
  `node scripts/gen-third-party.mjs` 生成，**请勿手工编辑**。
- 本清单只覆盖**直接依赖**。传递依赖各自有其许可证声明，可在对应安装包的
  `LICENSE` 文件中查看。
- 本项目自身采用 **MPL-2.0**（见仓库根 `LICENSE`）。

## 运行依赖（会被打进 APK / 网页产物）

| 组件 | 实际安装版本 | 许可证 |
|---|---|---|
| `@capacitor-mlkit/barcode-scanning` | 8.2.1 | Apache-2.0 |
| `@capacitor-mlkit/text-recognition` | 8.2.1 | Apache-2.0 |
| `@capacitor/android` | 8.5.2 | MIT |
| `@capacitor/app` | 8.1.1 | MIT |
| `@capacitor/camera` | 8.2.4 | MIT |
| `@capacitor/cli` | 8.5.2 | MIT |
| `@capacitor/core` | 8.5.2 | MIT |
| `@capacitor/filesystem` | 8.1.3 | MIT |
| `@capacitor/status-bar` | 8.0.3 | MIT |
| `@capawesome/capacitor-torch` | 8.0.2 | MIT |
| `@zxing/browser` | 0.2.1 | MIT |
| `@zxing/library` | 0.23.0 | Apache-2.0 |
| `date-fns` | 4.4.0 | MIT |
| `html5-qrcode` | 2.3.8 | Apache-2.0 |
| `idb` | 8.0.3 | ISC |
| `jsqr` | 1.4.0 | Apache-2.0 |
| `jszip` | 3.10.2 | (MIT OR GPL-3.0-or-later) |
| `react` | 19.3.0 | MIT |
| `react-dom` | 19.3.0 | MIT |
| `xlsx` | 0.18.5 | Apache-2.0 |

> 注意：`@capacitor-mlkit/*` 两个包**自身**是 Apache-2.0，但它们调用的是
> **Google ML Kit 专有 SDK**，后者不在 npm 清单里 —— 见下方「原生侧组件」。

## 开发依赖（仅构建期使用，不进入产物）

| 组件 | 实际安装版本 | 许可证 |
|---|---|---|
| `@types/node` | 24.13.4 | MIT |
| `@types/react` | 19.3.0 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |
| `@vitejs/plugin-react` | 6.1.1 | MIT |
| `oxlint` | 1.82.0 | MIT |
| `typescript` | 6.0.3 | Apache-2.0 |
| `vite` | 8.3.0 | MIT |

## 原生侧组件
这些组件不会出现在 `app/package.json` 里，但在构建 APK 时会被打进安装包，
其许可证以各自构件内的声明为准：

| 组件 | 用途 | 许可证 / 条款 |
|---|---|---|
| Google ML Kit（经由 `@capacitor-mlkit/*` 插件调用） | 条码识别、文字识别（中文模型） | **Google 专有 SDK**，受 Google APIs 服务条款约束，**不是开源软件** |
| AndroidX、Google Play Services 相关库 | Android 平台基础能力 | Apache-2.0 |
| Capacitor Android 运行时 | WebView 与原生桥接 | MIT |
| Gradle Wrapper | 构建工具 | Apache-2.0 |

> 关于 ML Kit 的取舍已在 `README.md` 与手册中说明：它是本项目中唯一非开源的运行时依赖。
> 若你打算把本项目用于对许可证洁净度要求极高的场景，需要自行评估或替换识别方案。

## 需要注意的一项

`xlsx`（SheetJS）在 npm 公共仓库上的版本长期停留在 0.18.5，已知存在原型污染与 ReDoS 告警，
官方修复版本改为在其自有源分发。本项目**只用它写出表格、不解析外部文件**，
因此不触及上述解析路径；依赖机器人如果对此开出告警，属于已知情况。
