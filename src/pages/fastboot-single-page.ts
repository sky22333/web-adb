import { html } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead } from './widgets';
import { fastbootClient } from '../core/fastboot/fastboot-client';
import { guessPartition, PARTITIONS } from '../core/fastboot/fastboot-protocol';
import { appStore } from '../core/state/app-store';
import { notify, reportError } from '../core/ui/feedback';
import { formatSize } from '../core/utils/format';
import '../components/drop-zone';

@customElement('fastboot-single-page')
export class FastbootSinglePage extends StorePage {
  @state() private file?: File;
  @query('#singlePartition') private partitionSelect!: HTMLInputElement;
  @query('#singleCustom') private customInput!: HTMLInputElement;

  render() {
    return html`
      <section class="page">
        ${pageHead('Fastboot 手动刷入', '选择单个镜像并指定目标分区。')}
        <div class="card">
          <drop-zone
            accept=".img,.bin"
            heading=${this.file?.name || '选择 .img / .bin 文件'}
            hint=${this.file ? formatSize(this.file.size) : '未选择文件'}
            @files=${this.pick}
          ></drop-zone>
          <div class="grid two">
            <md-outlined-select id="singlePartition" value="boot">
              ${PARTITIONS.map(
                (part) =>
                  html`<md-select-option value=${part} ?selected=${part === 'boot'}
                    ><div slot="headline">${part}</div></md-select-option
                  >`,
              )}
            </md-outlined-select>
            <md-outlined-text-field id="singleCustom" class="mono" label="自定义分区"></md-outlined-text-field>
          </div>
          <md-filled-button class="full" @click=${this.flash}>开始刷入</md-filled-button>
        </div>
      </section>
    `;
  }

  private pick = (event: CustomEvent<File[]>) => {
    this.file = event.detail[0];
    if (this.file) this.customInput.value = guessPartition(this.file.name);
  };

  private flash = async () => {
    if (!this.file) return notify('请选择镜像文件。', 'warn');
    const partition = this.customInput.value.trim() || this.partitionSelect.value || 'boot';
    const task = appStore.task(`刷入 ${this.file.name}`);
    try {
      await fastbootClient.flash(this.file, partition, this.app.settings.fastbootChunkSize, (percent) =>
        task.update(percent, `刷入 ${partition}`),
      );
      task.done('刷入完成');
      notify('刷入完成', 'ok');
    } catch (error) {
      task.fail('刷入失败');
      reportError(error);
    }
  };
}
