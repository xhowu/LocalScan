/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

type ScannerBridge = {
  /** 打开原生全屏扫码页；识别成功返回 code/format，用户退出返回 cancelled，异常返回 error */
  startScan(): Promise<{ code?: string; format?: string; cancelled: boolean; error?: string }>;
  stopScan(): Promise<void>;
};

const Scanner = registerPlugin<ScannerBridge>('LocalscanScanner');

/** 原生全屏扫码可用（仅 App 内） */
export function isNativeScannerUiAvailable() {
  return Capacitor.isNativePlatform();
}

/**
 * 打开原生全屏扫码（微信扫一扫同构）：相机预览、识别、UI 全在原生 Activity，
 * WebView 不参与 —— 旧方案「透明 WebView 透出相机」在部分机型上状态栏区域
 * 反复重绘（闪状态栏/闪 logo），原生 Activity 里没有这个问题。
 */
export async function nativeScanOnce(): Promise<{
  code?: string;
  format?: string;
  cancelled: boolean;
  error?: string;
}> {
  try {
    return await Scanner.startScan();
  } catch (e) {
    return { cancelled: false, error: e instanceof Error ? e.message : String(e) };
  }
}
