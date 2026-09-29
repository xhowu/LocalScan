/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// mode=online → 联网版（含条码联网查询），产物 dist-online
// 默认 production → 离线版，产物 dist
export default defineConfig(({ mode }) => {
  const online = mode === 'online';
  return {
    plugins: [react()],
    define: {
      __ONLINE__: JSON.stringify(online),
    },
    build: {
      // Capacitor WebView (Android 7+) / modern browsers
      target: 'es2022',
      outDir: online ? 'dist-online' : 'dist',
      sourcemap: false,
    },
    server: {
      host: true,
      port: 5173,
    },
  };
});
