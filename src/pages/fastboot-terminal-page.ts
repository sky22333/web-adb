import { html } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead } from './widgets';
import { executeFastboot } from './fastboot-actions';
import { reportError } from '../core/ui/feedback';
import { toAppError } from '../core/utils/errors';

const PRESETS = ['getvar all', 'getvar product', 'getvar unlocked', 'getvar current-slot', 'flashing unlock', 'flashing lock'];

@customElement('fastboot-terminal-page')
export class FastbootTerminalPage extends StorePage {
  @state() private output = '等待命令...';
  @query('#fbCommand') private input!: HTMLInputElement;

  render() {
    return html`
      <section class="page">
        ${pageHead('Fastboot 终端', '发送 Fastboot 原始命令并查看响应。')}
        <div class="card">
          <div class="toolbar">
            <md-outlined-text-field
              id="fbCommand"
              class="mono"
              value="getvar all"
              label="Fastboot 命令"
              @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.run(this.input.value)}
            ></md-outlined-text-field>
            <md-filled-button @click=${() => this.run(this.input.value)}>执行</md-filled-button>
            <md-outlined-button @click=${() => (this.output = '')}>清空</md-outlined-button>
          </div>
          <div class="chips">
            ${PRESETS.map(
              (cmd) =>
                html`<button class=${cmd.includes('flashing') ? 'chip danger' : 'chip'} @click=${() => this.run(cmd)}>
                  ${cmd}
                </button>`,
            )}
          </div>
          <pre class="log-panel tall">${this.output}</pre>
        </div>
      </section>
    `;
  }

  private async run(command: string) {
    const trimmed = command.trim();
    if (!trimmed) return;
    this.output = `> ${trimmed}\n`;
    try {
      const res = await executeFastboot(trimmed);
      if (!res) {
        this.output = '等待命令...';
        return;
      }
      if (res.normalized !== trimmed) this.output += `# protocol: ${res.normalized}\n`;
      this.output += res.result || 'OK';
    } catch (error) {
      this.output += `错误：${toAppError(error).message}`;
      reportError(error);
    }
  }
}
