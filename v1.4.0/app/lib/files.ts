import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { compressImage } from '../services/image';

export async function fileToDataUrl(file: File | Blob): Promise<string> {
  const compressed = await compressImage(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(compressed);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      resolve(data.includes(',') ? data.split(',')[1] : data);
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(blob);
  });
}

export async function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

/**
 * Save a file. On Android: write to Documents/LocalScan and return the
 * real filesystem path so the user can find it in Files app.
 * On web: trigger browser download and return a friendly hint.
 */
export async function saveFile(blob: Blob, filename: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const base64 = await blobToBase64(blob);
      const dir = Directory.Documents;
      const folder = 'LocalScan';
      // ensure folder (ignore if exists)
      try {
        await Filesystem.mkdir({ path: folder, directory: dir, recursive: true });
      } catch {
        /* exists */
      }
      const path = `${folder}/${filename}`;
      await Filesystem.writeFile({
        path,
        data: base64,
        directory: dir,
        recursive: true,
      });
      // Resolve absolute URI for user-facing message
      try {
        const uri = await Filesystem.getUri({ path, directory: dir });
        return uri.uri.replace('file://', '');
      } catch {
        return `Documents/${folder}/${filename}`;
      }
    } catch (e) {
      throw new Error(
        e instanceof Error ? `写入失败：${e.message}` : '写入失败，请检查存储权限',
      );
    }
  }

  // Web fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `浏览器下载目录/${filename}`;
}

export async function saveText(text: string, filename: string, mime = 'text/plain;charset=utf-8') {
  return saveFile(new Blob([text], { type: mime }), filename);
}

export function dateStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
