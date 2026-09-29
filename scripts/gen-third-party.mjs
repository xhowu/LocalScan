#!/usr/bin/env node
/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/**
 * 生成 docs/THIRD-PARTY.md —— 第三方组件与许可证清单。
 *
 * 前端部分**直接从 node_modules 里各包自己的 package.json 读取 license 字段**，
 * 不靠手工抄写（手工抄必错且会漂移）；原生侧组件（Google ML Kit 等）不是 npm 包，
 * 以固定内容声明。
 *
 * 用法：
 *   node scripts/gen-third-party.mjs           生成 / 更新
 *   node scripts/gen-third-party.mjs --check   只校验（CI 用，需先 npm ci）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
const OUT = path.join(ROOT, 'docs/THIRD-PARTY.md');
const CHECK = process.argv.includes('--check');

const pkg = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));

/** 读某个包自己声明的许可证 */
function licenseOf(name) {
  const p = path.join(APP, 'node_modules', name, 'package.json');
  if (!fs.existsSync(p)) return { license: '（未安装，无法读取）', version: '-' };
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  let lic = m.license;
  if (!lic && Array.isArray(m.licenses)) lic = m.licenses.map((l) => l.type).join(' / ');
  if (lic && typeof lic === 'object') lic = lic.type;
  return { license: lic || '（该包未声明）', version: m.version || '-' };
}

function table(deps) {
  const rows = Object.keys(deps)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const { license, version } = licenseOf(name);
      const short = version === '-' ? '-' : version.replace(/^[\^~]/, '');
      return `| \`${name}\` | ${short} | ${license} |`;
    });
  return ['| 组件 | 实际安装版本 | 许可证 |', '|---|---|---|', ...rows].join('\n');
}

const NATIVE = `这些组件不会出现在 \`app/package.json\` 里，但在构建 APK 时会被打进安装包，
其许可证以各自构件内的声明为准：

| 组件 | 用途 | 许可证 / 条款 |
|---|---|---|
| Google ML Kit（经由 \`@capacitor-mlkit/*\` 插件调用） | 条码识别、文字识别（中文模型） | **Google 专有 SDK**，受 Google APIs 服务条款约束，**不是开源软件** |
| AndroidX、Google Play Services 相关库 | Android 平台基础能力 | Apache-2.0 |
| Capacitor Android 运行时 | WebView 与原生桥接 | MIT |
| Gradle Wrapper | 构建工具 | Apache-2.0 |

> 关于 ML Kit 的取舍已在 \`README.md\` 与手册中说明：它是本项目中唯一非开源的运行时依赖。
> 若你打算把本项目用于对许可证洁净度要求极高的场景，需要自行评估或替换识别方案。
`;

function render() {
  return `# 第三方组件与许可证

本文件列出本项目使用的主要第三方组件及其许可证。

- 前端部分**自动读取 \`app/node_modules\` 中各包自身的 \`license\` 字段**，由
  \`node scripts/gen-third-party.mjs\` 生成，**请勿手工编辑**。
- 本清单只覆盖**直接依赖**。传递依赖各自有其许可证声明，可在对应安装包的
  \`LICENSE\` 文件中查看。
- 本项目自身采用 **MPL-2.0**（见仓库根 \`LICENSE\`）。

## 运行依赖（会被打进 APK / 网页产物）

${table(pkg.dependencies)}

> 注意：\`@capacitor-mlkit/*\` 两个包**自身**是 Apache-2.0，但它们调用的是
> **Google ML Kit 专有 SDK**，后者不在 npm 清单里 —— 见下方「原生侧组件」。

## 开发依赖（仅构建期使用，不进入产物）

${table(pkg.devDependencies)}

## 原生侧组件
${NATIVE}
## 已知依赖告警（均已评估，结论为接受）

这些告警会被 GitHub 的 Dependabot 持续列出，属于**已知情况**，不是遗漏：

| 组件 | 告警 | 为什么本项目不受影响 | 结论 |
|---|---|---|---|
| \`xlsx\` 0.18.5 | ReDoS、原型污染（高危） | 本项目**只用它写出**表格（\`XLSX.write\`），不解析任何外部文件，不触及受影响路径。官方修复版改为在其自有源分发，未发布到 npm。 | 接受现状。若将来要**读取**外部 xlsx，必须先换成官方新版 |
| \`uuid\` 7.0.3 | v3/v5/v6 传入 buf 时缺少边界检查（中危） | 由 \`@capacitor/cli\` → \`xcode\` 引入，属于**构建期**工具链；本项目只做 Android，\`xcode\` 永不执行，且该包不进 APK。 | 接受现状，路径不可达 |

> 强制升 \`uuid\` 会与 \`xcode\` 声明的 \`^7.0.3\` 冲突，而收益为零 —— 因此不动它。
> 两个告警都不会进入用户安装的 APK。
`;
}

const next = render();
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

if (CHECK) {
  if (prev !== next) {
    console.error('::error::docs/THIRD-PARTY.md 与当前依赖不一致');
    console.error('请执行：node scripts/gen-third-party.mjs');
    process.exit(1);
  }
  console.log('docs/THIRD-PARTY.md 已同步');
} else {
  fs.writeFileSync(OUT, next);
  console.log(`docs/THIRD-PARTY.md 已生成：${next.length} 字符`);
}
