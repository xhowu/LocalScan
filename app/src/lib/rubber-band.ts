import { useEffect } from 'react';

const MAX_PULL = 96;
const DAMPING = 0.35;
const AXIS_LOCK_PX = 8;

/**
 * 给滚动容器加"下拉/上拉回弹"（iOS 风格橡皮筋）。
 *
 * 只在已经滚到顶/底之后继续朝外拖动时生效，并把位移按阻尼压缩后
 * 以 translate3d 施加在容器上，松手回弹归位。
 * 顺带解决 Android WebView 到顶/到底后"划不动"的僵硬感。
 */
export function useRubberBand(
  /**
   * 滚动容器元素。**必须传"元素或 null 的 state"而不是 RefObject**：
   * 用 RefObject 时，若元素在首次 effect 之后才挂载（如 App 的 boot 画面阶段），
   * 依赖数组不变、effect 永远不会重跑，监听器就永远挂不上 ——
   * 这正是"刚进 app 没有回弹、切页面过一会才有"的根因。
   */
  el: HTMLElement | null,
  enabled = true,
  /**
   * 实际被位移的元素选择器（相对滚动容器）。
   * 一定不要直接位移滚动容器本身：它会被提升为合成层，
   * 回弹时出现长条残影。位移内部的内容层则不会。
   */
  contentSelector?: string,
) {
  useEffect(() => {
    if (!el || !enabled) return;

    let active = false;
    let axis: 'none' | 'v' | 'h' = 'none';
    let startX = 0;
    let startY = 0;
    let atTop = false;
    let atBottom = false;
    let offset = 0;
    let rafId = 0;
    let pending = 0;
    /** 拉扯期间的滚动冻结值：手势里滚动只归我们管（见 onTouchMove） */
    let pinTop = 0;
    /**
     * 底部零余量：把触底时的滚动位置抬到整数，让"真实最大值"恰好是整数，
     * 与顶部（恒为 0）完全一致的整数滚动相位。
     *
     * 关键：**不能用 scrollHeight/clientHeight 算余量** —— 它们返回的是
     * 取整后的整数，分数部分根本测不出来（v1.8.3 的补偿因此从未生效）。
     * 而 scrollTop 是精确值：触底夹紧时它就等于真实的分数最大值。
     * 用户实测 50 卡：卡顿计数 mod 8 呈严格周期（余 0/2/5 卡、余 1/3/4/6/7 顺），
     * 即卡不卡由内容总高度的小数相位决定 —— 本补偿直接消除这个相位。
     */
    let basePb: number | null = null;
    let appliedPb: number | null = null;
    const zeroRemainder = () => {
      if (basePb === null) {
        basePb = parseFloat(getComputedStyle(target).paddingBottom) || 0;
      }
      // atBottom 有 1px 容差，先把滚动吸到真实最大值（scrollHeight 是取整值，
      // 但浏览器会把它夹紧到真实 max）——之后 scrollTop 才精确等于 max
      el.scrollTop = el.scrollHeight;
      const s = el.scrollTop; // 真实最大值（可带小数）
      const snapped = Math.round(s);
      const delta = snapped - s;
      if (Math.abs(delta) > 0.001) {
        // 抬高内容底边，把真实 max 从 s 修到整数 snapped，然后滚过去
        const next = (appliedPb ?? basePb) + delta;
        target.style.paddingBottom = `${next}px`;
        appliedPb = next;
        el.scrollTop = snapped;
      }
    };
    /** 松手后的回弹动画（WAAPI）。再次触摸时取消它，避免两个动画打架 */
    let settleAnim: Animation | null = null;
    let target: HTMLElement = el;

    const resolveTarget = () => {
      const found = contentSelector ? el.querySelector<HTMLElement>(contentSelector) : null;
      target = found ?? el;
    };

    const canScroll = () => el.scrollHeight - el.clientHeight > 2;

    /** 弹窗 / 抽屉 / 图片查看器有自己的手势，别和回弹抢 */
    const isExcluded = (node: EventTarget | null) => {
      const n = node as Element | null;
      if (!n || typeof n.closest !== 'function') return false;
      return !!n.closest(
        '.img-viewer, .modal-backdrop, .drawer-root, .filter-sheet, .ctx-menu, [data-no-bounce]',
      );
    };

    /*
     * 图层提升只在**真正进入拉扯**时做（lifted），并在拉扯结束/中断时立刻撤掉。
     * 千万不要在 touchstart 就写 willChange：普通滚动（不在边缘）永远不会走
     * settle 的清理分支，will-change 会永久留在内容层上 ——
     * 1) 内容层变成 fixed 子元素的包含块，长按弹窗等 fixed 浮层全部错位；
     * 2) 整页常驻合成层，滚动栅格化内存翻倍，回弹动画也会抽搐。
     */
    let lifted = false;

    const lift = () => {
      if (lifted) return;
      lifted = true;
      target.style.transition = 'none';
      target.style.willChange = 'transform';
      // 拉扯期间挂"回弹中"标记：marquee 等主线程高开销装饰据此暂停
      document.body.dataset.banding = '1';
    };
    const drop = () => {
      if (!lifted) return;
      lifted = false;
      target.style.transition = '';
      target.style.willChange = '';
      target.style.transform = '';
      delete document.body.dataset.banding;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isExcluded(e.target)) {
        active = false;
        return;
      }
      if (!canScroll()) {
        active = false;
        return;
      }
      resolveTarget();
      // 上一次回弹动画没放完就再次触摸：取消动画。此时 inline transform
      // 已经在 settle 里被预置为 0（见 settle），取消后画面停在原位，不会跳
      if (settleAnim) {
        settleAnim.cancel();
        settleAnim = null;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      axis = 'none';
      offset = 0;
      atTop = el.scrollTop <= 0;
      atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      /*
       * 触底整备（顺序不能换）：
       * 1) 零余量 —— 内容层 padding-bottom 把 max 的分数部分吸收成整数；
       * 2) scrollTop 贴齐到整数 max（≤1px，肉眼不可见）；
       * 3) 记录冻结值，拉扯期间持续维持（见 onTouchMove）。
       * 三步之后，底部与顶部在滚动层面完全一致：整数相位 + 零可动余量，
       * 浏览器在手势里没有任何可以"帮倒忙"的滚动空间。
       */
      if (atBottom) {
        // zeroRemainder 内部已用精确 scrollTop 把触底位置修到整数并滚过去
        zeroRemainder();
        atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        pinTop = el.scrollTop;
      }
      active = atTop || atBottom;
    };

    /** 位移合并到一帧里写一次，避免每个 touchmove 都改一次样式 */
    const flush = () => {
      rafId = 0;
      target.style.transform = pending ? `translate3d(0, ${pending}px, 0)` : '';
    };
    const schedule = (v: number) => {
      pending = v;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (axis === 'none') {
        if (Math.abs(dy) < AXIS_LOCK_PX && Math.abs(dx) < AXIS_LOCK_PX) return;
        axis = Math.abs(dy) >= Math.abs(dx) ? 'v' : 'h';
      }
      if (axis !== 'v') return;

      const pulling = (atTop && dy > 0) || (atBottom && dy < 0);
      if (!pulling) {
        if (offset !== 0) {
          offset = 0;
          schedule(0);
        }
        drop();
        return;
      }

      lift();
      /*
       * 拉扯期间冻结滚动：把 scrollTop 钉在触底整备时的值。
       * 现代 WebView（澎湃 OS 3）在手势滚动中由合成器掌管滚动偏移，
       * 触底残余的分数余量会让它和我们的 transform 同时动 —— 表现为
       * 触底回弹独有卡顿（鸿蒙 3 的旧 WebView 无此行为）。钉死之后，
       * 底部拉扯与顶部完全一样：唯一的运动来源是内容层 transform。
       */
      if (atBottom && el.scrollTop !== pinTop) {
        el.scrollTop = pinTop;
      }
      /*
       * 必须取整到整数 CSS 像素：底部边缘的 scrollTop 是分数
       * （scrollHeight - clientHeight 带小数），内容层带着分数基准偏移，
       * 若位移也是小数，每帧的亚像素相位都在变 → Chrome 反复重栅格化
       * 图层瓷砖 → 触底回弹独有卡顿（顶部 scrollTop=0 是整数，没这个问题）。
       * 整数位移让亚像素相位全程恒定，只付出 1px 量化的代价（不可见）。
       */
      offset = Math.round(Math.max(-MAX_PULL, Math.min(MAX_PULL, dy * DAMPING)));
      schedule(offset);
    };

    const settle = () => {
      if (!active) return;
      active = false;
      axis = 'none';
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (!offset || !lifted) {
        drop();
        return;
      }
      const from = offset;
      offset = 0;
      /*
       * 回弹用 WAAPI（element.animate）而不是 CSS transition：
       * 纯 transform 动画会被合成器接管，完全绕开主线程的样式重算 ——
       * Android WebView 上 CSS transition 回弹"一卡一卡"就是主线程被
       * 列表的滚动/渲染占着，transition 每帧都要等样式重算导致的。
       *
       * 先把 inline transform 预置为 0 再放动画：动画播放期间由动画值渲染，
       * 若动画中途被取消（再次触摸），inline 已经是 0，画面不会跳回拖动值。
       */
      target.style.transform = 'translate3d(0, 0, 0)';
      try {
        settleAnim = target.animate(
          [
            { transform: `translate3d(0, ${from}px, 0)` },
            { transform: 'translate3d(0, 0, 0)' },
          ],
          { duration: 420, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
        );
        settleAnim.onfinish = () => {
          drop();
          settleAnim = null;
        };
        settleAnim.oncancel = () => {
          settleAnim = null;
        };
      } catch {
        // 老 WebView 没有 WAAPI：退化为直接归位
        drop();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    // passive: true —— 不需要 preventDefault（到顶/到底本来就滚不动，
    // 且 overscroll-behavior-y: contain 已挡住浏览器自身的回弹），
    // 保持被动监听才不会拖慢列表滚动
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', settle, { passive: true });
    el.addEventListener('touchcancel', settle, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (settleAnim) settleAnim.cancel();
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', settle);
      el.removeEventListener('touchcancel', settle);
      drop();
      if (appliedPb !== null) {
        // 还原零余量补偿的内联 padding，避免污染后续布局
        target.style.paddingBottom = '';
        appliedPb = null;
      }
      delete document.body.dataset.banding;
    };
  }, [el, enabled, contentSelector]);
}
