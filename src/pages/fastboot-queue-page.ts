import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead, empty } from './widgets';
import { fastbootClient } from '../core/fastboot/fastboot-client';
import { guessPartition } from '../core/fastboot/fastboot-protocol';
import { appStore } from '../core/state/app-store';
import { confirmDialog, notify, reportError } from '../core/ui/feedback';
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
  @state() private running = false;

  render() {
    return html`
      <section class="page">
        ${pageHead(
          'Fastboot 批量刷入',
          '按顺序刷入多个小镜像。添加文件时会根据文件名预填分区：去掉 .img / .bin 后与内置分区名完全一致才自动填入（如 boot.img → boot）；带 _a / _b 后缀时会再尝试去掉槽位后缀（如 boot_a.img → boot）。不做子串猜测，无法匹配时留空，需手动填写。开始前请逐项核对。',
          html`
            <md-filled-button @click=${this.start} ?disabled=${this.running}>开始队列</md-filled-button>
            <md-outlined-button @click=${this.clear} ?disabled=${this.running}>清空</md-outlined-button>
          `,
        )}
        <div class="card">
          <drop-zone
            multiple
            accept=".img,.bin"
            heading="选择 .img / .bin 文件"
            hint="每个镜像都必须明确目标分区"
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
        @change=${(event: Event) => (item.partition = (event.target as HTMLInputElement).value.trim())}
        ?disabled=${this.running}
      />
      <b>${item.status}</b>
      <button @click=${() => this.move(index)} ?disabled=${this.running || index === 0}>上移</button>
      <button class="danger-text" @click=${() => this.removeItem(item.id)} ?disabled=${this.running}>移除</button>
    </div>`;
  }

  private add = (event: CustomEvent<File[]>) => {
    if (this.running) return;
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

  private clear = () => {
    if (!this.running) this.queue = [];
  };

  private move(index: number) {
    if (this.running || index <= 0) return;
    const queue = [...this.queue];
    [queue[index - 1], queue[index]] = [queue[index], queue[index - 1]];
    this.queue = queue;
  }

  private removeItem(id: string) {
    if (!this.running) this.queue = this.queue.filter((row) => row.id !== id);
  }

  private start = async () => {
    if (this.running) return;
    if (!this.queue.length) return notify('队列为空。', 'warn');
    const bad = this.queue.find((item) => !item.partition);
    if (bad) return notify(`请设置目标分区：${bad.file.name}`, 'warn');

    const summary = this.queue
      .map((item, index) => `${index + 1}. ${item.file.name} (${formatSize(item.file.size)}) -> ${item.partition}`)
      .join('\n');
    const ok = await confirmDialog({
      title: '确认 Fastboot 队列',
      message: `确认按顺序刷入这些镜像？\n\n${summary}`,
      confirmLabel: '刷入队列',
      danger: true,
    });
    if (!ok) return;

    const task = appStore.task('Fastboot 队列刷入');
    try {
      this.running = true;
      this.queue = this.queue.map((item) => ({ ...item, status: 'waiting' }));
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
      task.done('Fastboot 队列完成');
      notify('Fastboot 队列完成', 'ok');
    } catch (error) {
      const failed = this.queue.find((item) => item.status === 'flashing');
      if (failed) failed.status = 'failed';
      this.requestUpdate();
      task.fail('Fastboot 队列失败');
      reportError(error);
    } finally {
      this.running = false;
    }
  };
}
