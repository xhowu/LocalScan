import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type ViewerOrigin = { x: number; y: number; w: number; h: number };

type Transform = { scale: number; x: number; y: number };

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };
const MAX_SCALE = 4;
const SWIPE_RATIO = 0.22;
const DISMISS_PX = 96;

/**
 * 全屏图片查看器（iOS 风格）。
 * - 从缩略图位置 FLIP 放大入场 / 反向缩回退场
 * - 左右滑动切换、双击放大、双指捏合缩放、放大后拖动平移
 * - 未放大时下拉关闭
 * - 支持 90° 步进旋转（旋转后按旋转后的宽高比重新适配屏幕）
 */
export function ImageViewer({
  images,
  startIndex = 0,
  origin,
  onClose,
  onRotateRequest,
}: {
  images: string[];
  startIndex?: number;
  origin?: ViewerOrigin | null;
  onClose: () => void;
  /**
   * 传入即进入「编辑旋转」模式：点旋转交给调用方把结果烘焙进图片，
   * 查看器自身不再累积角度（详情页不传，就是纯预览旋转，退出即还原）。
   */
  onRotateRequest?: (index: number) => void;
}) {
  const [index, setIndex] = useState(
    Math.min(Math.max(startIndex, 0), Math.max(images.length - 1, 0)),
  );
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const naturals = useRef(new Map<number, { w: number; h: number }>());
  const [, forceNatural] = useState(0);
  const [view, setView] = useState<Transform>(IDENTITY);
  const [swipe, setSwipe] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);
  const entered = useRef(false);

  const natural = naturals.current.get(index) ?? null;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    mode: 'none' | 'swipe' | 'pan' | 'pinch';
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    baseScale: number;
    pinchDist: number;
    moved: boolean;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
    baseScale: 1,
    pinchDist: 0,
    moved: false,
  });
  const lastTap = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 });

  /* ---------- 视口尺寸 ---------- */
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  /* ---------- 锁定背景滚动 ---------- */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ---------- 按旋转后的宽高比适配屏幕 ---------- */
  const displayed = (() => {
    if (!natural) return null;
    const swapped = rotation % 180 !== 0;
    const rw = swapped ? natural.h : natural.w;
    const rh = swapped ? natural.w : natural.h;
    const r = Math.min(size.w / rw, size.h / rh);
    const w = natural.w * r;
    const h = natural.h * r;
    return { x: (size.w - (swapped ? h : w)) / 2, y: (size.h - (swapped ? w : h)) / 2, w, h };
  })();

  const entryTransform = (): Transform => {
    if (!origin || !displayed) return IDENTITY;
    const swapped = rotation % 180 !== 0;
    const visW = swapped ? displayed.h : displayed.w;
    const visH = swapped ? displayed.w : displayed.h;
    return {
      scale: Math.max(0.05, origin.w / visW),
      x: origin.x + origin.w / 2 - (displayed.x + visW / 2),
      y: origin.y + origin.h / 2 - (displayed.y + visH / 2),
    };
  };
  const entryRef = useRef(entryTransform);
  entryRef.current = entryTransform;

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setSwipe(0);
    setView(origin ? entryRef.current() : IDENTITY);
    window.setTimeout(onClose, origin ? 300 : 180);
  }, [closing, onClose, origin]);

  /* ---------- 键盘：←/→ 切换，R 旋转，Esc 关闭 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(images.length - 1, i + 1));
      else if (e.key.toLowerCase() === 'r') setRotation((r) => (r + 90) % 360);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, close]);

  /* ---------- FLIP 入场（只跑一次，避免旋转后重新进场） ---------- */
  useLayoutEffect(() => {
    if (!displayed || closing || entered.current) return;
    entered.current = true;
    if (origin) {
      setView(entryRef.current());
      const id = requestAnimationFrame(() => {
        setVisible(true);
        setView(IDENTITY);
      });
      return () => cancelAnimationFrame(id);
    }
    setVisible(true);
    setView(IDENTITY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayed?.w, displayed?.h]);

  /* ---------- 手势 ---------- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (closing) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current = {
        ...gesture.current,
        mode: 'pinch',
        pinchDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        baseScale: view.scale,
        baseX: view.x,
        baseY: view.y,
        moved: true,
      };
      return;
    }

    gesture.current = {
      mode: view.scale > 1.01 ? 'pan' : 'swipe',
      startX: e.clientX,
      startY: e.clientY,
      baseX: view.x,
      baseY: view.y,
      baseScale: view.scale,
      pinchDist: 0,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (closing || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;

    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const next = Math.min(MAX_SCALE, Math.max(1, g.baseScale * (dist / g.pinchDist)));
      setView({ scale: next, x: next <= 1 ? 0 : g.baseX, y: next <= 1 ? 0 : g.baseY });
      return;
    }

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (Math.hypot(dx, dy) > 6) g.moved = true;

    if (g.mode === 'pan') {
      setView({ scale: g.baseScale, x: g.baseX + dx, y: g.baseY + dy });
      return;
    }
    if (g.mode === 'swipe') {
      setSwipe(dx);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    if (g.mode === 'pinch') {
      if (pointers.current.size < 2) {
        gesture.current = { ...g, mode: 'none' };
        setView((v) => (v.scale <= 1.02 ? IDENTITY : v));
      }
      return;
    }

    if (g.mode === 'swipe') {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;

      if (!g.moved) {
        // 单击 / 双击
        const now = Date.now();
        const isDouble =
          now - lastTap.current.t < 300 &&
          Math.abs(e.clientX - lastTap.current.x) < 28 &&
          Math.abs(e.clientY - lastTap.current.y) < 28;
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        if (isDouble) {
          // 先复位手势状态，让这次缩放走弹簧过渡
          gesture.current = { ...g, mode: 'none' };
          setView((v) => (v.scale > 1.01 ? IDENTITY : { scale: 2.6, x: 0, y: 0 }));
        }
        return;
      }

      if (dy > DISMISS_PX && Math.abs(dy) > Math.abs(dx)) {
        close();
        return;
      }

      gesture.current = { ...g, mode: 'none' };
      if (Math.abs(dx) > size.w * SWIPE_RATIO) {
        const dir = dx < 0 ? 1 : -1;
        setIndex(Math.min(images.length - 1, Math.max(0, index + dir)));
        setView(IDENTITY);
        setRotation(0);
      }
      setSwipe(0);
    }
  };

  const trackX = -index * size.w + swipe;

  function rotate90() {
    setRotation((r) => (r + 90) % 360);
    setView(IDENTITY);
  }

  return (
    <div
      className="img-viewer"
      data-visible={visible ? 'true' : 'false'}
      data-closing={closing ? 'true' : 'false'}
      role="dialog"
      aria-modal="true"
      aria-label="图片查看"
    >
      <div
        className="img-viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="img-viewer-track" style={{ transform: `translate3d(${trackX}px, 0, 0)` }}>
          {images.map((src, i) => {
            const active = i === index;
            const parts: string[] = [];
            if (active) {
              if (view.x || view.y) parts.push(`translate3d(${view.x}px, ${view.y}px, 0)`);
              if (view.scale !== 1) parts.push(`scale(${view.scale})`);
              if (rotation) parts.push(`rotate(${rotation}deg)`);
            }
            const style = active
              ? {
                  width: displayed ? `${displayed.w}px` : undefined,
                  height: displayed ? `${displayed.h}px` : undefined,
                  transform: parts.length ? parts.join(' ') : undefined,
                  transition:
                    gesture.current.mode === 'none' ? 'transform 0.32s var(--ease-spring)' : 'none',
                }
              : undefined;
            return (
              <div className="img-viewer-slide" key={`${i}-${src.slice(0, 24)}`}>
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  style={style}
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    naturals.current.set(i, {
                      w: el.naturalWidth || size.w,
                      h: el.naturalHeight || size.h,
                    });
                    if (i === index) forceNatural((n) => n + 1);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className="img-viewer-rotate"
        onClick={() => {
          if (onRotateRequest) onRotateRequest(index);
          else rotate90();
        }}
        aria-label={onRotateRequest ? '旋转并保存到图片' : '旋转图片（仅预览）'}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {!onRotateRequest && rotation !== 0 && (
          <span className="img-viewer-rotate-deg mono">{rotation}°</span>
        )}
      </button>

      <button type="button" className="img-viewer-close" onClick={close} aria-label="关闭">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {images.length > 1 && (
        <p className="img-viewer-count">
          {index + 1} / {images.length}
        </p>
      )}
    </div>
  );
}
