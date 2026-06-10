import { AppError } from '../utils/errors';
import { isAndroidSparseImage } from './fastboot-protocol';

const CHUNK_RAW = 0xcac1;
const CHUNK_FILL = 0xcac2;
const CHUNK_DONT_CARE = 0xcac3;
const CHUNK_CRC32 = 0xcac4;

interface SparseHeader {
  fileHdrSz: number;
  chunkHdrSz: number;
  blkSz: number;
  totalBlks: number;
}

async function readSparseHeader(file: File): Promise<SparseHeader> {
  const view = new DataView(await file.slice(0, 28).arrayBuffer());
  if (view.getUint32(0, true) !== 0xed26ff3a) {
    throw new AppError('UNSUPPORTED_OPERATION', 'Invalid Android sparse image header.');
  }
  if (view.getUint16(4, true) !== 1) {
    throw new AppError('UNSUPPORTED_OPERATION', 'Unsupported sparse image version.');
  }
  return {
    fileHdrSz: view.getUint16(8, true),
    chunkHdrSz: view.getUint16(10, true),
    blkSz: view.getUint32(12, true),
    totalBlks: view.getUint32(16, true),
  };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (!a.byteLength) return b;
  if (!b.byteLength) return a;
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

async function* expandSparse(file: File, chunkSize: number): AsyncGenerator<Uint8Array> {
  const header = await readSparseHeader(file);
  if (!header.blkSz || header.blkSz % 4 !== 0 || !header.totalBlks) {
    throw new AppError('UNSUPPORTED_OPERATION', 'Invalid sparse image layout.');
  }

  let offset = header.fileHdrSz;
  let pending: Uint8Array = new Uint8Array(0);

  const append = function* (data: Uint8Array) {
    pending = concat(pending, data);
    while (pending.byteLength >= chunkSize) {
      yield pending.slice(0, chunkSize);
      pending = pending.slice(chunkSize);
    }
  };

  while (offset < file.size) {
    const chunkView = new DataView(await file.slice(offset, offset + header.chunkHdrSz).arrayBuffer());
    const chunkType = chunkView.getUint16(0, true);
    const chunkBlocks = chunkView.getUint32(4, true);
    const totalSz = chunkView.getUint32(8, true);
    offset += header.chunkHdrSz;

    const bodySize = totalSz - header.chunkHdrSz;
    const body =
      bodySize > 0 ? new Uint8Array(await file.slice(offset, offset + bodySize).arrayBuffer()) : new Uint8Array(0);
    offset += bodySize;

    switch (chunkType) {
      case CHUNK_RAW: {
        if (body.byteLength !== chunkBlocks * header.blkSz) {
          throw new AppError('UNSUPPORTED_OPERATION', 'Corrupt sparse RAW chunk.');
        }
        yield* append(body);
        break;
      }
      case CHUNK_FILL: {
        if (body.byteLength !== 4) throw new AppError('UNSUPPORTED_OPERATION', 'Corrupt sparse FILL chunk.');
        const size = chunkBlocks * header.blkSz;
        const block = new Uint8Array(size);
        new Uint32Array(block.buffer, block.byteOffset, size / 4).fill(new DataView(body.buffer, body.byteOffset, 4).getUint32(0, true));
        yield* append(block);
        break;
      }
      case CHUNK_DONT_CARE:
        yield* append(new Uint8Array(chunkBlocks * header.blkSz));
        break;
      case CHUNK_CRC32:
        break;
      default:
        throw new AppError('UNSUPPORTED_OPERATION', `Unsupported sparse chunk type 0x${chunkType.toString(16)}.`);
    }
  }

  if (pending.byteLength) yield pending;
}

async function* readRaw(file: File, chunkSize: number): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    yield new Uint8Array(await file.slice(offset, Math.min(offset + chunkSize, file.size)).arrayBuffer());
  }
}

export async function getFlashDownloadSize(file: File): Promise<number> {
  if (!(await isAndroidSparseImage(file))) return file.size;
  const header = await readSparseHeader(file);
  return header.totalBlks * header.blkSz;
}

export async function* iterateFlashData(file: File, chunkSize: number): AsyncGenerator<Uint8Array> {
  if (!(await isAndroidSparseImage(file))) {
    yield* readRaw(file, chunkSize);
    return;
  }
  yield* expandSparse(file, chunkSize);
}
