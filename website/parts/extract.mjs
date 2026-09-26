import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 位置无关：parts/ → website/ → 仓库根（仓库克隆到任何路径都能跑）
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'website/parts');
fs.mkdirSync(OUT, { recursive: true });

// 1) MANUAL_HTML：把 TS 行原样写进 .mjs（转义语义相同），import 求值后存文件
{
  const ts = fs.readFileSync(path.join(ROOT, 'app/src/lib/manual-html.ts'), 'utf8');
  const m = ts.match(/export const MANUAL_HTML = ("(?:[^"\\]|\\.)*");/s);
  if (!m) throw new Error('MANUAL_HTML literal not found');
  fs.writeFileSync(path.join(OUT, '_manual_tmp.mjs'), 'export default ' + m[1]);
  const { default: html } = await import('file:///' + path.join(OUT, '_manual_tmp.mjs').replace(/\\/g, '/'));
  fs.writeFileSync(path.join(OUT, 'manual.html'), html);
  fs.unlinkSync(path.join(OUT, '_manual_tmp.mjs'));
  console.log('manual.html bytes:', html.length);
}

// 2) LOG：ChangelogPage 的数组字面量是合法 JS，剥掉 TS 类型标注后求值
{
  const ts = fs.readFileSync(path.join(ROOT, 'app/src/pages/ChangelogPage.tsx'), 'utf8');
  const start = ts.indexOf('= [', ts.indexOf('const LOG'));
  const end = ts.indexOf('\n]', start);
  const lit = ts.slice(start + 2, end + 2);
  const LOG = new Function('return ' + lit)();
  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(LOG));
  console.log('log versions:', LOG.length);
}

// 3) 图标 base64（xhdpi 96px）
{
  const png = fs.readFileSync(path.join(ROOT, 'app/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png'));
  fs.writeFileSync(path.join(OUT, 'logo.b64'), 'data:image/png;base64,' + png.toString('base64'));
  console.log('logo b64 bytes:', png.length);
}

// 4) design.html 的 <main> 内容【历史方案：注入式】
//    当前官网改用 iframe 直接嵌入 website/design.html（100% 保真、天然样式隔离），
//    本产物与下一节的 design.css 已不被 build.mjs 使用，保留仅作回退参考。
{
  const src = fs.readFileSync(path.join(ROOT, 'website/design.html'), 'utf8');
  const a = src.indexOf('<main>');
  const b = src.lastIndexOf('</main>');
  if (a < 0 || b < 0) throw new Error('design <main> not found');
  const main = src.slice(a, b + '</main>'.length);
  fs.writeFileSync(path.join(OUT, 'design-main.html'), main);
  console.log('design-main bytes:', main.length);
}

// 5) styles.css → 全部规则加 #view-design 前缀（正则 + keyframes 占位符，避免状态机错位）
{
  let css = fs.readFileSync(path.join(ROOT, 'website/styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  // 保护 @keyframes / @font-face 块（内部帧不能加前缀）
  const stash = [];
  css = css.replace(/@(keyframes|font-face)[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, (m) => {
    stash.push(m);
    return `__KF${stash.length - 1}__{} `;
  });
  // 每个选择器加 #view-design 前缀；@media 等块头原样；:root/body/html 映射
  css = css.replace(/([^{}]+)\{/g, (m, sel) => {
    const s = sel.replace(/\s+/g, ' ').trim();
    if (!s) return m;
    if (/^__KF\d+__$/.test(s)) return s + ' {';
    if (s.startsWith('@')) return s + ' {';
    const mapped = s.split(',').map((one) => {
      const t = one.trim();
      if (/^(html|body|:root)$/.test(t)) return '#view-design';
      if (/^(html|body)\b/.test(t)) return '#view-design ' + t.replace(/^(html|body)\s*/, '');
      return '#view-design ' + t;
    }).join(', ');
    return mapped + ' {';
  });
  // 还原 keyframes
  css = css.replace(/__KF(\d+)__\{\}\s?/g, (m, i) => stash[+i]);
  css = css.replace(/\s+/g, ' ').trim();
  fs.writeFileSync(path.join(OUT, 'design.css'), css);
  console.log('design.css bytes:', css.length);
}
