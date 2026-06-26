import { html } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead, empty } from './widgets';
import { deleteRemotePath, listDirectory, pullFile, pushFile, RemoteFile } from '../core/adb/adb-files';
import { runShellText } from '../core/adb/adb-shell';
import { appStore } from '../core/state/app-store';
import { confirmDialog, notify, reportError } from '../core/ui/feedback';
import { formatSize } from '../core/utils/format';
import { downloadBlob } from '../core/utils/download';
import { dirname, joinPath } from '../core/utils/path';
import { shellQuote } from '../core/utils/shell-quote';
import '../components/drop-zone';

@customElement('files-page')
export class FilesPage extends StorePage {
  @state() private currentPath = '/sdcard/';
  @state() private rows: RemoteFile[] = [];
  @query('#pathInput') private pathInput!: HTMLInputElement;
  @query('#mkdirInput') private mkdirInput!: HTMLInputElement;
  @query('#downloadInput') private downloadInput!: HTMLInputElement;

  render() {
    return html`
      <section class="page">
        ${pageHead('文件管理', '浏览、上传、下载、删除和新建目录。')}
        <div class="card">
          <div class="toolbar">
            <md-outlined-button @click=${() => this.open('/sdcard/')}>/sdcard</md-outlined-button>
            <md-outlined-button @click=${() => this.open(dirname(this.currentPath))}>上级</md-outlined-button>
            <md-outlined-text-field
              id="pathInput"
              class="mono"
              label="路径"
              value=${this.currentPath}
              @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.open(this.pathInput.value || '/sdcard/')}
            ></md-outlined-text-field>
            <md-outlined-button @click=${() => this.open(this.pathInput.value || '/sdcard/')}>打开</md-outlined-button>
            <md-outlined-button @click=${() => this.open(this.currentPath)}>刷新</md-outlined-button>
            <md-outlined-button @click=${() => this.copy(this.currentPath, '当前路径已复制')}>复制路径</md-outlined-button>
          </div>
        </div>
        <div class="grid two">
          <div class="card">
            <div class="card-title">上传文件</div>
            <drop-zone multiple heading="上传到当前目录" hint=${this.currentPath} @files=${this.upload}></drop-zone>
          </div>
          <div class="card">
            <div class="card-title">快捷操作</div>
            <div class="toolbar">
              <md-outlined-text-field id="mkdirInput" label="新建目录名"></md-outlined-text-field>
              <md-outlined-button @click=${this.mkdir}>新建</md-outlined-button>
            </div>
            <div class="toolbar">
              <md-outlined-text-field id="downloadInput" class="mono" label="直接下载路径"></md-outlined-text-field>
              <md-outlined-button @click=${() => this.download(this.downloadInput.value)}>下载</md-outlined-button>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title mono">${this.currentPath}</div>
          ${this.rows.length
            ? html`<div class="table">${this.rows.map((row) => this.row(row))}</div>`
            : empty('等待打开目录')}
        </div>
      </section>
    `;
  }

  private row(row: RemoteFile) {
    return html`<div class="table-row file">
      <button
        class="file-name"
        @click=${() => (row.isDir ? this.open(`${row.path}/`) : (this.downloadInput.value = row.path))}
      >
        <md-icon>${row.isDir ? 'folder' : 'description'}</md-icon>${row.name}
      </button>
      <span>${row.isDir ? '-' : formatSize(row.size)}</span><span>${row.time}</span>
      <div>
        ${row.isDir
          ? html`<button @click=${() => this.open(`${row.path}/`)}>打开</button>`
          : html`<button @click=${() => this.download(row.path)}>下载</button>`}
        <button @click=${() => this.copy(row.path, '路径已复制')}>复制路径</button>
        <button class="danger-text" @click=${() => this.deleteFile(row)}>删除</button>
      </div>
    </div>`;
  }

  private open = async (path: string) => {
    try {
      this.currentPath = path.endsWith('/') ? path : `${path}/`;
      this.rows = await listDirectory(this.currentPath);
      appStore.log(`打开目录：${this.currentPath}`, 'ok');
    } catch (error) {
      reportError(error);
    }
  };

  private upload = async (event: CustomEvent<File[]>) => {
    const files = event.detail;
    const task = appStore.task(`上传 ${files.length} 个文件`);
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        await pushFile(file, joinPath(this.currentPath, file.name), (percent) =>
          task.update(((i + percent / 100) / files.length) * 100, `上传 ${file.name}`),
        );
      }
      task.done('上传完成');
      notify('上传完成', 'ok');
      await this.open(this.currentPath);
    } catch (error) {
      task.fail('上传失败');
      reportError(error);
    }
  };

  private mkdir = async () => {
    const name = this.mkdirInput.value.trim();
    if (!name) return notify('请输入目录名。', 'warn');
    try {
      await runShellText(`mkdir -p ${shellQuote(joinPath(this.currentPath, name))}`);
      this.mkdirInput.value = '';
      await this.open(this.currentPath);
    } catch (error) {
      reportError(error);
    }
  };

  private async download(path: string) {
    const target = path.trim();
    if (!target) return notify('请输入远程路径。', 'warn');
    const task = appStore.task(`下载 ${target}`);
    try {
      const { blob, filename } = await pullFile(target);
      downloadBlob(blob, filename);
      task.done('下载完成');
      appStore.log(`文件已下载：${target} (${formatSize(blob.size)})`, 'ok');
    } catch (error) {
      task.fail('下载失败');
      reportError(error);
    }
  }

  private async deleteFile(row: RemoteFile) {
    if (!(await confirmDialog({ message: `确认删除 ${row.path}？`, danger: true }))) return;
    try {
      await deleteRemotePath(row.path, row.isDir);
      notify('删除完成', 'ok');
      await this.open(this.currentPath);
    } catch (error) {
      reportError(error);
    }
  }

  private async copy(text: string, message: string) {
    await navigator.clipboard.writeText(text);
    notify(message, 'ok');
  }
}
