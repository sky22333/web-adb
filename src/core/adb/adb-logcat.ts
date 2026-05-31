import { adbClient } from './adb-client';
import { readReadableStream } from './adb-shell';

const decoder = new TextDecoder();

export class LogcatSession {
  private abort = new AbortController();
  private socket: any = null;
  private process: any = null;

  async start(level: string, keyword: string, onLine: (line: string) => void): Promise<void> {
    const lower = keyword.trim().toLowerCase();
    const noneProtocol = adbClient.adb?.subprocess?.noneProtocol;
    if (noneProtocol?.spawn) {
      this.process = await noneProtocol.spawn(['logcat', '-v', 'time', `*:${level}`], this.abort.signal);
      await readReadableStream(this.process.output, {
        signal: this.abort.signal,
        onChunk(chunk) {
          const text = decoder.decode(chunk, { stream: true });
          text
            .split(/\r?\n/)
            .filter((line) => line && (!lower || line.toLowerCase().includes(lower)))
            .forEach(onLine);
        },
      });
      return;
    }

    this.socket = await adbClient.socket(`shell:logcat -v time *:${level}`);
    await readReadableStream(this.socket.readable, {
      signal: this.abort.signal,
      onChunk(chunk) {
        const text = decoder.decode(chunk, { stream: true });
        text
          .split(/\r?\n/)
          .filter((line) => line && (!lower || line.toLowerCase().includes(lower)))
          .forEach(onLine);
      },
    });
  }

  async stop(): Promise<void> {
    this.abort.abort();
    await this.process?.kill?.();
    await this.socket?.close?.().catch(() => undefined);
  }
}
