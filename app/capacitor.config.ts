/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.localscan.app',
  appName: '码上记',
  // 离线版用 dist；联网版构建时由 scripts/cap-sync.mjs 注入 CAP_WEB_DIR=dist-online
  webDir: process.env.CAP_WEB_DIR || 'dist',
  // Matches light-theme app chrome; App.tsx overrides for dark mode at runtime
  backgroundColor: '#fafafa',
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    /**
     * 系统栏 / 安全区处理。
     * - insetsHandling: 'css' —— 老 WebView 由原生给 WebView 加 padding（此时 env() 为 0），
     *   新 WebView(>=140) 走 edge-to-edge 并把真实值写进 env(safe-area-inset-*)。
     *   CSS 统一写 env(..., 0px) 即可同时兼容两类设备。
     * - initialViewportFitValueHint: 'cover' —— 预声明 viewport-fit，避免启动时
     *   检测 meta 造成的布局跳动（顶部忽闪）。
     */
    SystemBars: {
      insetsHandling: 'css',
      style: 'DEFAULT',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
