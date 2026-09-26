/**
 * 把指定版本的 Web 产物同步进 Android 工程。
 *
 * 用法：node scripts/cap-sync.mjs [offline|online]
 * 离线版 → dist；联网版 → dist-online（通过 CAP_WEB_DIR 注入 capacitor.config.ts）
 *
 * 直接调用本地 @capacitor/cli，避免依赖 npx / shell 包装器。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

const result = spawnSync(process.execPath, [cli, 'sync', 'android'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, CAP_WEB_DIR: webDir },
});

process.exit(result.status ?? 1);
