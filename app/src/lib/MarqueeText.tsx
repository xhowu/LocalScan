/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** 自动滚动速度（px/秒）。恒定速度，不因文本长短变化。 */
const SPEED = 30;
/** 手指松开后暂停多久再恢复自动滚动 */
const HOLD_MS = 1800;
/** 滚到两端后的停顿 */
const END_PAUSE_MS = 900;

/**
 * 名称过长时的显示方案：溢出时自动往返滚动，可手动横向拖动。
 *
 * **自动滚动由 JS 驱动 scrollLeft，而不是 CSS transform 动画**，原因有两个：
 * 1) CSS 动画的缓动（ease-in-out）会让中间快、两端慢；靠 clamp 时长也做不到恒速；
 * 2) transform 与 scrollLeft 是两套坐标 —— 自动滚到最右后，transform 把内容推到了
 *    末端，而 scrollLeft 仍是 0，手动就再也向左拖不回去了。
 * 共用 scrollLeft 一个坐标轴后，手动与自动天然衔接，速率也精确恒定。
 */
export function MarqueeText({
  text,
  className,
  speed = SPEED,
}: {
  text: string;
  className?: string;
  /** 自动滚动速度，px/秒 */
  speed?: number;
}) {
  const boxRef = useRef<HTMLSpanElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const touching = useRef(false);
  const holdUntil = useRef(0);
  const pauseUntil = useRef(0);
  const dir = useRef(1);
  /** 自己写进去的 scrollLeft，用来把手动滚动和程序滚动区分开 */
  const lastWritten = useRef(-1);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const measure = () => setOverflowing(inner.scrollWidth - box.clientWidth > 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [text]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || !overflowing) return;
    // 系统开了「减弱动态效果」就不自动滚动，仍可手动拖
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let prev = performance.now();
    // 出现时先停一下再动，避免所有卡片一起开动
    pauseUntil.current = performance.now() + END_PAUSE_MS;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(80, now - prev);
      prev = now;
      // body dataset.banding 标记（历史上由已移除的回弹逻辑写入，现恒为空；
      // 检查保留，兼容 lib/rubber-band.ts 备用实现恢复启用时让路，避免逐帧
      // scrollLeft 写入引发的 layout/paint 卡顿）
      if (document.body.dataset.banding) return;
      if (touching.current || now < holdUntil.current || now < pauseUntil.current) return;

      const max = box.scrollWidth - box.clientWidth;
      if (max <= 0) return;
      let next = box.scrollLeft + (dir.current * speed * dt) / 1000;
      if (next >= max) {
        next = max;
        dir.current = -1;
        pauseUntil.current = now + END_PAUSE_MS;
      } else if (next <= 0) {
        next = 0;
        dir.current = 1;
        pauseUntil.current = now + END_PAUSE_MS;
      }
      lastWritten.current = next;
      box.scrollLeft = next;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [overflowing, text, speed]);

  function begin() {
    touching.current = true;
  }

  function end() {
    touching.current = false;
    holdUntil.current = performance.now() + HOLD_MS;
  }

  return (
    <span
      ref={boxRef}
      className={className ? `marquee ${className}` : 'marquee'}
      data-overflow={overflowing ? 'true' : 'false'}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onTouchStart={begin}
      onTouchEnd={end}
      onScroll={() => {
        const box = boxRef.current;
        if (!box) return;
        // 自己写进去的那次 scroll 不算「手动操作」
        if (Math.abs(box.scrollLeft - lastWritten.current) < 1.5) return;
        holdUntil.current = performance.now() + HOLD_MS;
      }}
    >
      <span ref={innerRef} className="marquee-inner">
        {text}
      </span>
    </span>
  );
}
