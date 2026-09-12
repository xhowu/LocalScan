/** Web-only ZXing/jsQR decode — kept for browser preview and last-resort fallback. */
import jsQR from 'jsqr';
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  GlobalHistogramBinarizer,
} from '@zxing/library';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

export type ScanHit = { code: string; format: string };

function makeReader() {
  const reader = new MultiFormatReader();
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  return reader;
}

function toLuminance(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const n = width * height;
  const out = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    out[p] = ((data[i] * 77 + data[i + 1] * 151 + data[i + 2] * 28) >> 8) & 0xff;
  }
  return out;
}

function invertLum(src: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i++) out[i] = 255 - src[i];
  return out;
}

function tryZxing(lum: Uint8ClampedArray, w: number, h: number, global: boolean): ScanHit | null {
  const reader = makeReader();
  try {
    const source = new RGBLuminanceSource(lum, w, h);
    const bitmap = new BinaryBitmap(
      global ? new GlobalHistogramBinarizer(source) : new HybridBinarizer(source),
    );
    const r = reader.decode(bitmap);
    if (r?.getText()) return { code: r.getText(), format: String(r.getBarcodeFormat()) };
  } catch {
    return null;
  } finally {
    reader.reset();
  }
  return null;
}

export function decodeImagePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ScanHit | null {
  if (width < 16 || height < 16) return null;
  const lum = toLuminance(data, width, height);
  const inv = invertLum(lum);
  for (const arr of [lum, inv]) {
    for (const g of [false, true]) {
      const hit = tryZxing(arr, width, height, g);
      if (hit) return hit;
    }
  }
  try {
    const qr = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
    if (qr?.data) return { code: qr.data, format: 'QR_CODE' };
  } catch {
    /* ignore */
  }
  return null;
}

const ALL_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.AZTEC,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.MAXICODE,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.PDF_417,
  Html5QrcodeSupportedFormats.RSS_14,
  Html5QrcodeSupportedFormats.RSS_EXPANDED,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
];

/** Web file scan via html5-qrcode.scanFile + ZXing fallback. */
export async function decodeFromImage(file: File): Promise<ScanHit | null> {
  try {
    const tmpId = `scan-tmp-${Date.now()}`;
    const tmp = document.createElement('div');
    tmp.id = tmpId;
    tmp.style.cssText =
      'position:fixed;left:-9999px;top:0;width:400px;height:400px;opacity:0;pointer-events:none;';
    document.body.appendChild(tmp);
    const scanner = new Html5Qrcode(tmpId, { formatsToSupport: ALL_FORMATS, verbose: false });
    try {
      const text = await scanner.scanFile(file, false);
      if (text) return { code: text, format: 'html5-qrcode' };
    } finally {
      try {
        scanner.clear();
      } catch {
        /* ignore */
      }
      tmp.remove();
    }
  } catch {
    /* fall through */
  }

  try {
    const bitmap = await createImageBitmap(file);
    const sw = bitmap.width;
    const sh = bitmap.height;
    for (const s of [1, 0.8, 0.55]) {
      const w = Math.max(32, Math.round(sw * s));
      const h = Math.max(32, Math.round(sh * s));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const hit = decodeImagePixels(img.data, w, h);
      if (hit) {
        bitmap.close();
        return hit;
      }
    }
    bitmap.close();
  } catch {
    /* ignore */
  }
  return null;
}
