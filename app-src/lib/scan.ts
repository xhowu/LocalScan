import jsQR from 'jsqr';

export type ScanHit = { code: string; format: string };

type DetectorLike = {
  detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string; format: string }>>;
};

function hasNativeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

async function detectNative(video: HTMLVideoElement): Promise<ScanHit | null> {
  const Ctor = (window as unknown as { BarcodeDetector: new (o?: unknown) => DetectorLike })
    .BarcodeDetector;
  const detector = new Ctor({
    formats: [
      'ean_13',
      'ean_8',
      'upc_a',
      'upc_e',
      'code_128',
      'code_39',
      'code_93',
      'qr_code',
      'data_matrix',
    ],
  });
  const codes = await detector.detect(video);
  if (codes[0]?.rawValue) {
    return { code: codes[0].rawValue, format: codes[0].format };
  }
  return null;
}

function detectJsQR(video: HTMLVideoElement, canvas: HTMLCanvasElement): ScanHit | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, 640 / Math.max(w, h));
  const cw = Math.floor(w * scale);
  const ch = Math.floor(h * scale);
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, cw, ch);
  const image = ctx.getImageData(0, 0, cw, ch);
  const result = jsQR(image.data, cw, ch, {
    inversionAttempts: 'attemptBoth',
  });
  if (result?.data) return { code: result.data, format: 'QR/CODE' };
  return null;
}

export type ScanLoopHandle = {
  stop: () => void;
};

/**
 * Continuous scan loop.
 * Uses native BarcodeDetector when available, otherwise jsQR on canvas frames.
 * This works inside Android WebView where BarcodeDetector is often missing.
 */
export function startScanLoop(
  video: HTMLVideoElement,
  onHit: (hit: ScanHit) => void,
  onError?: (err: Error) => void,
): ScanLoopHandle {
  let stopped = false;
  let raf = 0;
  const canvas = document.createElement('canvas');
  const useNative = hasNativeDetector();
  let lastCode = '';
  let lastAt = 0;

  const tick = async () => {
    if (stopped) return;
    try {
      let hit: ScanHit | null = null;
      if (useNative) {
        hit = await detectNative(video);
      } else {
        hit = detectJsQR(video, canvas);
      }
      if (hit && hit.code) {
        const now = Date.now();
        if (hit.code !== lastCode || now - lastAt > 2000) {
          lastCode = hit.code;
          lastAt = now;
          onHit(hit);
          return; // stop after first hit; caller restarts if needed
        }
      }
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    }
    raf = requestAnimationFrame(() => void tick());
  };

  raf = requestAnimationFrame(() => void tick());

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}

export async function openCameraStream(facing: 'environment' | 'user' = 'environment') {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  return stream;
}

/** Decode a still image (photo taken from gallery / camera) */
export async function decodeFromImage(file: File | Blob): Promise<ScanHit | null> {
  const bitmap = await createImageBitmap(file);
  const max = 1024;
  let w = bitmap.width;
  let h = bitmap.height;
  if (Math.max(w, h) > max) {
    const s = max / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const image = ctx.getImageData(0, 0, w, h);
  const result = jsQR(image.data, w, h, { inversionAttempts: 'attemptBoth' });
  if (result?.data) return { code: result.data, format: 'QR/CODE' };

  if (hasNativeDetector()) {
    const Ctor = (window as unknown as { BarcodeDetector: new (o?: unknown) => DetectorLike })
      .BarcodeDetector;
    const detector = new Ctor();
    const codes = await detector.detect(canvas);
    if (codes[0]?.rawValue) return { code: codes[0].rawValue, format: codes[0].format };
  }
  return null;
}
