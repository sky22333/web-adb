import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead } from './widgets';
import { fastbootClient } from '../core/fastboot/fastboot-client';
import { guessPartition, PARTITIONS } from '../core/fastboot/fastboot-protocol';
import { appStore } from '../core/state/app-store';
import { confirmDialog, notify, reportError } from '../core/ui/feedback';
import { formatSize } from '../core/utils/format';
import '../components/drop-zone';

@customElement('fastboot-single-page')
export class FastbootSinglePage extends StorePage {
  @state() private file?: File;
  @state() private partition = '';
  @state() private flashing = false;

  render() {
    return html`
      <section class="page">
        ${pageHead('Fastboot 手动刷入', '选择单个镜像，并明确指定目标分区。')}
        <div class="card">
          <drop-zone
            accept=".img,.bin"
            heading=${this.file?.name || '选择 .img / .bin 文件'}
            hint=${this.file ? formatSize(this.file.size) : '未选择文件'}
            @files=${this.pick}
          ></drop-zone>
          <md-outlined-text-field
            class="mono"
            label="目标分区"
            list="fb-partitions"
            .value=${this.partition}
            @input=${this.onPartitionInput}
          ></md-outlined-text-field>
          <datalist id="fb-partitions">
            ${PARTITIONS.map((part) => html`<option value=${part}></option>`)}
          </datalist>
          <md-filled-button class="full" @click=${this.flash} ?disabled=${this.flashing}>开始刷入</md-filled-button>
        </div>
      </section>
    `;
  }

  private pick = (event: CustomEvent<File[]>) => {
    this.file = event.detail[0];
    this.partition = this.file ? guessPartition(this.file.name) : '';
  };

  private onPartitionInput = (event: Event) => {
    this.partition = (event.target as HTMLInputElement).value.trim();
  };

  private flash = async () => {
    if (this.flashing) return;
    if (!this.file) return notify('请选择镜像文件。', 'warn');
    const partition = this.partition.trim();
    if (!partition) return notify('请输入目标分区。', 'warn');

    const ok = await confirmDialog({
      title: '确认 Fastboot 刷入',
      message: `确认刷入镜像到目标分区？\n\n文件：${this.file.name}\n大小：${formatSize(this.file.size)}\n分区：${partition}`,
      confirmLabel: '刷入',
      danger: true,
    });
    if (!ok) return;

    const task = appStore.task(`刷入 ${this.file.name}`);
    try {
      this.flashing = true;
      await fastbootClient.flash(this.file, partition, this.app.settings.fastbootChunkSize, (percent) =>
        task.update(percent, `刷入 ${partition}`),
      );
      task.done('刷入完成');
      notify('刷入完成', 'ok');
    } catch (error) {
      task.fail('刷入失败');
      reportError(error);
    } finally {
      this.flashing = false;
    }
  };
}
