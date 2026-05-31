import { html } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead, empty } from './widgets';
import { installApk, listPackages, packageAction, packageApkPaths, packageDetail } from '../core/adb/adb-apps';
import { pullFile } from '../core/adb/adb-files';
import { appStore } from '../core/state/app-store';
import { confirmDialog, notify, reportError } from '../core/ui/feedback';
import { formatSize } from '../core/utils/format';
import { downloadBlob } from '../core/utils/download';
import '../components/drop-zone';

type PackageAction = 'open' | 'stop' | 'clear' | 'uninstall' | 'disable' | 'enable';

const ACTIONS: [PackageAction, string, boolean][] = [
  ['open', '打开', false],
  ['stop', '停止', false],
  ['disable', '禁用', true],
  ['enable', '启用', false],
  ['clear', '清除数据', true],
  ['uninstall', '卸载', true],
];

@customElement('apps-page')
export class AppsPage extends StorePage {
  @state() private apkFile?: File;
  @state() private packageRows: string[] = [];
  @state() private packageInfo = '选择应用后可查看详情...';
  @query('#pkgInput') private pkgInput!: HTMLInputElement;
  @query('#pkgFilter') private pkgFilter!: HTMLInputElement;
  @query('#pkgType') private pkgType!: HTMLInputElement;
  @query('#apkGrant') private apkGrant!: HTMLInputElement;

  render() {
    return html`
      <section class="page">
        ${pageHead(
          '应用管理',
          '安装 APK、查看包名、启动、停止、清除数据和卸载。',
          html`<md-filled-button @click=${this.refresh}>刷新包列表</md-filled-button>`,
        )}
        <div class="grid two">
          <div class="card">
            <div class="card-title">安装 APK</div>
            <drop-zone
              accept=".apk,application/vnd.android.package-archive"
              heading=${this.apkFile?.name || '选择或拖拽 APK'}
              hint=${this.apkFile ? formatSize(this.apkFile.size) : '支持大文件流式上传'}
              @files=${(e: CustomEvent<File[]>) => (this.apkFile = e.detail[0])}
            ></drop-zone>
            <div class="toolbar">
              <label class="check"><md-checkbox id="apkGrant"></md-checkbox>-g 授权运行时权限</label>
              <md-filled-button @click=${this.install}>安装</md-filled-button>
            </div>
          </div>
          <div class="card">
            <div class="card-title">包名操作</div>
            <md-outlined-text-field id="pkgInput" class="mono" label="包名"></md-outlined-text-field>
            <div class="toolbar">
              ${ACTIONS.map(([action, label, danger]) =>
                danger
                  ? html`<md-filled-button @click=${() => this.act(action)}>${label}</md-filled-button>`
                  : html`<md-outlined-button @click=${() => this.act(action)}>${label}</md-outlined-button>`,
              )}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="toolbar">
            <md-outlined-text-field id="pkgFilter" label="搜索包名" @input=${this.refresh}></md-outlined-text-field>
            <md-outlined-select id="pkgType" value="3" @change=${this.refresh}>
              <md-select-option value="3" selected><div slot="headline">第三方应用</div></md-select-option>
              <md-select-option value="all"><div slot="headline">全部应用</div></md-select-option>
              <md-select-option value="s"><div slot="headline">系统应用</div></md-select-option>
            </md-outlined-select>
          </div>
          ${this.packageRows.length
            ? html`<div class="table">${this.packageRows.map((name) => this.row(name))}</div>`
            : empty('等待刷新包列表')}
        </div>
        <div class="card">
          <div class="card-title">应用详情</div>
          <pre class="log-panel">${this.packageInfo}</pre>
        </div>
      </section>
    `;
  }

  private row(name: string) {
    return html`<div class="table-row">
      <span class="mono">${name}</span>
      <div>
        <button @click=${() => (this.pkgInput.value = name)}>选择</button>
        <button @click=${() => this.act('open', name)}>打开</button>
        <button @click=${() => this.detail(name)}>详情</button>
        <button @click=${() => this.extract(name)}>提取 APK</button>
        <button @click=${() => this.copy(name)}>复制</button>
      </div>
    </div>`;
  }

  private refresh = async () => {
    try {
      this.packageRows = await listPackages(this.pkgType?.value || '3', this.pkgFilter?.value ?? '');
    } catch (error) {
      reportError(error);
    }
  };

  private install = async () => {
    if (!this.apkFile) return notify('请先选择 APK。', 'warn');
    const task = appStore.task(`安装 ${this.apkFile.name}`);
    try {
      await installApk(this.apkFile, { grant: this.apkGrant?.checked }, (progress, label) => task.update(progress, label));
      task.done('APK 安装完成');
      notify('APK 安装完成', 'ok');
      appStore.log(`APK 安装完成：${this.apkFile.name}`, 'ok');
    } catch (error) {
      task.fail('APK 安装失败');
      reportError(error);
    }
  };

  private async act(action: PackageAction, value = this.pkgInput.value.trim()) {
    if (!value) return notify('请输入包名。', 'warn');
    if (['clear', 'uninstall', 'disable'].includes(action)) {
      if (!(await confirmDialog({ message: `确认对 ${value} 执行 ${action}？`, danger: true }))) return;
    }
    try {
      const result = await packageAction(action, value);
      notify(result.trim() || '操作完成', 'ok');
      appStore.log(`包名操作 ${action}: ${value}`, 'ok');
      if (action === 'uninstall') await this.refresh();
    } catch (error) {
      reportError(error);
    }
  }

  private async detail(packageName: string) {
    try {
      this.packageInfo = await packageDetail(packageName);
      this.pkgInput.value = packageName;
      appStore.log(`查看应用详情：${packageName}`, 'ok');
    } catch (error) {
      reportError(error);
    }
  }

  private async extract(packageName: string) {
    const task = appStore.task(`提取 ${packageName}`);
    try {
      const paths = await packageApkPaths(packageName);
      if (!paths.length) throw new Error('未找到 APK 路径。');
      for (const path of paths) {
        const { blob, filename } = await pullFile(path);
        downloadBlob(blob, filename);
      }
      task.done('APK 提取完成');
    } catch (error) {
      task.fail('APK 提取失败');
      reportError(error);
    }
  }

  private async copy(name: string) {
    await navigator.clipboard.writeText(name);
    notify('包名已复制', 'ok');
  }
}
