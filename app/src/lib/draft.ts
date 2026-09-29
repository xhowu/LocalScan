/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import type { CustomField } from '../types';
import type { LabelFields } from './label-parse';
import type { BarcodeInfo } from '../services/barcode-lookup';

/**
 * 跨页面传递「预填草稿」。
 * 扫码 / OCR 得到的信息通过 router 传参太重，这里用一个一次性内存槽，
 * 由 EditItemPage 挂载时取走。
 */
export type ItemDraft = {
  name?: string;
  code?: string | null;
  category?: string;
  productionDate?: string | null;
  shelfLifeMonths?: number | null;
  expiryDate?: string | null;
  imageDataUrls?: string[];
  note?: string;
  /** 临时字段（非核心参数） */
  tempFields: CustomField[];
  /** 信息来源说明，用于页面顶部提示 */
  sourceLabel: string;
  /** 命中的原始文本行，便于用户核对 */
  rawLines?: string[];
};

let pending: ItemDraft | null = null;

export function setPendingDraft(draft: ItemDraft | null) {
  pending = draft;
}

export function peekPendingDraft(): ItemDraft | null {
  return pending;
}

export function takePendingDraft(): ItemDraft | null {
  const d = pending;
  pending = null;
  return d;
}

function tmp(label: string, value: string | null | undefined): CustomField[] {
  const v = (value ?? '').trim();
  if (!v) return [];
  return [
    {
      key: `tmp-${label}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      value: v,
    },
  ];
}

/** OCR 标签解析结果 → 草稿（核心字段 + 临时字段） */
export function draftFromLabel(label: LabelFields, sourceLabel = '图片文字识别'): ItemDraft {
  return {
    name: label.name ?? undefined,
    code: label.code ?? undefined,
    productionDate: label.productionDate,
    shelfLifeMonths: label.shelfLifeMonths,
    expiryDate: label.expiryDate,
    tempFields: [
      ...tmp('规格', label.spec),
      ...tmp('净含量', label.netContent),
      ...tmp('品牌', label.brand),
      ...tmp('生产企业', label.manufacturer),
      ...tmp('产地', label.origin),
      ...tmp('贮存条件', label.storage),
      ...tmp('配料', label.ingredients),
      ...tmp('产品标准号', label.standard),
    ],
    sourceLabel,
  };
}

/** 条码联网查询结果 → 草稿 */
export function draftFromBarcodeInfo(info: BarcodeInfo): ItemDraft {
  const name =
    [info.brand, info.name].filter(Boolean).join(' ').trim() ||
    info.spec ||
    info.manufacturer ||
    info.code;
  return {
    name: name || undefined,
    code: info.code,
    category: info.category ?? undefined,
    tempFields: [
      ...tmp('规格', info.spec),
      ...tmp('净含量', info.netContent),
      ...tmp('品牌', info.brand),
      ...tmp('生产企业', info.manufacturer),
      ...tmp('产地', info.origin),
    ],
    sourceLabel: info.source,
  };
}

/** 把草稿的临时字段并入已有自定义字段（按 label 去重，非空优先） */
export function mergeTempFields(base: CustomField[], extra: CustomField[]): CustomField[] {
  const out = [...base];
  for (const f of extra) {
    const idx = out.findIndex((x) => x.label === f.label);
    if (idx >= 0) {
      if (!out[idx].value.trim() && f.value.trim()) out[idx] = { ...out[idx], value: f.value };
    } else {
      out.push(f);
    }
  }
  return out;
}
