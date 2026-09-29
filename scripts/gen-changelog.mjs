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
 * 由 App 内的版本日志生成仓库根 CHANGELOG.md。
 *
 * 为什么不让 CHANGELOG.md 手工维护：版本日志已经写在 App 里
 * （app/src/pages/ChangelogPage.tsx），再手抄一份到 CHANGELOG.md 必然漂移。
 * 这里以源码为唯一真源，自动生成；CI 会校验两者是否一致。
 *
 * 用法：
 *   node scripts/gen-changelog.mjs           生成 / 更新 CHANGELOG.md
 *   node scripts/gen-changelog.mjs --check   只校验是否已同步（CI 用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'app/src/pages/ChangelogPage.tsx');
const OUT = path.join(ROOT, 'CHANGELOG.md');
const CHECK = process.argv.includes('--check');

/** 从源码里切出 LOG 数组字面量（按括号深度扫描，正确跳过字符串内的括号） */
function extractLogLiteral(src) {
  const anchor = src.indexOf('const LOG');
  if (anchor < 0) throw new Error('在 ChangelogPage.tsx 里找不到 LOG 定义');
  const from = src.indexOf('[', src.indexOf('=', anchor));
  if (from < 0) throw new Error('找不到 LOG 数组起始位置');
  let depth = 0;
  let quote = null;
  for (let i = from; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  throw new Error('LOG 数组没有正常闭合');
}

/** 把 TS 对象字面量当 JS 求值（只含字符串与数组，安全） */
function evalLiteral(literal) {
  // eslint-disable-next-line no-new-func
  return new Function(`return ${literal}`)();
}

function render(entries) {
  const head = `# 变更日志

本文件记录本项目的版本变更。

> **不要手工编辑本文件**。它由 \`app/src/pages/ChangelogPage.tsx\`（App 内「版本日志」页面）
> 自动生成，执行 \`node scripts/gen-changelog.mjs\` 可重新生成，CI 会校验是否同步。

版本号含义：**MAJOR** 架构 / 数据模型变化 ｜ **MINOR** 新增用户可见功能 ｜ **PATCH** 修复与体验调整。
中间反复尝试又撤回的方案不记录，只收录最终落地的内容。

- 仓库：<https://github.com/xhowu/LocalScan>
- 安装包与完整发布说明：<https://github.com/xhowu/LocalScan/releases>
- 官网：<https://xhowu.github.io/LocalScan/>

---

`;
  const body = entries
    .map((e) => {
      const items = e.items.map((i) => `- ${i}`).join('\n');
      return `## [${e.version}] - ${e.date}\n\n${e.kind}\n\n${items}\n`;
    })
    .join('\n');
  return `${head}${body}`;
}

const literal = extractLogLiteral(fs.readFileSync(SRC, 'utf8'));
const log = evalLiteral(literal);
if (!Array.isArray(log) || !log.length) throw new Error('LOG 解析结果为空');
for (const e of log) {
  if (!e.version || !e.date || !e.kind || !Array.isArray(e.items)) {
    throw new Error(`版本条目字段不完整：${JSON.stringify(e).slice(0, 120)}`);
  }
}

const next = render(log);
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

if (CHECK) {
  if (prev !== next) {
    console.error('::error::CHANGELOG.md 与 app/src/pages/ChangelogPage.tsx 不一致');
    console.error('请执行：node scripts/gen-changelog.mjs');
    process.exit(1);
  }
  console.log(`CHANGELOG.md 已同步（${log.length} 个版本：${log[0].version} … ${log[log.length - 1].version}）`);
} else {
  fs.writeFileSync(OUT, next);
  console.log(`CHANGELOG.md 已生成：${log.length} 个版本，${next.length} 字符`);
}
