const MAX_EDGE = 1080;
const MAX_BYTES = 500 * 1024;

export async function compressImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > MAX_EDGE || height > MAX_EDGE) {
    const scale = MAX_EDGE / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.85;
  let blob = await toBlob(canvas, 'image/jpeg', quality);
  while (blob && blob.size > MAX_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await toBlob(canvas, 'image/jpeg', quality);
  }
  return blob ?? file;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}
