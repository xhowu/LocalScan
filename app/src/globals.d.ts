/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/**
 * 全局编译期常量（由 vite.config.ts 的 define 注入）。
 * 必须是「无 import/export 的脚本文件」才能声明全局变量。
 */

/** 是否联网版构建（npm run build:online） */
declare const __ONLINE__: boolean;
