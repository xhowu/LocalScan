import { useEffect, useRef, useState, type FormEvent } from 'react';
import { findByCode } from '../db';
import { navigate } from '../router';
import { openCameraStream, startScanLoop, decodeFromImage, type ScanLoopHandle } from '../lib/scan';
import { showToast } from '../lib/ui';

type Phase = 'starting' | 'live' | 'unsupported' | 'denied' | 'result';

export function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<ScanLoopHandle | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [hit, setHit] = useState<{ code: string; format: string; existingId: string | null } | null>(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setPhase('starting');
      try {
        const stream = await openCameraStream('environment');
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          video.muted = true;
          await video.play().catch(() => undefined);
        }
        setPhase('live');
        if (!video) return;
        loopRef.current = startScanLoop(
          video,
          (found) => {
            const existing = findByCode(found.code);
            setHit({ code: found.code, format: found.format, existingId: existing?.id ?? null });
            setPhase('result');
            if (navigator.vibrate) navigator.vibrate(20);
          },
          () => {
            /* frame errors ignored */
          },
        );
      } catch (err) {
        const e = err as DOMException;
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') setPhase('denied');
        else setPhase('unsupported');
      }
    }

    void start();
    return () => {
      cancelled = true;
      loopRef.current?.stop();
      loopRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function resume() {
    setHit(null);
    setPhase('live');
    const video = videoRef.current;
    if (video && streamRef.current) {
      loopRef.current?.stop();
      loopRef.current = startScanLoop(
        video,
        (found) => {
          const existing = findByCode(found.code);
          setHit({ code: found.code, format: found.format, existingId: existing?.id ?? null });
          setPhase('result');
          if (navigator.vibrate) navigator.vibrate(20);
        },
      );
    }
  }

  async function onPickImage(e: ChangeEvent) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    showToast('正在识别图片…', 'info');
    const found = await decodeFromImage(file);
    if (!found) {
      showToast('未在图片中识别到条码', 'error');
      return;
    }
    const existing = findByCode(found.code);
    setHit({ code: found.code, format: found.format, existingId: existing?.id ?? null });
    setPhase('result');
  }

  async function handleManual(e: FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    const existing = findByCode(code);
    setHit({ code, format: '手动输入', existingId: existing?.id ?? null });
    setPhase('result');
  }

  return (
    <div className="page scan-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">识别</p>
          <h1>扫描条码</h1>
        </div>
        <button type="button" className="btn-ghost" onClick={() => navigate({ name: 'items' })}>
          返回
        </button>
      </header>

      <div className="scan-viewport">
        <video ref={videoRef} playsInline muted className="scan-video" />
        {phase !== 'result' && (
          <div className="scan-frame" aria-hidden="true">
            <span className="corner c1" />
            <span className="corner c2" />
            <span className="corner c3" />
            <span className="corner c4" />
            <div className="scan-line" />
          </div>
        )}
        {phase === 'starting' && <p className="scan-overlay">正在启动相机…</p>}
        {phase === 'unsupported' && (
          <p className="scan-overlay">
            无法访问相机。
            <br />
            请授权相机权限，或使用下方手动输入 / 相册识别。
          </p>
        )}
        {phase === 'denied' && (
          <p className="scan-overlay">
            相机权限被拒绝。
            <br />
            请在系统设置中允许「码上记」使用相机。
          </p>
        )}
        {phase === 'live' && <p className="scan-hint">将条码置于框内，识别成功会自动提示</p>}
      </div>

      <div className="scan-tools">
        <label className="btn-ghost full">
          相册识别
          <input type="file" accept="image/*" hidden onChange={(e) => void onPickImage(e)} />
        </label>
      </div>

      {phase === 'result' && hit && (
        <div className="scan-result glass-in" role="status">
          <p className="result-label">识别结果</p>
          <p className="result-code mono">{hit.code}</p>
          <p className="result-type">类型：{hit.format}</p>
          {hit.existingId ? (
            <>
              <p className="result-warn">本仓库已存在该条码</p>
              <div className="result-actions">
                <button type="button" className="btn-ghost" onClick={resume}>
                  继续扫
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate({ name: 'detail', id: hit.existingId! })}
                >
                  打开物品
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="result-ok">本地库中无此条码</p>
              <div className="result-actions">
                <button type="button" className="btn-ghost" onClick={resume}>
                  继续扫
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate({ name: 'edit', code: hit.code })}
                >
                  绑定为新物品
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <form className="manual-box glass-in" onSubmit={handleManual}>
        <p className="manual-title">手动输入条码</p>
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
        <p className="manual-note">扫描只生成标识，商品信息需手动填写。</p>
      </form>
    </div>
  );
}

type ChangeEvent = React.ChangeEvent<HTMLInputElement>;
