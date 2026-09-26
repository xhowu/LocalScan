import { useEffect, useRef, useState, type FormEvent } from 'react';
import { findByCode } from '../db';
import { navigate } from '../router';
import {
  isNativeScannerAvailable,
  ensureNativeCameraPermission,
  startNativeScan,
  scanFromGallery,
  decodeFromFile,
  toggleTorch,
  type NativeScanSession,
  type ScanHit,
} from '../lib/native-scan';
import { showToast } from '../lib/ui';

type Phase = 'starting' | 'live' | 'unsupported' | 'denied';

type ResultState = {
  code: string;
  format: string;
  existingId: string | null;
  source: '相机' | '相册' | '手动';
} | null;

export function ScanPage() {
  const sessionRef = useRef<NativeScanSession | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [hit, setHit] = useState<ResultState>(null);
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState('启动原生扫描…');
  const [busy, setBusy] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  function showResult(found: ScanHit, source: '相机' | '相册' | '手动') {
    const existing = findByCode(found.code);
    setHit({
      code: found.code,
      format: found.format,
      existingId: existing?.id ?? null,
      source,
    });
    if (navigator.vibrate) navigator.vibrate(25);
  }

  async function stopNative() {
    try {
      await sessionRef.current?.stop();
    } catch {
      /* ignore */
    }
    sessionRef.current = null;
  }

  async function beginNative() {
    setHit(null);
    setPhase('starting');
    setStatus('检查相机权限…');
    const ok = await ensureNativeCameraPermission();
    if (!ok) {
      setPhase('denied');
      return;
    }
    try {
      setStatus('启动 ML Kit…');
      await stopNative();
      const session = await startNativeScan(async (found) => {
        await stopNative();
        showResult(found, '相机');
      });
      sessionRef.current = session;
      setPhase('live');
      setStatus('对准条码即可识别');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/permission/i.test(msg)) setPhase('denied');
      else {
        setPhase('unsupported');
        setStatus(msg);
        showToast(`扫码启动失败：${msg}`, 'error');
      }
    }
  }

  useEffect(() => {
    if (!isNativeScannerAvailable()) {
      setPhase('unsupported');
      setStatus('浏览器预览：请用相册识别或手动输入');
      return;
    }
    void beginNative();
    return () => {
      void stopNative();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onTorch() {
    const on = await toggleTorch();
    setTorchOn(on);
    showToast(on ? '闪光灯已开' : '闪光灯已关', 'info');
  }

  async function goDetail(id: string) {
    await stopNative();
    navigate({ name: 'detail', id });
  }

  async function goEdit(code: string) {
    await stopNative();
    navigate({ name: 'edit', code });
  }

  async function onGallery() {
    if (busy) return;
    setBusy(true);
    showToast('打开相册…', 'info');
    try {
      if (isNativeScannerAvailable()) {
        await stopNative();
        document.body.classList.remove('barcode-scanner-active');
        const found = await scanFromGallery();
        if (!found) {
          showToast('未识别到条码，请换更清晰照片', 'error');
          void beginNative();
          return;
        }
        showResult(found, '相册');
        showToast(`已识别 ${found.code}`, 'success');
      } else {
        fileInputRef.current?.click();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|canceled|取消/i.test(msg)) void beginNative();
      else {
        showToast(`相册识别失败：${msg}`, 'error');
        void beginNative();
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

  async function closeResult(resumeCam: boolean) {
    setHit(null);
    if (resumeCam) void beginNative();
  }

  return (
    <div className="page scan-page">
      <header className="page-head scan-head">
        <div>
          <p className="eyebrow">ML Kit 原生识别</p>
          <h1>扫描条码</h1>
        </div>
        <button
          type="button"
          className="btn-ghost sm"
          onClick={() => {
            void stopNative().then(() => navigate({ name: 'items' }));
          }}
        >
          返回
        </button>
      </header>

      <div className="scan-viewport native">
        <div className="scan-frame" aria-hidden="true">
          <span className="corner c1" />
          <span className="corner c2" />
          <span className="corner c3" />
          <span className="corner c4" />
          <div className="scan-line" />
        </div>
        {phase === 'starting' && <p className="scan-overlay">{status}</p>}
        {phase === 'denied' && <p className="scan-overlay">相机权限被拒绝，请到系统设置开启</p>}
        {phase === 'unsupported' && <p className="scan-overlay">{status}</p>}
        {phase === 'live' && <p className="scan-hint">{status}</p>}

        {phase === 'live' && (
          <button
            type="button"
            className={torchOn ? 'torch-btn on' : 'torch-btn'}
            onClick={() => void onTorch()}
            aria-label={torchOn ? '关闭闪光灯' : '打开闪光灯'}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9 2h6v4l-1 2v2h-4V8L9 6V2z"
                fill={torchOn ? '#fff' : 'currentColor'}
              />
              <path
                d="M10 10h4v12h-4V10z"
                fill={torchOn ? '#fff' : 'currentColor'}
                opacity="0.9"
              />
              {torchOn && (
                <>
                  <path d="M4 4l3 2M20 4l-3 2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>

      <div className="scan-actions">
        <button type="button" className="btn-ghost full" disabled={busy} onClick={() => void onGallery()}>
          相册识别
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => void onWebFile(e)} />
      </div>

      <form className="manual-box" onSubmit={handleManual}>
        <p className="manual-title">手动输入</p>
        <div className="manual-row">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="例如 6901234567892"
            inputMode="numeric"
            aria-label="条码"
          />
          <button type="submit" className="btn-primary">
            查询
          </button>
        </div>
      </form>

      {/* Result as modal dialog — not inline between buttons */}
      {hit && (
        <div className="modal-backdrop" onClick={() => void closeResult(true)}>
          <div className="modal-card scan-result-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <p className="result-label">{hit.source}识别结果</p>
            <p className="result-code mono">{hit.code}</p>
            <p className="result-type">{hit.format}</p>
            {hit.existingId ? (
              <p className="result-warn">本仓库已有该条码</p>
            ) : (
              <p className="result-ok">可绑定为新物品</p>
            )}
            <div className="modal-actions">
              {hit.existingId ? (
                <>
                  <button type="button" className="btn-ghost" onClick={() => void closeResult(true)}>
                    继续扫
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void goDetail(hit.existingId!)}
                  >
                    打开物品
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn-ghost" onClick={() => void closeResult(true)}>
                    继续扫
                  </button>
                  <button type="button" className="btn-primary" onClick={() => void goEdit(hit.code)}>
                    绑定新物品
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
