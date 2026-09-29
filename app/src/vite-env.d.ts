/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/// <reference types="vite/client" />
/// <reference lib="dom" />

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}

export {};
