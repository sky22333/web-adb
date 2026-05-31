import { adbClient } from './adb-client';
import { AppError } from '../utils/errors';

const decoder = new TextDecoder();

export interface ShellOptions {
  exec?: boolean;
  binary?: boolean;
  signal?: AbortSignal;
  onChunk?: (chunk: Uint8Array, total: number) => void;
}

export async function readReadableStream(readable: ReadableStream<Uint8Array>, options: ShellOptions = {}) {
  const reader = readable.getReader();
  const chunks: Uint8Array[] = [];
  let text = '';
  let total = 0;
  try {
    while (true) {
      if (options.signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        throw new AppError('TRANSFER_ABORTED', '操作已取消。');
      }
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      options.onChunk?.(value, total);
      if (options.binary) chunks.push(value);
      else text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  if (!options.binary) return text + decoder.decode();
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function runShell(command: string, options: ShellOptions = {}): Promise<string | Uint8Array> {
  if (!options.binary) {
    const shellProtocol = adbClient.adb?.subprocess?.shellProtocol;
    if (shellProtocol?.spawnWaitText) {
      const result = await shellProtocol.spawnWaitText(command);
      const output = [result.stdout, result.stderr].filter(Boolean).join(result.stderr ? '\n' : '');
      if (result.exitCode !== 0 && !output) throw new AppError('ADB_SOCKET_FAILED', `命令退出码：${result.exitCode}`);
      return output;
    }
    const noneProtocol = adbClient.adb?.subprocess?.noneProtocol;
    if (noneProtocol?.spawnWaitText) return noneProtocol.spawnWaitText(command);
  }

  const socket = await adbClient.socket(`${options.exec ? 'exec' : 'shell'}:${command}`);
  try {
    if (socket.readable) return readReadableStream(socket.readable, options);
    if (!socket.read) throw new AppError('ADB_SOCKET_FAILED', '未知 ADB socket 读取接口。');

    const chunks: Uint8Array[] = [];
    let text = '';
    let total = 0;
    while (true) {
      if (options.signal?.aborted) throw new AppError('TRANSFER_ABORTED', '操作已取消。');
      const chunk = await socket.read();
      if (!chunk) break;
      total += chunk.byteLength;
      options.onChunk?.(chunk, total);
      if (options.binary) chunks.push(chunk);
      else text += decoder.decode(chunk, { stream: true });
    }
    if (!options.binary) return text + decoder.decode();
    const output = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    });
    return output;
  } finally {
    await socket.close?.().catch(() => undefined);
  }
}

export async function runShellText(command: string, options: ShellOptions = {}): Promise<string> {
  return String(await runShell(command, options));
}

export async function runExecBinary(command: string | readonly string[]): Promise<Uint8Array> {
  const noneProtocol = adbClient.adb?.subprocess?.noneProtocol;
  if (noneProtocol?.spawnWait) return noneProtocol.spawnWait(command);
  const fallbackCommand = Array.isArray(command) ? command.join(' ') : String(command);
  return (await runShell(fallbackCommand, { exec: true, binary: true })) as Uint8Array;
}
