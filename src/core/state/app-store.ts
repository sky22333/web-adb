import { AppError } from '../utils/errors';
import { DEFAULT_VENDOR_IDS } from '../usb/vendor-ids';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error';
export type TaskStatus = 'running' | 'done' | 'failed' | 'canceled';

export interface LogEntry {
  id: string;
  time: number;
  level: 'info' | 'ok' | 'warn' | 'err';
  message: string;
}

export interface TaskState {
  id: string;
  label: string;
  status: TaskStatus;
  progress: number;
}

export interface AppSettings {
  customVendorIds: number[];
  fastbootChunkSize: number;
  maxLogLines: number;
  theme: 'light' | 'dark';
}

export interface AppState {
  activePage: string;
  adb: { status: ConnectionStatus; serial?: string; model?: string; android?: string; error?: AppError };
  fastboot: { status: ConnectionStatus; productName?: string; vendorId?: number; productId?: number; error?: AppError };
  settings: AppSettings;
  tasks: TaskState[];
  logs: LogEntry[];
}

const settingsKey = 'adb-toolbox-settings';

function loadSettings(): AppSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}') as Partial<AppSettings>;
    return {
      customVendorIds: saved.customVendorIds ?? [],
      fastbootChunkSize: saved.fastbootChunkSize ?? 1024 * 1024,
      maxLogLines: saved.maxLogLines ?? 1000,
      theme: saved.theme ?? 'light',
    };
  } catch {
    return { customVendorIds: [], fastbootChunkSize: 1024 * 1024, maxLogLines: 1000, theme: 'light' };
  }
}

export class AppStore extends EventTarget {
  state: AppState = {
    activePage: 'overview',
    adb: { status: 'idle' },
    fastboot: { status: 'idle' },
    settings: loadSettings(),
    tasks: [],
    logs: [],
  };

  emit(): void {
    this.dispatchEvent(new Event('change'));
  }

  setPage(page: string): void {
    this.state = { ...this.state, activePage: page };
    this.emit();
  }

  patch(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  updateSettings(settings: Partial<AppSettings>): void {
    this.state = { ...this.state, settings: { ...this.state.settings, ...settings } };
    localStorage.setItem(settingsKey, JSON.stringify(this.state.settings));
    this.emit();
  }

  allVendorIds(): number[] {
    return [...DEFAULT_VENDOR_IDS, ...this.state.settings.customVendorIds];
  }

  log(message: string, level: LogEntry['level'] = 'info'): void {
    const logs = [
      ...this.state.logs,
      { id: crypto.randomUUID(), time: Date.now(), level, message },
    ].slice(-this.state.settings.maxLogLines);
    this.state = { ...this.state, logs };
    this.emit();
  }

  task(label: string): TaskHandle {
    const id = crypto.randomUUID();
    this.state = { ...this.state, tasks: [...this.state.tasks, { id, label, status: 'running', progress: 0 }] };
    this.emit();
    return {
      id,
      update: (progress, nextLabel = label) => this.updateTask(id, { progress, label: nextLabel }),
      done: (nextLabel = label) => this.updateTask(id, { progress: 100, label: nextLabel, status: 'done' }),
      fail: (nextLabel = label) => this.updateTask(id, { label: nextLabel, status: 'failed' }),
      cancel: (nextLabel = label) => this.updateTask(id, { label: nextLabel, status: 'canceled' }),
    };
  }

  private updateTask(id: string, patch: Partial<TaskState>): void {
    const tasks = this.state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
    this.state = { ...this.state, tasks: tasks.slice(-30) };
    this.emit();
  }
}

export interface TaskHandle {
  id: string;
  update(progress: number, label?: string): void;
  done(label?: string): void;
  fail(label?: string): void;
  cancel(label?: string): void;
}

export const appStore = new AppStore();
