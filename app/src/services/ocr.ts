import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Script, TextRecognition } from '@capacitor-mlkit/text-recognition';

export type OcrOutcome = {
  /** OCR 出来的文本行（已按块/行顺序拍平） */
  lines: string[];
  /** 原图 data URL，可直接作为物品图片保存 */
  imageDataUrl: string | null;
  /** 原生返回的整段文本 */
  rawText: string;
};

/** 图片文字识别依赖原生 ML Kit，Web 预览下不可用 */
export function isOcrSupported(): boolean {
  return Capacitor.isNativePlatform();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      resolve(data.includes(',') ? data.split(',')[1] : data);
    };
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

async function runProcess(path: string): Promise<{ lines: string[]; rawText: string }> {
  const candidates = [path, path.replace(/^file:\/\//, ''), `file://${path.replace(/^file:\/\//, '')}`];
  let lastErr: unknown = null;
  for (const p of candidates) {
    try {
      const res = await TextRecognition.processImage({ path: p, script: Script.Chinese });
      const lines: string[] = [];
      for (const block of res.blocks ?? []) {
        for (const line of block.lines ?? []) {
          const t = (line.text ?? '').trim();
          if (t) lines.push(t);
        }
      }
      return { lines, rawText: res.text ?? lines.join('\n') };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('文字识别失败');
}

async function recognizeBase64(base64: string): Promise<{ lines: string[]; rawText: string }> {
  const name = `ocr-${Date.now()}.jpg`;
  await Filesystem.writeFile({
    path: name,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  try {
    const uri = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    return await runProcess(uri.uri);
  } finally {
    try {
      await Filesystem.deleteFile({ path: name, directory: Directory.Cache });
    } catch {
      /* 缓存文件清理失败不影响结果 */
    }
  }
}

/**
 * 拍照 / 相册选图 → OCR。
 * 返回文本行与原图 data URL，交给上层解析成物品字段。
 */
export async function ocrFromSource(source: 'camera' | 'photos'): Promise<OcrOutcome> {
  if (!isOcrSupported()) {
    throw new Error('文字识别需要在 App 内使用');
  }
  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Base64,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    width: 1600,
    height: 1600,
  });

  const base64 = photo.base64String ?? null;
  if (base64) {
    const { lines, rawText } = await recognizeBase64(base64);
    return { lines, rawText, imageDataUrl: `data:image/jpeg;base64,${base64}` };
  }

  // 少数设备只给 path
  if (photo.path) {
    const { lines, rawText } = await runProcess(photo.path);
    return { lines, rawText, imageDataUrl: photo.webPath ?? null };
  }

  if (photo.webPath) {
    const blob = await (await fetch(photo.webPath)).blob();
    const b64 = await blobToBase64(blob);
    const { lines, rawText } = await recognizeBase64(b64);
    return { lines, rawText, imageDataUrl: photo.webPath };
  }

  throw new Error('未能读取照片');
}
