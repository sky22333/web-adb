import { html } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead } from './widgets';
import { logcatController } from '../core/adb/adb-logcat';
import { notify, reportError } from '../core/ui/feedback';

const LEVELS: [string, string][] = [
  ['V', '全部'],
  ['D', '调试+'],
  ['I', '信息+'],
  ['W', '警告+'],
  ['E', '错误'],
];

@customElement('logcat-page')
export class LogcatPage extends StorePage {
  @state() private lines: string[] = logcatController.lines;
  @state() private running = logcatController.running;
  @query('#logcatFilter') private filter!: HTMLInputElement;
  @query('#logcatLevel') private level!: HTMLInputElement;

  private sync = () => {
    this.lines = logcatController.lines;
    this.running = logcatController.running;
    if (logcatController.error) reportError(new Error(logcatController.error));
  };

  connectedCallback(): void {
    super.connectedCallback();
    logcatController.addEventListener('change', this.sync);
  }

  disconnectedCallback(): void {
    logcatController.removeEventListener('change', this.sync);
    super.disconnectedCallback();
  }

  render() {
    return html`
      <section class="page">
        ${pageHead(
          '实时日志',
          '流式读取 logcat，切换页面不中断，停止时释放 socket。',
          html`
            <md-filled-button @click=${this.start} ?disabled=${this.running}>开始</md-filled-button>
            <md-outlined-button @click=${this.stop} ?disabled=${!this.running}>停止</md-outlined-button>
            <md-outlined-button @click=${() => logcatController.clear()}>清空</md-outlined-button>
          `,
        )}
        <div class="card">
          <div class="toolbar">
            <md-outlined-text-field id="logcatFilter" label="过滤关键字"></md-outlined-text-field>
            <md-outlined-select id="logcatLevel" value="I">
              ${LEVELS.map(
                ([level, label]) => html`<md-select-option value=${level}><div slot="headline">${label}</div></md-select-option>`,
              )}
            </md-outlined-select>
          </div>
          <pre class="log-panel tall">${this.lines.join('\n') || '等待开始...'}</pre>
        </div>
      </section>
    `;
  }

  private start = async () => {
    if (this.running) return;
    if (this.app.adb.status !== 'connected') return notify('请先连接 ADB。', 'warn');
    await logcatController.start(this.level?.value || 'I', this.filter?.value ?? '');
  };

  private stop = async () => {
    await logcatController.stop();
    notify('logcat 已停止', 'ok');
  };
}
