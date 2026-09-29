/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/**
 * 关于页 → 手册 的跨页跳转握手。
 * sessionStorage 而非模块变量：手册页 key 重挂 / 应用重建后依然可靠，
 * 且消费即清除，不会影响用户之后手动进入手册的默认位置。
 */
const KEY = 'localscan.manualJump';

export function requestManualJump(secId: string) {
  try {
    sessionStorage.setItem(KEY, secId);
  } catch {
    /* 存储不可用时静默：跳转退化为仅进入手册页 */
  }
}

export function consumeManualJump(): string | null {
  try {
    const id = sessionStorage.getItem(KEY);
    if (id) sessionStorage.removeItem(KEY);
    return id;
  } catch {
    return null;
  }
}
