import fs from 'node:fs';
import path from 'node:path';

const DIR = 'C:/Users/Admin/WorkBuddy/LocalScan/website';
const tpl = fs.readFileSync(path.join(DIR, 'index.template.html'), 'utf8');
const logo = fs.readFileSync(path.join(DIR, 'parts/logo.b64'), 'utf8').trim();
const manual = fs.readFileSync(path.join(DIR, 'parts/manual.html'), 'utf8');
const log = fs.readFileSync(path.join(DIR, 'parts/log.json'), 'utf8').trim();

const manualSafe = manual.replace(/<\/script>/gi, '<\\/script>');

// 必须用函数式替换：字符串替换串里的 $$ / $& / $` / $' 会被 String.replace 特殊解释，
// 会把注入内容里的 `$$` 吞成 `$`（曾导致目录高亮逻辑 `$$(sel)` 变成 `$(sel)` 而全部失效）
const put = (str, token, value) => str.replace(token, () => value);

let out = tpl;
out = out.replaceAll('__PART_LOGO__', () => logo);
out = put(out, '__PART_MANUAL__', manualSafe);
out = put(out, '__PART_LOG__', log);

fs.writeFileSync(path.join(DIR, 'index.html'), out);
console.log('index.html written:', out.length, 'chars');
console.log('spy selectors intact:', (out.match(/const secs = \$\$\(secSel\)/g) || []).length === 1 &&
  (out.match(/\$\$\(sel\)\.forEach/g) || []).length === 1 ? 'OK' : 'BROKEN');
