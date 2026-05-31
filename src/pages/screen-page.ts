import { html } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead, empty } from './widgets';
import { takeScreenshot } from '../core/adb/adb-screen';
import { runShellText } from '../core/adb/adb-shell';
import { appStore } from '../core/state/app-store';
import { notify, reportError } from '../core/ui/feedback';
import { downloadBlob } from '../core/utils/download';

const KEYS: [string, string][] = [
  ['3', 'Home'],
  ['4', '返回'],
  ['187', '最近任务'],
  ['82', '菜单'],
  ['19', '上'],
  ['20', '下'],
  ['21', '左'],
  ['22', '右'],
  ['23', '确认'],
  ['24', '音量+'],
  ['25', '音量-'],
  ['26', '电源'],
];

@customElement('screen-page')
export class ScreenPage extends StorePage {
  @state() private screenshotUrl?: string;
  @query('#customKey') private customKey!: HTMLInputElement;

  disconnectedCallback(): void {
    if (this.screenshotUrl) URL.revokeObjectURL(this.screenshotUrl);
    super.disconnectedCallback();
  }

  render() {
    return html`
      <section class="page">
        ${pageHead(
          '截图与按键',
          '截图优先使用二进制 exec 通道，按键使用 Android keyevent。',
          html`
            <md-filled-button @click=${this.capture}>获取截图</md-filled-button>
            <md-outlined-button @click=${this.save} ?disabled=${!this.screenshotUrl}>保存图片</md-outlined-button>
          `,
        )}
        <div class="grid two">
          <div class="card screen-card">
            ${this.screenshotUrl ? html`<img src=${this.screenshotUrl} alt="设备截图" />` : empty('暂无截图')}
          </div>
          <div class="card">
            <div class="card-title">常用按键</div>
            <div class="key-grid">
              ${KEYS.map(([key, label]) => html`<button class="key" @click=${() => this.sendKey(key)}>${label}</button>`)}
            </div>
            <div class="toolbar">
              <md-outlined-text-field
                id="customKey"
                label="自定义 keyevent"
                @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.sendKey(this.customKey.value)}
              ></md-outlined-text-field>
              <md-filled-button @click=${() => this.sendKey(this.customKey.value)}>发送</md-filled-button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private capture = async () => {
    const task = appStore.task('获取截图');
    try {
      const result = await takeScreenshot();
      const blob = result.blob ?? (await canvasToBlob(result.canvas));
      if (!blob) throw new Error('截图数据为空。');
      if (this.screenshotUrl) URL.revokeObjectURL(this.screenshotUrl);
      this.screenshotUrl = URL.createObjectURL(blob);
      task.done('截图完成');
    } catch (error) {
      task.fail('截图失败');
      reportError(error);
    }
  };

  private save = () => {
    if (this.screenshotUrl) downloadBlob(this.screenshotUrl, `screenshot-${Date.now()}.png`);
  };

  private async sendKey(key: string) {
    const code = Number(key.trim());
    if (!Number.isFinite(code) || !key.trim()) return notify('keyevent 必须是数字。', 'warn');
    try {
      await runShellText(`input keyevent ${code}`);
      appStore.log(`keyevent ${code}`, 'ok');
    } catch (error) {
      reportError(error);
    }
  }
}

function canvasToBlob(canvas?: HTMLCanvasElement): Promise<Blob | null> {
  if (!canvas) return Promise.resolve(null);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
