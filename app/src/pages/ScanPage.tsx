/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { getItem, listByCode, normalizeParentId } from '../db';
import { navigate } from '../router';
import {
  decodeFromFile,
  ensureNativeCameraPermission,
  scanFromGallery,
} from '../lib/native-scan';
import {
  isCameraOverlayAvailable,
  moveCameraOverlay,
  onBarcodeHit,
  onCameraError,
  startCameraOverlay,
  stopCameraOverlay,
} from '../lib/camera-overlay';
import { haptic, showToast } from '../lib/ui';
import { batchLabel, type InventoryItem } from '../types';
import { setPendingDraft, draftFromBarcodeInfo, draftFromLabel } from '../lib/draft';
import { parseLabelText } from '../lib/label-parse';
import { isOcrSupported, ocrFromSource } from '../services/ocr';
import type { BarcodeInfo } from '../services/barcode-lookup';

type Mode = 'scan' | 'ocr';

type ResultState = {
  code: string;
  format: string;
  existing: InventoryItem[];
  source: '相机' | '相册' | '手动';
} | null;

export function ScanPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>('scan');
  /** 相机浮层是否已放置（进入页面自动放置，命中/被遮挡时撤下） */
  const [overlayOn, setOverlayOn] = useState(false);
  const [hit, setHit] = useState<ResultState>(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [lookup, setLookup] = useState<{ loading: boolean; info: BarcodeInfo | null; tried: boolean }>({
    loading: false,
    info: null,
    tried: false,
  });

  /** 同条码里作为父项的那一条（没有父项就取第一条） */
  const rootItem = useMemo(() => {
    if (!hit) return null;
    const root = hit.existing.find((i) => !i.parentId);
    if (root) return root;
    // 只命中子项时上溯到它的父项 —— 子项不能再加子项
    const first = hit.existing[0];
    if (!first) return null;
    const rid = normalizeParentId(first.id);
    return rid ? (hit.existing.find((i) => i.id === rid) ?? getItem(rid) ?? null) : null;
  }, [hit]);

  function showResult(found: { code: string; format: string }, source: '相机' | '相册' | '手动') {
    haptic();
    const existing = listByCode(found.code);
    setHit({ code: found.code, format: found.format, existing, source });
    setLookup({ loading: false, info: null, tried: false });
  }

  /* 联网版：命中条码后查询商品信息（离线版构建时这段会被编译期移除） */
  useEffect(() => {
    if (!hit || !__ONLINE__) return;
    let cancelled = false;
    setLookup({ loading: true, info: null, tried: false });
    void (async () => {
      try {
        const mod = await import('../services/barcode-lookup');
        const info = await mod.lookupBarcode(hit.code, mod.loadLookupConfig());
        if (cancelled) return;
        setLookup({ loading: false, info, tried: true });
      } catch {
        if (!cancelled) setLookup({ loading: false, info: null, tried: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hit]);

  /** 量取取景框在视口中的位置（扫码页不滚动，视口坐标即页面坐标） */
  function measureRect() {
    const el = viewfinderRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /**
   * 放置相机浮层：在取景框位置放一个原生 PreviewView（浮于 WebView 之上），
   * WebView 保持不透明 —— 旧方案「透明 WebView 透出相机」在部分机型上状态栏
   * 区域反复重绘（闪状态栏/闪 logo），不透明时该机制不存在。
   */
  /** 全屏遮挡（仓库抽屉 / 结果弹窗）：存在时相机必须让位 */
  function overlayBlocked() {
    return !!document.querySelector('.drawer-root, .modal-backdrop');
  }

  const startingRef = useRef(false);
  async function startCamera() {
    if (!isCameraOverlayAvailable()) return;
    // 统一守卫：任何路径（进页自动启动 / 遮挡恢复 / 滚动停稳恢复）都从这里过 ——
    // 抽屉或弹窗开着时绝不拉起相机（原生浮层物理上盖住整个 WebView，时机是唯一防线）
    if (overlayBlocked()) return;
    if (startingRef.current) return; // subtree 观察下回调高频，防并发重入
    startingRef.current = true;
    try {
      await startCameraInner();
    } finally {
      startingRef.current = false;
    }
  }

  async function startCameraInner() {
    const rect = measureRect();
    if (!rect) return;
    const ok = await ensureNativeCameraPermission();
    if (!ok) {
      showToast('相机权限被拒绝，请到系统设置开启', 'error');
      return;
    }
    try {
      await startCameraOverlay(rect);
      setOverlayOn(true);
      // 兜底校正：扫码页已禁用进场动效，首测量应已准确，此处只防视口异常
      window.setTimeout(() => {
        const rect2 = measureRect();
        if (rect2) void moveCameraOverlay(rect2);
      }, 340);
    } catch (e) {
      showToast(`相机启动失败：${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }

  async function stopCamera() {
    setOverlayOn(false);
    try {
      await stopCameraOverlay();
    } catch {
      /* ignore */
    }
  }

  /** 识别命中：撤下相机 → 弹结果（同码 5 秒内只认一次，防止查询结果被二次命中冲掉） */
  function onHit(code: string, format: string) {
    const last = lastHitRef.current;
    if (last && last.code === code && Date.now() - last.at < 5000) return;
    lastHitRef.current = { code, at: Date.now() };
    void stopCamera();
    showResult({ code, format }, '相机');
  }

  /** 异步回调（scroll / MutationObserver）里读最新状态的通道：effect 闭包会过期 */
  const stateRef = useRef({ mode, hit, overlayOn });
  stateRef.current = { mode, hit, overlayOn };
  /** 同条码命中防抖：相机停止有延迟，同码短窗内二次上报会重置查询结果 */
  const lastHitRef = useRef<{ code: string; at: number } | null>(null);
  /** 最新一次 syncCamera（effect 闭包外可安全触发，供占位框点击使用） */
  const syncCameraRef = useRef<() => void>(() => {});
  /** 手动输入框聚焦中：聚焦期间相机不允许开启 */
  const inputFocusedRef = useRef(false);
  /** 聚焦瞬间的窗口高度 / 滚动容器高度（键盘模式判别基准） */
  const kbBaseH = useRef(0);
  const kbClientH = useRef(0);

  /* 挂监听 + 相机的自动启停（进页 / 遮挡 / 滚动三路统一调度） */
  useEffect(() => {
    if (!isCameraOverlayAvailable()) return;

    let removed = false;
    const handles: Array<Promise<unknown>> = [];
    handles.push(
      onBarcodeHit(({ code, format }) => {
        // 结果弹窗已开（hit 非空）时忽略后续命中，避免把查询结果重置
        if (!removed && !stateRef.current.hit) onHit(code, format);
      }),
    );
    handles.push(
      onCameraError(({ error }) => {
          showToast(`扫码页异常：${error}`, 'error');
      }),
    );

    /*
     * 键盘滚入（双保险）：
     * - adjustResize 生效：窗口与 .main 同步缩小，聚焦后的固定时点
     *   scrollIntoView 自然滚动（350ms / 700ms 两拍覆盖动画前后）；
     * - adjustResize 被	ROM/edge-to-edge 吞掉（窗口缩小但 .main 高度没变）：
     *   自补 padding-bottom = 键盘高度制造滚动空间并滚到底 —— 与系统行为
     *   无关，任意机型保证输入框可见。
     */
    const onResize = () => {
      const rect = measureRect();
      if (rect) void moveCameraOverlay(rect);
      if (inputFocusedRef.current && kbBaseH.current > 0 && mainEl) {
        const shrink = kbBaseH.current - window.innerHeight;
        const clientShrunk = kbClientH.current - mainEl.clientHeight;
        if (shrink > 80 && clientShrunk < shrink - 40) {
          mainEl.style.paddingBottom = `${shrink}px`;
          mainEl.scrollTop = mainEl.scrollHeight;
        } else {
          mainEl.style.paddingBottom = '';
        }
      }
    };
    window.addEventListener('resize', onResize);

    /*
     * 相机状态机（严格两条件，无判定容差）：
     *   开启的唯一条件 = 扫码模式 ∧ 无结果弹窗 ∧ 无抽屉/弹窗遮挡
     *                    ∧ 页面在顶部（scrollTop === 0）∧ 无滑动进行中；
     *   其余任何状态一律关闭。
     * 所有启停收敛到唯一的 syncCamera()：scroll / touch / DOM 变化只更新
     * "滑动中"标记并触发 sync，自身不直接开关相机 —— 杜绝任何路径绕过
     * 滚动条件把相机拉起（旧 bug：MutationObserver 恢复时不看滚动位置）。
     * 滑动中 = 距最近一次 scroll / touchmove 不足 250ms；顶部下拉回弹等
     * 不产生 scroll 事件的手势由 touchmove 覆盖（原生浮层追不上合成器，
     * 任意滑动都会让浮层与取景框失准，必须撤下）。
     */
    let scrollIdleTimer = 0;
    let scrolling = false;
    let touchY = 0;
    const mainEl = (viewfinderRef.current?.closest('.main') ?? null) as HTMLElement | null;
    const atTop = () => !!mainEl && mainEl.scrollTop === 0;

    const syncCamera = () => {
      const { mode: m, hit: h, overlayOn: on } = stateRef.current;
      const allowed =
        !removed &&
        m === 'scan' &&
        !h &&
        !overlayBlocked() &&
        !scrolling &&
        !inputFocusedRef.current &&
        atTop();
      if (!allowed) {
        if (on) void stopCamera();
        return;
      }
      if (!on) {
            void startCamera();
      }
    };
    syncCameraRef.current = syncCamera;

    const markScrolling = () => {
      scrolling = true;
      window.clearTimeout(scrollIdleTimer);
    };
    const endScrolling = () => {
      window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(() => {
        scrolling = false;
        syncCamera();
      }, 250);
    };
    const onScroll = () => {
      markScrolling();
      endScrolling();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0;
      markScrolling();
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      const st = mainEl?.scrollTop ?? 0;
      // 关闭条件二选一：真滚动（scrollTop>0，无容差）或拖拽累计位移 >12px；
      // ≤12px 的轻微触摸只标记"滑动中"，不关闭已开的相机
      markScrolling();
      if ((st > 0 || Math.abs(y - touchY) > 12) && stateRef.current.overlayOn) {
        void stopCamera();
      }
    };
    const onTouchEnd = () => endScrolling();
    mainEl?.addEventListener('scroll', onScroll, { passive: true });
    mainEl?.addEventListener('touchstart', onTouchStart, { passive: true });
    mainEl?.addEventListener('touchmove', onTouchMove, { passive: true });
    mainEl?.addEventListener('touchend', onTouchEnd);

    /*
     * 抽屉 / 结果弹窗等全屏遮挡：出现即撤下相机，消失后恢复。
     * MutationObserver 只报"未来"变化 —— effect 因依赖变化重建时会丢失
     * 已存在的遮挡（旧 bug：抽屉开着时重建 effect → 相机被重新拉起盖住抽屉），
     * 所以每次挂载都要立即对齐一次当前 DOM。
     */
    // subtree 必开：仓库抽屉/结果弹窗都渲染在 React 树内（.shell 之下）。
    // 只触发 syncCamera —— 相机是否开启永远由状态机判定（含滚动位置）
    const obs = new MutationObserver(() => syncCamera());
    obs.observe(document.body, { childList: true, subtree: true });
    syncCamera();

    return () => {
      removed = true;
      window.clearTimeout(scrollIdleTimer);
      window.removeEventListener('resize', onResize);
      mainEl?.removeEventListener('scroll', onScroll);
      mainEl?.removeEventListener('touchstart', onTouchStart);
      mainEl?.removeEventListener('touchmove', onTouchMove);
      mainEl?.removeEventListener('touchend', onTouchEnd);
      obs.disconnect();
      void stopCamera();
      void Promise.all(handles).then((hs) => {
        for (const h of hs) {
          (h as { remove: () => Promise<void> }).remove().catch(() => undefined);
        }
      });
    };
    // hit 变化也要重挂：关闭结果弹窗后由挂载时的 syncBlocking 恢复相机
    //（弹窗在页面树内，仅靠 MutationObserver 不可靠）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hit]);

  /**
   * 相机关闭时的取景占位框点击：把页面带回顶部 —— 这是状态机里相机开启的
   * 唯一情况（在顶部且无滑动）。平滑滚动产生的 scroll 事件静止后由状态机
   * 自动开启相机；已在顶部时立即同步一次。
   */
  function onIdleClick() {
    const main = (viewfinderRef.current?.closest('.main') ?? null) as HTMLElement | null;
    if (main && main.scrollTop > 0) {
      main.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.setTimeout(() => syncCameraRef.current(), 60);
  }

  /**
   * 手动输入聚焦：立即撤下相机（输入态无需取景，不等键盘滚动链路），
   * 并在键盘弹出动画的 350ms / 700ms 两个时点把输入框滚入可视区 ——
   * 不依赖系统 adjustResize 是否生效，每次点击都保证抬升。
   */
  function onManualFocus() {
    inputFocusedRef.current = true;
    kbBaseH.current = window.innerHeight;
    kbClientH.current =
      (viewfinderRef.current?.closest('.main') as HTMLElement | null)?.clientHeight ?? 0;
    if (stateRef.current.overlayOn) void stopCamera();
    const lift = () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.tagName === 'INPUT') {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };
    window.setTimeout(lift, 350);
    window.setTimeout(lift, 700);
  }

  /** 手动输入失焦：解除聚焦态、清自补 padding，回到顶部后由状态机恢复相机 */
  function onManualBlur() {
    inputFocusedRef.current = false;
    const mainNow = (viewfinderRef.current?.closest('.main') ?? null) as HTMLElement | null;
    if (mainNow) mainNow.style.paddingBottom = '';
    window.setTimeout(() => {
      if (!stateRef.current.hit) {
        const main = viewfinderRef.current?.closest('.main');
        if (main && main.scrollTop > 0) main.scrollTo({ top: 0, behavior: 'smooth' });
      }
      window.setTimeout(() => syncCameraRef.current(), 500);
    }, 400);
  }

  /** 扫描条码 ↔ 识别文字 */
  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setHit(null);
  }

  /** 识别模式：拍照 / 选图 → OCR → 预填新建物品 */
  async function runOcr(source: 'camera' | 'photos') {
    if (ocrBusy) return;
    if (!isOcrSupported()) {
      showToast('文字识别需要在 App 内使用', 'error');
      return;
    }
    setOcrBusy(true);
    showToast(source === 'camera' ? '正在拍照识别…' : '打开相册…', 'info');
    try {
      const out = await ocrFromSource(source);
      const parsed = parseLabelText(out.lines);
      const draft = draftFromLabel(parsed, '图片文字识别');
      if (out.imageDataUrl) draft.imageDataUrls = [out.imageDataUrl];
      setPendingDraft(draft);
      navigate({ name: 'edit', code: parsed.code ?? null, from: 'scan' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|canceled|取消/i.test(msg)) return;
      showToast(`识别失败：${msg}`, 'error');
    } finally {
      setOcrBusy(false);
    }
  }

  async function goDetail(id: string) {
    navigate({ name: 'detail', id });
  }

  /**
   * 新建物品 / 子项。fillFromLookup 为真时把编码库查到的数据一起带过去 ——
   * 子项与父项条码相同，编码库数据同样适用（之前子项不填就是这个原因）。
   */
  async function goNew(code: string, parentId?: string, fillFromLookup = false) {
    setPendingDraft(fillFromLookup && lookup.info ? draftFromBarcodeInfo(lookup.info) : null);
    navigate({ name: 'edit', code, parent: parentId, from: 'scan' });
  }

  async function goNewFromLookup() {
    if (!hit || !lookup.info) return;
    setPendingDraft(draftFromBarcodeInfo(lookup.info));
    navigate({ name: 'edit', code: hit.code, from: 'scan' });
  }

  async function onGallery() {
    if (busy) return;
    setBusy(true);
    try {
      if (isCameraOverlayAvailable()) {
        showToast('打开相册…', 'info');
        await stopCamera();
        const found = await scanFromGallery();
        if (!found) {
          showToast('未识别到条码，请换更清晰照片', 'error');
          if (mode === 'scan') void startCamera();
          return;
        }
        showResult(found, '相册');
        showToast(`已识别 ${found.code}`, 'success');
      } else {
        fileInputRef.current?.click();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel|canceled|取消/i.test(msg)) {
        showToast(`相册识别失败：${msg}`, 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onWebFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    showToast('正在识别…', 'info');
    try {
      const found = await decodeFromFile(file);
      if (!found) {
        showToast('未识别到条码', 'error');
        return;
      }
      showResult(found, '相册');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '识别失败', 'error');
    }
  }

  async function handleManual(e: FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    showResult({ code, format: '手动输入' }, '手动');
    setManual('');
  }

  function closeResult() {
    setHit(null);
    // 相机由 [hit] 重挂 effect 的 syncCamera 恢复 —— 受"页面在顶部"约束：
    // 弹窗期间用户若滚动过页面，关闭弹窗也不会盲目拉起相机
  }

  const existingCount = hit?.existing.length ?? 0;
  const isOcr = mode === 'ocr';

  return (
    <div className="page scan-page" data-mode={mode}>
      <header className="page-head scan-head">
        <div>
          <p className="eyebrow">{isOcr ? '文字识别' : '取景识别'}</p>
          <h1>{isOcr ? '识别文字' : '扫描条码'}</h1>
        </div>
        <div className="seg scan-mode" role="group" aria-label="扫描模式">
          <button
            type="button"
            className={isOcr ? 'seg-btn' : 'seg-btn active'}
            aria-pressed={!isOcr}
            onClick={() => switchMode('scan')}
          >
            扫描条码
          </button>
          <button
            type="button"
            className={isOcr ? 'seg-btn active' : 'seg-btn'}
            aria-pressed={isOcr}
            onClick={() => switchMode('ocr')}
          >
            识别文字
          </button>
        </div>
      </header>

      {isOcr ? (
        <button
          type="button"
          className="ocr-shot pressable"
          onClick={() => void runOcr('camera')}
          disabled={ocrBusy}
          aria-label="点击拍照识别文字"
        >
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2a1 1 0 0 0 .83-.45l.74-1.1A1 1 0 0 1 10.1 4h3.8a1 1 0 0 1 .83.45l.74 1.1A1 1 0 0 0 16.3 6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="12.4" r="3.4" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span>{ocrBusy ? '识别中…' : '点击拍照识别'}</span>
          <span className="ocr-shot-hint">对准包装上的名称、净含量、日期</span>
        </button>
      ) : isCameraOverlayAvailable() ? (
        <>
          {/* 取景框：原生相机浮层会精确覆盖这个元素（只露出扫码框） */}
          <div className="scan-viewport frame-box" ref={viewfinderRef}>
            {!overlayOn && (
              <button type="button" className="vf-idle" onClick={onIdleClick}>
                <svg width="46" height="46" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M3 5.5v-1A1.5 1.5 0 0 1 4.5 3h1M20 5.5v-1A1.5 1.5 0 0 0 18.5 3h-1M3 18.5v1A1.5 1.5 0 0 0 4.5 21h1M20 18.5v1a1.5 1.5 0 0 1-1.5 1.5h-1M7 12h10"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                <b>上滑或点击扫描识别</b>
                <span>对准条形码或二维码</span>
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="scan-viewport idle">
          <button
            type="button"
            className="scan-start"
            onClick={() => showToast('浏览器预览：请用相册识别或手动输入', 'info')}
          >
            <span>浏览器预览</span>
            <span className="scan-start-hint">请在 App 内使用相机扫码</span>
          </button>
        </div>
      )}

      <div className="scan-actions">
        {isOcr ? (
          <button
            type="button"
            className="btn-ghost full pressable"
            disabled={ocrBusy}
            onClick={() => void runOcr('photos')}
          >
            相册识别文字
          </button>
        ) : (
          <button
            type="button"
            className="btn-ghost full pressable"
            disabled={busy}
            onClick={() => void onGallery()}
          >
            相册识别条码
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void onWebFile(e)}
        />
      </div>

      {!isOcr && (
        <form className="manual-box" onSubmit={handleManual}>
          <p className="manual-title">手动输入</p>
          <div className="manual-row">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onFocus={onManualFocus}
              onBlur={onManualBlur}
              placeholder="例如 6901234567892"
              inputMode="numeric"
              aria-label="条码"
            />
            <button type="submit" className="btn-primary pressable">
              查询
            </button>
          </div>
        </form>
      )}

      {/* 识别结果弹窗：Portal 到 body —— 遮罩必须盖满整个视口
          （含状态栏 / 导航条区域），挂在页面树内会因层级或定位基准
          少盖两端，出现上下颜色割裂 */}
      {hit &&
        createPortal(
          <div className="modal-backdrop" onClick={closeResult}>
          <div
            className="modal-card scan-result-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <p className="result-label">{hit.source}识别结果</p>
            <p className="result-code mono">{hit.code}</p>
            <p className="result-type">{hit.format}</p>

            {existingCount === 0 && <p className="result-ok">可新建物品</p>}

            {existingCount > 0 && (
              <div className="same-code-block">
                <p className="result-warn">本仓库已有 {existingCount} 个同条码物品</p>
                <ul className="same-code-list">
                  {hit.existing.slice(0, 4).map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        className="same-code-row pressable"
                        onClick={() => void goDetail(it.id)}
                      >
                        <span className="ellipsis">{it.name}</span>
                        <span className="mono same-code-batch">{batchLabel(it)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {existingCount > 4 && <p className="same-code-more">还有 {existingCount - 4} 项…</p>}
              </div>
            )}

            {__ONLINE__ && (lookup.loading || lookup.info) && (
              <div className="lookup-block glass-in">
                {lookup.loading ? (
                  <p className="lookup-loading">
                    <span className="spinner" aria-hidden="true" />
                    正在查询商品信息…
                  </p>
                ) : (
                  lookup.info && (
                    <>
                      <p className="lookup-title">查询到以下信息</p>
                      <dl className="lookup-list">
                        {lookup.info.name && (
                          <div>
                            <dt>产品名称</dt>
                            <dd>{lookup.info.name}</dd>
                          </div>
                        )}
                        {lookup.info.brand && (
                          <div>
                            <dt>品牌</dt>
                            <dd>{lookup.info.brand}</dd>
                          </div>
                        )}
                        {lookup.info.spec && (
                          <div>
                            <dt>规格</dt>
                            <dd>{lookup.info.spec}</dd>
                          </div>
                        )}
                        {lookup.info.netContent && (
                          <div>
                            <dt>净含量</dt>
                            <dd>{lookup.info.netContent}</dd>
                          </div>
                        )}
                        {lookup.info.manufacturer && (
                          <div>
                            <dt>厂商</dt>
                            <dd>{lookup.info.manufacturer}</dd>
                          </div>
                        )}
                        {lookup.info.origin && (
                          <div>
                            <dt>产地</dt>
                            <dd>{lookup.info.origin}</dd>
                          </div>
                        )}
                      </dl>
                      <p className="lookup-source">数据来源：{lookup.info.source}</p>
                    </>
                  )
                )}
              </div>
            )}

            {__ONLINE__ && lookup.tried && !lookup.loading && !lookup.info && (
              <p className="lookup-miss">未查询到该条码信息</p>
            )}

            <div className="modal-actions wrap">
              <button type="button" className="btn-ghost" onClick={closeResult}>
                继续扫
              </button>

              {existingCount === 1 && rootItem && (
                <button type="button" className="btn-ghost" onClick={() => void goDetail(rootItem.id)}>
                  打开物品
                </button>
              )}

              {existingCount === 0 && (
                <button type="button" className="btn-primary" onClick={() => void goNew(hit.code)}>
                  新建物品
                </button>
              )}

              {existingCount > 0 && rootItem && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void goNew(hit.code, rootItem.id, true)}
                >
                  + 新建子项（不同日期）
                </button>
              )}

              {__ONLINE__ && lookup.info && (
                <button
                  type="button"
                  className="btn-primary lookup-cta"
                  onClick={() => void goNewFromLookup()}
                >
                  新建物品并填入以上信息
                </button>
              )}
            </div>

            {existingCount > 0 && (
              <p className="modal-hint">
                同一商品的多个批次请用「新建子项」，可分别记录各自的生产日期与数量。
              </p>
            )}
          </div>
          </div>,
          document.body,
        )
      }
    </div>
  );
}
