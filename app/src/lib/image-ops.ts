/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/** 图片像素级操作（编辑页的「编辑旋转」用，会把结果烘焙进图片本身） */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

/**
 * 把 data URL 顺时针旋转 90/180/270 度，返回新的 data URL。
 * 旋转会改变宽高，90/270 时需要交换画布尺寸。
 */
export async function rotateDataUrl(
  dataUrl: string,
  degrees: 90 | 180 | 270 = 90,
): Promise<string> {
  const img = await loadImage(dataUrl);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return dataUrl;

  const swap = degrees % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? nh : nw;
  canvas.height = swap ? nw : nh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -nw / 2, -nh / 2);

  try {
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return dataUrl;
  }
}
