import { html, nothing } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead } from './widgets';
import { appStore, ThemeMode } from '../core/state/app-store';
import { notify } from '../core/ui/feedback';
import { formatVid } from '../core/utils/format';

const CHUNK_SIZES: [number, string][] = [
  [1048576, '1 MB'],
  [524288, '512 KB'],
  [262144, '256 KB'],
];

@customElement('settings-page')
export class SettingsPage extends StorePage {
  @query('#vidInput') private vidInput!: HTMLInputElement;
  @query('#themeMode') private themeMode!: HTMLInputElement;
  @query('#chunkSize') private chunkSize!: HTMLInputElement;
  @query('#maxLogs') private maxLogs!: HTMLInputElement;

  render() {
    const settings = this.app.settings;
    return html`
      <section class="page">
        ${pageHead('设置', 'USB VID、Fastboot 传输块和日志限制。')}
        <div class="grid two">
          <div class="card">
            <div class="card-title">USB VID</div>
            <div class="vid-list">${this.renderVids()}</div>
            <div class="toolbar">
              <md-outlined-text-field
                id="vidInput"
                label="例如 0x1234"
                @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.addVid()}
              ></md-outlined-text-field>
              <md-filled-button @click=${this.addVid}>添加</md-filled-button>
            </div>
          </div>
          <div class="card">
            <div class="field-stack">
              <label>外观主题</label>
              <md-outlined-select id="themeMode" .value=${settings.theme} @change=${this.applyTheme}>
                <md-select-option value="auto"><div slot="headline">跟随系统</div></md-select-option>
                <md-select-option value="light"><div slot="headline">浅色</div></md-select-option>
                <md-select-option value="dark"><div slot="headline">深色</div></md-select-option>
              </md-outlined-select>
              <label>Fastboot 传输块</label>
              <md-outlined-select id="chunkSize" .value=${String(settings.fastbootChunkSize)} @change=${this.applyChunk}>
                ${CHUNK_SIZES.map(
                  ([value, label]) =>
                    html`<md-select-option value=${String(value)}><div slot="headline">${label}</div></md-select-option>`,
                )}
              </md-outlined-select>
              <label>最大日志行数</label>
              <md-outlined-select id="maxLogs" .value=${String(settings.maxLogLines)} @change=${this.applyMaxLogs}>
                ${[600, 1000, 2000].map(
                  (n) => html`<md-select-option value=${String(n)}><div slot="headline">${n}</div></md-select-option>`,
                )}
              </md-outlined-select>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private renderVids() {
    const custom = this.app.settings.customVendorIds;
    return html`${appStore.allVendorIds().map(
      (vid) => html`<div class="vid">
        <span class="mono">${formatVid(vid)}</span>
        <small>${custom.includes(vid) ? '自定义' : '内置'}</small>
        ${custom.includes(vid) ? html`<button @click=${() => this.removeVid(vid)}>删除</button>` : nothing}
      </div>`,
    )}`;
  }

  private addVid = () => {
    const raw = this.vidInput.value.trim();
    const value = parseInt(raw.replace(/^0x/i, ''), 16);
    if (!Number.isFinite(value) || value <= 0 || value > 0xffff) return notify('VID 格式无效。', 'warn');
    if (appStore.allVendorIds().includes(value)) return notify('VID 已存在。', 'warn');
    appStore.updateSettings({ customVendorIds: [...this.app.settings.customVendorIds, value] });
    this.vidInput.value = '';
  };

  private removeVid(value: number) {
    appStore.updateSettings({ customVendorIds: this.app.settings.customVendorIds.filter((vid) => vid !== value) });
  }

  private applyTheme = () => appStore.updateSettings({ theme: (this.themeMode.value || 'auto') as ThemeMode });
  private applyChunk = () => appStore.updateSettings({ fastbootChunkSize: Number(this.chunkSize.value) });
  private applyMaxLogs = () => appStore.updateSettings({ maxLogLines: Number(this.maxLogs.value) });
}
