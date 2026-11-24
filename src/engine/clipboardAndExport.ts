import { DetectedBox, OutputFormat } from '../types/screenshot';

export function cropCanvas(
  source: HTMLCanvasElement,
  box: Pick<DetectedBox, 'x' | 'y' | 'width' | 'height'>
): HTMLCanvasElement {
  const x = Math.max(0, Math.min(source.width - 1, Math.round(box.x)));
  const y = Math.max(0, Math.min(source.height - 1, Math.round(box.y)));
  const w = Math.max(1, Math.min(source.width - x, Math.round(box.width)));
  const h = Math.max(1, Math.min(source.height - y, Math.round(box.height)));

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
  }
  return out;
}

export function generateArtworkFilename(
  template: string,
  format: OutputFormat,
  appName: string,
  suffix = ''
): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const safeApp = appName.replace(/[^a-zA-Z0-9_-]/g, '') || 'Design';

  const stem = (template || 'Artwork_{date}_{time}')
    .replace(/\{date\}/g, dateStr)
    .replace(/\{time\}/g, timeStr)
    .replace(/\{app\}/g, safeApp);

  const ext = format.toLowerCase();
  return `${stem}${suffix}.${ext}`;
}

export async function copyCanvasImageToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const res = await window.electronAPI.copyImageToClipboard(dataUrl);
      return Boolean(res?.ok);
    } catch {
      return false;
    }
  }

  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    return false;
  }
  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function encodeBmpBlob(canvas: HTMLCanvasElement): Blob {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx ? ctx.getImageData(0, 0, w, h).data : new Uint8ClampedArray(w * h * 4);

  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  const pixelArraySize = rowSize * h;
  const fileSize = 54 + pixelArraySize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  // BITMAPFILEHEADER (14 bytes)
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);

  // BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true);
  view.setInt32(18, w, true);
  view.setInt32(22, h, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelArraySize, true);

  const bytes = new Uint8Array(buf);
  for (let y = 0; y < h; y++) {
    const srcRow = h - 1 - y;
    const dstOffset = 54 + y * rowSize;
    for (let x = 0; x < w; x++) {
      const s = (srcRow * w + x) * 4;
      const d = dstOffset + x * 3;
      bytes[d] = imgData[s + 2]; // B
      bytes[d + 1] = imgData[s + 1]; // G
      bytes[d + 2] = imgData[s]; // R
    }
  }

  return new Blob([buf], { type: 'image/bmp' });
}

export async function exportCanvasToBlob(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  jpgQuality = 95
): Promise<Blob> {
  if (format === 'BMP') {
    return encodeBmpBlob(canvas);
  }
  const mime = format === 'JPG' ? 'image/jpeg' : 'image/png';
  const quality = format === 'JPG' ? Math.min(1, Math.max(0.1, jpgQuality / 100)) : undefined;
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode screenshot'));
      },
      mime,
      quality
    );
  });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
