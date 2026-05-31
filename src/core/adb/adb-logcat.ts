import { adbClient } from './adb-client';
import { readReadableStream } from './adb-shell';
import { appStore } from '../state/app-store';
import { toAppError } from '../utils/errors';

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

class LogcatController extends EventTarget {
  lines: string[] = [];
  running = false;
  error?: string;
  private session?: LogcatSession;
  private pending: string[] = [];
  private flushScheduled = false;

  async start(level: string, keyword: string): Promise<void> {
    if (this.running) return;
    this.lines = [];
    this.error = undefined;
    this.running = true;
    this.session = new LogcatSession();
    this.emit();
    try {
      await this.session.start(level, keyword, (line) => this.push(line));
    } catch (error) {
      this.error = toAppError(error).message;
    } finally {
      await this.stop();
    }
  }

  async stop(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    this.running = false;
    await session?.stop();
    this.emit();
  }

  clear(): void {
    this.lines = [];
    this.emit();
  }

  private push(line: string): void {
    this.pending.push(line);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    requestAnimationFrame(() => {
      this.flushScheduled = false;
      const max = appStore.state.settings.maxLogLines;
      this.lines = [...this.lines, ...this.pending].slice(-max);
      this.pending = [];
      this.emit();
    });
  }

  private emit(): void {
    this.dispatchEvent(new Event('change'));
  }
}

export const logcatController = new LogcatController();
