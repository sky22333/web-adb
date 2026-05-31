import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead, empty } from './widgets';
import { fastbootClient } from '../core/fastboot/fastboot-client';
import { guessPartition } from '../core/fastboot/fastboot-protocol';
import { appStore } from '../core/state/app-store';
import { notify, reportError } from '../core/ui/feedback';
import { formatSize } from '../core/utils/format';
import '../components/drop-zone';

interface QueueItem {
  id: string;
  file: File;
  partition: string;
  status: 'waiting' | 'flashing' | 'done' | 'failed';
}

@customElement('fastboot-queue-page')
export class FastbootQueuePage extends StorePage {
  @state() private queue: QueueItem[] = [];

  render() {
    return html`
      <section class="page">
        ${pageHead(
          'Fastboot 批量刷入',
          '多镜像队列、自动猜测分区、顺序刷入和整体进度。',
          html`
            <md-filled-button @click=${this.start}>开始队列</md-filled-button>
            <md-outlined-button @click=${() => (this.queue = [])}>清空</md-outlined-button>
          `,
        )}
        <div class="card">
          <drop-zone
            multiple
            accept=".img,.bin"
            heading="选择 .img / .bin 文件"
            hint="支持多选，可手动调整分区名"
            @files=${this.add}
          ></drop-zone>
          ${this.queue.length
            ? html`<div class="queue">${this.queue.map((item, index) => this.row(item, index))}</div>`
            : empty('队列为空')}
        </div>
      </section>
    `;
  }

  private row(item: QueueItem, index: number) {
    return html`<div class=${`queue-row ${item.status}`}>
      <span class="mono">${item.file.name}<small>${formatSize(item.file.size)}</small></span>
      <input
        .value=${item.partition}
        @change=${(e: Event) => (item.partition = (e.target as HTMLInputElement).value.trim())}
      />
      <b>${item.status}</b>
      <button @click=${() => this.move(index)} ?disabled=${index === 0}>↑</button>
      <button class="danger-text" @click=${() => (this.queue = this.queue.filter((row) => row.id !== item.id))}>
        删除
      </button>
    </div>`;
  }

  private add = (event: CustomEvent<File[]>) => {
    this.queue = [
      ...this.queue,
      ...event.detail.map((file) => ({
        id: crypto.randomUUID(),
        file,
        partition: guessPartition(file.name),
        status: 'waiting' as const,
      })),
    ];
  };

  private move(index: number) {
    if (index <= 0) return;
    const queue = [...this.queue];
    [queue[index - 1], queue[index]] = [queue[index], queue[index - 1]];
    this.queue = queue;
  }

  private start = async () => {
    if (!this.queue.length) return notify('队列为空。', 'warn');
    const bad = this.queue.find((item) => !item.partition);
    if (bad) return notify(`请设置分区：${bad.file.name}`, 'warn');
    const task = appStore.task('Fastboot 队列刷入');
    try {
      for (let i = 0; i < this.queue.length; i += 1) {
        const item = this.queue[i];
        item.status = 'flashing';
        this.requestUpdate();
        await fastbootClient.flash(item.file, item.partition, this.app.settings.fastbootChunkSize, (percent) =>
          task.update(((i + percent / 100) / this.queue.length) * 100, `刷入 ${item.file.name}`),
        );
        item.status = 'done';
        this.requestUpdate();
      }
      task.done('队列刷入完成');
      notify('队列刷入完成', 'ok');
    } catch (error) {
      const failed = this.queue.find((item) => item.status === 'flashing');
      if (failed) failed.status = 'failed';
      this.requestUpdate();
      task.fail('队列刷入失败');
      reportError(error);
    }
  };
}
