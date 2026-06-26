import { html } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead } from './widgets';
import { runShellText } from '../core/adb/adb-shell';
import { appStore } from '../core/state/app-store';
import { reportError } from '../core/ui/feedback';

const PRESETS = ['getprop ro.product.model', 'wm size; wm density', 'dumpsys battery', 'ip addr', 'df -h'];

@customElement('shell-page')
export class ShellPage extends StorePage {
  @state() private output = '等待命令...';
  @query('#shellInput') private input!: HTMLInputElement;

  render() {
    return html`
      <section class="page">
        ${pageHead('ADB Shell', '执行单条命令，并输出执行结果。')}
        <div class="card">
          <div class="toolbar">
            <md-outlined-text-field
              id="shellInput"
              class="mono"
              value="getprop ro.product.model"
              label="Shell 命令"
              @keydown=${this.onKeydown}
            ></md-outlined-text-field>
            <md-filled-button @click=${() => this.run(this.input.value)}>执行</md-filled-button>
            <md-outlined-button @click=${() => (this.output = '')}>清空</md-outlined-button>
          </div>
          <div class="chips">
            ${PRESETS.map((cmd) => html`<button class="chip" @click=${() => this.run(cmd)}>${cmd}</button>`)}
          </div>
          <pre class="log-panel tall">${this.output}</pre>
        </div>
      </section>
    `;
  }

  private onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') this.run(this.input.value);
  };

  private async run(command: string) {
    const trimmed = command.trim();
    if (!trimmed) return;
    this.output = `> ${trimmed}\n`;
    const task = appStore.task(`执行 ADB：${trimmed}`);
    try {
      this.output += await runShellText(trimmed);
      task.done('ADB 命令完成');
      appStore.log(`ADB shell: ${trimmed}`, 'ok');
    } catch (error) {
      task.fail('ADB 命令失败');
      reportError(error);
    }
  }
}
