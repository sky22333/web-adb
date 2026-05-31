import { adbClient } from './adb-client';
import { runShellText } from './adb-shell';
import { LinuxFileType } from '@yume-chan/adb';
import { basename, assertSafeDeletePath } from '../utils/path';
import { shellQuote } from '../utils/shell-quote';
import { parseLsOutput, RemoteFile } from '../utils/ls-parser';

export { parseLsOutput, type RemoteFile };

export async function listDirectory(path: string): Promise<RemoteFile[]> {
  const normalized = path.endsWith('/') ? path : `${path}/`;
  try {
    const sync = await getSync();
    try {
      const entries = await sync.readdir(normalized);
      return entries
        .filter((entry: any) => entry.name !== '.' && entry.name !== '..')
        .map((entry: any) => ({
          typeChar: entry.type === LinuxFileType.Directory ? 'd' : '-',
          isDir: entry.type === LinuxFileType.Directory,
          size: Number(entry.size),
          time: new Date(Number(entry.mtime) * 1000).toLocaleString(),
          name: entry.name,
          path: `${normalized.replace(/\/+$/, '')}/${entry.name}`,
        }))
        .sort((a: RemoteFile, b: RemoteFile) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    } finally {
      await sync.dispose?.();
    }
  } catch {
    const output = await runShellText(`LC_ALL=C ls -la ${shellQuote(normalized)} 2>/dev/null || echo __LS_FAILED__`);
    if (output.includes('__LS_FAILED__')) throw new Error('目录不存在或没有访问权限。');
    return parseLsOutput(output, normalized);
  }
}

export function fileToReadableStream(file: File, onProgress?: (percent: number) => void): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    async pull(controller) {
      if (offset >= file.size) {
        controller.close();
        return;
      }
      const chunk = new Uint8Array(await file.slice(offset, offset + 1024 * 1024).arrayBuffer());
      offset += chunk.byteLength;
      onProgress?.(Math.min(100, (offset / file.size) * 100));
      controller.enqueue(chunk);
    },
  });
}

async function getSync(): Promise<any> {
  const adb = adbClient.ensure();
  if (typeof adb.sync === 'function') return adb.sync();
  if (adb.sync) return adb.sync;
  throw new Error('当前 ADB 实例不支持 sync 文件传输接口。');
}

export async function pushFile(file: File, remotePath: string, onProgress?: (percent: number) => void): Promise<void> {
  const sync = await getSync();
  try {
    const stream = fileToReadableStream(file, onProgress);
    if (sync.write) {
      await sync.write({
        filename: remotePath,
        file: stream,
        type: LinuxFileType.File,
        permission: 0o644,
        mtime: Math.floor(Date.now() / 1000),
      });
      return;
    }
    throw new Error('当前 sync 实例不支持 write。');
  } finally {
    await sync.dispose?.();
  }
}

export async function pullFile(remotePath: string): Promise<{ blob: Blob; filename: string }> {
  const sync = await getSync();
  try {
    const stream = sync.read ? sync.read(remotePath) : null;
    if (!stream) throw new Error('当前 sync 实例不支持 read。');
    const chunks: Uint8Array[] = [];
    await stream.pipeTo(
      new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      }),
    );
    return { blob: new Blob(chunks.map((chunk) => new Uint8Array(chunk).buffer as ArrayBuffer)), filename: basename(remotePath) };
  } finally {
    await sync.dispose?.();
  }
}

export async function deleteRemotePath(path: string, isDir: boolean): Promise<void> {
  assertSafeDeletePath(path);
  await runShellText(`${isDir ? 'rm -rf' : 'rm -f'} ${shellQuote(path)}`);
}
