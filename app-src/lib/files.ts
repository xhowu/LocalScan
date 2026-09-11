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

/** Trigger a file download from a Blob */
export function downloadBlob(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoke after a tick so WebView can finish
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return filename;
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8') {
  return downloadBlob(new Blob([text], { type: mime }), filename);
}

export function dateStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
