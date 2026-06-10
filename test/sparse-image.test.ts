import { describe, expect, it } from 'vitest';
import { getFlashDownloadSize, iterateFlashData } from '../src/core/fastboot/sparse-image';

function buildSparse(chunks: Array<{ type: number; blocks: number; data?: Uint8Array }>, blkSz = 4096): Blob {
  const fileHdrSz = 28;
  const chunkHdrSz = 12;
  const totalBlks = chunks.reduce((sum, chunk) => sum + chunk.blocks, 0);
  const header = new ArrayBuffer(fileHdrSz);
  const view = new DataView(header);
  view.setUint32(0, 0xed26ff3a, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileHdrSz, true);
  view.setUint16(10, chunkHdrSz, true);
  view.setUint32(12, blkSz, true);
  view.setUint32(16, totalBlks, true);
  view.setUint32(20, chunks.length, true);
  view.setUint32(24, 0, true);

  const parts = [new Uint8Array(header)];
  for (const chunk of chunks) {
    const body = chunk.data ?? new Uint8Array(0);
    const totalSz = chunkHdrSz + body.byteLength;
    const chunkHeader = new ArrayBuffer(chunkHdrSz);
    const chunkView = new DataView(chunkHeader);
    chunkView.setUint16(0, chunk.type, true);
    chunkView.setUint16(2, 0, true);
    chunkView.setUint32(4, chunk.blocks, true);
    chunkView.setUint32(8, totalSz, true);
    parts.push(new Uint8Array(chunkHeader), new Uint8Array(body));
  }
  return new Blob(parts as BlobPart[]);
}

describe('sparse image', () => {
  it('expands dont-care and raw chunks to the download size', async () => {
    const raw = new Uint8Array(4096);
    raw.set([1, 2, 3, 4]);
    const blob = buildSparse([
      { type: 0xcac3, blocks: 1 },
      { type: 0xcac1, blocks: 1, data: raw },
    ]);
    const file = new File([blob], 'boot.img', { type: 'application/octet-stream' });

    expect(await getFlashDownloadSize(file)).toBe(8192);

    const out: number[] = [];
    for await (const chunk of iterateFlashData(file, 4096)) out.push(...chunk);
    expect(out.length).toBe(8192);
    expect(out.slice(4096, 4100)).toEqual([1, 2, 3, 4]);
  });
});
