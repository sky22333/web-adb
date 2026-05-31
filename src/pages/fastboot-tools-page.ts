import { html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead } from './widgets';
import { executeFastboot } from './fastboot-actions';
import { notify, reportError } from '../core/ui/feedback';

const REBOOTS = ['reboot', 'reboot-bootloader', 'continue'];
const DANGERS = ['erase userdata', 'erase cache', 'flashing unlock', 'flashing lock'];

@customElement('fastboot-tools-page')
export class FastbootToolsPage extends StorePage {
  render() {
    return html`
      <section class="page">
        ${pageHead('Fastboot 常用操作', '危险命令会二次确认并记录运行日志。')}
        <div class="grid two">
          <div class="card">
            <div class="card-title">重启</div>
            <div class="actions">
              ${REBOOTS.map(
                (cmd) => html`<md-outlined-button @click=${() => this.run(cmd)}>${cmd}</md-outlined-button>`,
              )}
            </div>
          </div>
          <div class="card danger-zone">
            <div class="card-title">危险操作</div>
            <div class="actions">
              ${DANGERS.map((cmd) => html`<md-filled-button @click=${() => this.run(cmd)}>${cmd}</md-filled-button>`)}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private async run(command: string) {
    try {
      const res = await executeFastboot(command);
      if (res) notify(res.result || 'OK', 'ok');
    } catch (error) {
      reportError(error);
    }
  }
}
