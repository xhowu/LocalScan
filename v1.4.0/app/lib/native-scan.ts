import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  BarcodeScanner,
  BarcodeFormat,
  type Barcode,
} from '@capacitor-mlkit/barcode-scanning';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Torch } from '@capawesome/capacitor-torch';
import { decodeFromImage as webDecodeFromImage } from './scan-web';

type WebviewBridge = {
  setTransparent(): Promise<void>;
  setOpaque(): Promise<void>;
};

const Webview = registerPlugin<WebviewBridge>('LocalscanWebview');

export type ScanHit = { code: string; format: string };

const NATIVE_FORMATS: BarcodeFormat[] = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.UpcE,
  BarcodeFormat.Code128,
  BarcodeFormat.Code39,
  BarcodeFormat.Code93,
  BarcodeFormat.Itf,
  BarcodeFormat.Codabar,
  BarcodeFormat.QrCode,
  BarcodeFormat.DataMatrix,
];

function barcodeToHit(b: Barcode): ScanHit {
  return { code: b.rawValue ?? b.displayValue ?? '', format: String(b.format) };
}

export function isNativeScannerAvailable() {
  return Capacitor.isNativePlatform();
}

export async function ensureNativeCameraPermission(): Promise<boolean> {
  try {
    const check = await BarcodeScanner.checkPermissions();
    if (check.camera === 'granted') return true;
    const req = await BarcodeScanner.requestPermissions();
    return req.camera === 'granted';
  } catch {
    return false;
  }
}

export type NativeScanSession = { stop: () => Promise<void> };

export function startNativeScan(onHit: (hit: ScanHit) => void): Promise<NativeScanSession> {
  return (async () => {
    document.documentElement.classList.add('barcode-scanner-active');
    document.body.classList.add('barcode-scanner-active');
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    try {
      await Webview.setTransparent();
    } catch {
      /* plugin missing in web preview */
    }
    const listener = await BarcodeScanner.addListener('barcodesScanned', (event) => {
      const b = event.barcodes?.[0];
      if (!b?.rawValue) return;
      onHit(barcodeToHit(b));
    });
    await BarcodeScanner.startScan({ formats: NATIVE_FORMATS });
    return {
      stop: async () => {
        document.documentElement.classList.remove('barcode-scanner-active');
        document.body.classList.remove('barcode-scanner-active');
        document.body.style.background = '';
        document.documentElement.style.background = '';
        try {
          await Webview.setOpaque();
        } catch {
          /* ignore */
        }
        try {
          await listener.remove();
        } catch {
          /* ignore */
        }
        try {
          await BarcodeScanner.stopScan();
        } catch {
          /* ignore */
        }
      },
    };
  })();
}

export async function toggleTorch(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Torch.toggle();
      const { enabled } = await Torch.isEnabled();
      return enabled;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function getTorchEnabled(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { enabled } = await Torch.isEnabled();
      return enabled;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Try ML Kit with several path shapes Android commonly accepts. */
async function readNativeFromPaths(paths: string[]): Promise<ScanHit | null> {
  for (const path of paths) {
    if (!path) continue;
    const candidates = [path, path.replace(/^file:\/\//, ''), `file://${path.replace(/^file:\/\//, '')}`];
    for (const p of candidates) {
      try {
        const { barcodes } = await BarcodeScanner.readBarcodesFromImage({
          path: p,
          formats: NATIVE_FORMATS,
        });
        if (barcodes?.length && barcodes[0].rawValue) {
          return barcodeToHit(barcodes[0]);
        }
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

/** Write base64 into app cache and return filesystem paths for ML Kit. */
async function cacheBase64ToPaths(base64: string): Promise<string[]> {
  const name = `scan-${Date.now()}.jpg`;
  await Filesystem.writeFile({
    path: name,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  const uri = await Filesystem.getUri({ path: name, directory: Directory.Cache });
  return [uri.uri, uri.uri.replace(/^file:\/\//, '')];
}

/**
 * Gallery scan — 100% native on Android/iOS.
 * Never fall back to html5-qrcode (it cannot load content:// or capacitor paths).
 */
export async function scanFromGallery(): Promise<ScanHit | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    // Base64 is the only reliable form we can write to cache for ML Kit
    resultType: CameraResultType.Base64,
    source: CameraSource.Photos,
    width: 1600,
    height: 1600,
  });

  if (photo.base64String) {
    const paths = await cacheBase64ToPaths(photo.base64String);
    const hit = await readNativeFromPaths(paths);
    if (hit) return hit;
  }

  // Some devices still expose a usable path
  if (photo.path) {
    const hit = await readNativeFromPaths([photo.path]);
    if (hit) return hit;
  }

  // Last resort: if we have a blob-like webPath that Capacitor can convert
  if (photo.webPath) {
    try {
      const res = await fetch(photo.webPath);
      const blob = await res.blob();
      const base64 = await blobToBase64(blob);
      const paths = await cacheBase64ToPaths(base64);
      const hit = await readNativeFromPaths(paths);
      if (hit) return hit;
    } catch {
      /* ignore */
    }
  }

  return null;
}

/** File-input path (used on web and as native fallback). */
export async function decodeFromFile(file: File): Promise<ScanHit | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const base64 = await fileToBase64(file);
      const paths = await cacheBase64ToPaths(base64);
      const hit = await readNativeFromPaths(paths);
      if (hit) return hit;
    } catch {
      /* ignore */
    }
    // native last resort: still try web decoder on a real File/Blob (works in WebView)
    try {
      return await webDecodeFromImage(file);
    } catch {
      return null;
    }
  }
  return webDecodeFromImage(file);
}

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      resolve(data.includes(',') ? data.split(',')[1] : data);
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return fileToBase64(blob);
}

export { BarcodeFormat };
