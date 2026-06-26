import { html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead } from './widgets';
import { appStore } from '../core/state/app-store';
import { notify } from '../core/ui/feedback';

@customElement('logs-page')
export class LogsPage extends StorePage {
  render() {
    return html`
      <section class="page">
        ${pageHead(
          '运行日志',
          '全局操作日志和诊断信息。',
          html`
            <md-outlined-button @click=${() => appStore.patch({ logs: [] })}>清空</md-outlined-button>
            <md-filled-button @click=${this.copy}>复制</md-filled-button>
          `,
        )}
        <div class="card">
          <div class="log-panel tall">
            <div class="log-lines">
              ${this.app.logs.map(
                (entry) =>
                  html`<span class="ln ${entry.level}"
                    >[${new Date(entry.time).toLocaleTimeString()}] ${entry.message}</span
                  >`,
              )}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private copy = async () => {
    await navigator.clipboard.writeText(
      this.app.logs.map((l) => `[${new Date(l.time).toISOString()}] ${l.message}`).join('\n'),
    );
    notify('日志已复制', 'ok');
  };
}
