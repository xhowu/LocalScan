/**
 * 把指定版本的 Web 产物同步进 Android 工程。
 *
 * 用法：node scripts/cap-sync.mjs [offline|online]
 * 离线版 → dist；联网版 → dist-online（通过 CAP_WEB_DIR 注入 capacitor.config.ts）
 *
 * ★ 关键：Capacitor 固定把 web 产物写进 android/app/src/main/assets/public，
 *   两个 flavor 共用这一份就会互相覆盖（后同步的赢）——曾导致「离线版 APK 实际是联网版」。
 *   因此同步完成后立刻把它移到 flavor 专属目录 src/<flavor>/assets/public，
 *   由 Gradle 的 mergeAssets 按 flavor 分别合并，两个 flavor 从此内容独立、可一次构建。
 *
 * 直接调用本地 @capacitor/cli，避免依赖 npx / shell 包装器。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] === 'online' ? 'online' : 'offline';
const webDir = mode === 'online' ? 'dist-online' : 'dist';

if (!existsSync(join(projectRoot, webDir))) {
  console.error(`[cap-sync] 找不到 ${webDir}，请先执行 npm run ${mode === 'online' ? 'build:online' : 'build'}`);
  process.exit(1);
}

const cli = join(projectRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
if (!existsSync(cli)) {
  console.error('[cap-sync] 找不到 @capacitor/cli，请先执行 npm install');
  process.exit(1);
}

console.log(`[cap-sync] mode=${mode} webDir=${webDir}`);

// —— 同步前先清空 Capacitor 的固定目标目录 ——
// cap sync 只做「复制」，不会删除目标里多余的文件；若上一版残留了本 flavor 不该有的
// chunk（典型：联网版独有的 barcode-lookup-*.js），会被原样带进本期产物。
const appDir = join(projectRoot, 'android', 'app');
const mainPublic = join(appDir, 'src', 'main', 'assets', 'public');
rmSync(mainPublic, { recursive: true, force: true });

const result = spawnSync(process.execPath, [cli, 'sync', 'android'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, CAP_WEB_DIR: webDir },
});

if (result.status !== 0) process.exit(result.status ?? 1);

// —— 把 web 产物隔离到 flavor 专属目录（见文件头说明）——
const flavorPublic = join(appDir, 'src', mode, 'assets', 'public');

if (!existsSync(mainPublic)) {
  console.error(`[cap-sync] 未找到 ${mainPublic} —— cap sync 未生成 web 产物，构建会得到空壳 App`);
  process.exit(1);
}

rmSync(flavorPublic, { recursive: true, force: true }); // 清掉上次残留，避免新旧文件混杂
mkdirSync(dirname(flavorPublic), { recursive: true });
renameSync(mainPublic, flavorPublic);
console.log(`[cap-sync] web 产物已隔离到 src/${mode}/assets/public`);

// 双保险：确认 main 下不再残留 public，否则会与 flavor 的产物合并冲突
if (existsSync(mainPublic)) {
  console.error(`[cap-sync] ${mainPublic} 仍存在，请手动删除后重试`);
  process.exit(1);
}
