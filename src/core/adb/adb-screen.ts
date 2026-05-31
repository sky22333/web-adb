import { adbClient } from './adb-client';
import { runExecBinary } from './adb-shell';

export async function takeScreenshot(): Promise<{ blob?: Blob; canvas?: HTMLCanvasElement }> {
  try {
    const png = await runExecBinary(['screencap', '-p']);
    if (!png || png.byteLength < 8) throw new Error('截图数据为空。');
    const header = Array.from(png.slice(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (header !== '89504e470d0a1a0a') throw new Error('返回数据不是 PNG。');
    return { blob: new Blob([new Uint8Array(png).buffer as ArrayBuffer], { type: 'image/png' }) };
  } catch {
    const fb = await adbClient.ensure().framebuffer();
    const canvas = document.createElement('canvas');
    canvas.width = fb.width;
    canvas.height = fb.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 Canvas。');
    const image = ctx.createImageData(fb.width, fb.height);
    for (let i = 0, j = 0; i < fb.data.length && j < image.data.length; i += fb.bpp / 8, j += 4) {
      image.data[j] = readColor(fb.data, i, fb.red_offset, fb.red_length);
      image.data[j + 1] = readColor(fb.data, i, fb.green_offset, fb.green_length);
      image.data[j + 2] = readColor(fb.data, i, fb.blue_offset, fb.blue_length);
      image.data[j + 3] = fb.alpha_length ? readColor(fb.data, i, fb.alpha_offset, fb.alpha_length) : 255;
    }
    ctx.putImageData(image, 0, 0);
    return { canvas };
  }
}

function readColor(data: Uint8Array, byteOffset: number, bitOffset: number, bitLength: number): number {
  const view = new DataView(data.buffer, data.byteOffset + byteOffset, Math.min(4, data.byteLength - byteOffset));
  const raw = view.getUint32(0, true);
  const value = (raw >> bitOffset) & ((1 << bitLength) - 1);
  return Math.round((value / ((1 << bitLength) - 1)) * 255);
}
