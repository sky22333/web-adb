import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/checkbox/checkbox.js';
import '@material/web/progress/linear-progress.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/textfield/outlined-text-field.js';
import { adbClient } from './core/adb/adb-client';
import { runShellText } from './core/adb/adb-shell';
import { installApk, listPackages, packageAction, packageApkPaths, packageDetail } from './core/adb/adb-apps';
import { deleteRemotePath, listDirectory, pullFile, pushFile, RemoteFile } from './core/adb/adb-files';
import { takeScreenshot } from './core/adb/adb-screen';
import { LogcatSession } from './core/adb/adb-logcat';
import { AppState, appStore } from './core/state/app-store';
import { fastbootClient } from './core/fastboot/fastboot-client';
import { guessPartition, normalizeFastbootCommand, PARTITIONS } from './core/fastboot/fastboot-protocol';
import { formatSize, formatVid } from './core/utils/format';
import { dirname, joinPath } from './core/utils/path';
import { shellQuote } from './core/utils/shell-quote';
import { toAppError } from './core/utils/errors';

interface QueueItem {
  id: string;
  file: File;
  partition: string;
  status: 'waiting' | 'flashing' | 'done' | 'failed';
}

const navGroups = [
  {
    title: '设备与 ADB',
    items: [
      ['overview', '设备概览', '◆'],
      ['shell', 'ADB Shell', '⌘'],
      ['apps', '应用管理', '▦'],
      ['files', '文件管理', '▣'],
      ['screen', '截图与按键', '▢'],
      ['logcat', '实时日志', '≡'],
    ],
  },
  {
    title: 'Fastboot 刷机',
    items: [
      ['fb-queue', '批量刷入', '↕'],
      ['fb-single', '手动刷入', '⚡'],
      ['fb-terminal', 'Fastboot 终端', '{}'],
      ['fb-tools', '常用操作', '◇'],
    ],
  },
  {
    title: '系统',
    items: [
      ['settings', '设置', '◎'],
      ['logs', '运行日志', '◷'],
    ],
  },
];

@customElement('adb-toolbox-app')
export class AdbToolboxApp extends LitElement {
  @state() private app: AppState = appStore.state;
  @state() private toast = '';
  @state() private shellOutput = '等待命令...';
  @state() private deviceInfo = '等待连接 ADB...';
  @state() private packageInfo = '选择应用后可查看详情...';
  @state() private packageRows: string[] = [];
  @state() private fileRows: RemoteFile[] = [];
  @state() private currentPath = '/sdcard/';
  @state() private logcatLines: string[] = [];
  @state() private fbOutput = '等待命令...';
  @state() private queue: QueueItem[] = [];
  @state() private apkFile?: File;
  @state() private fbSingleFile?: File;
  @state() private screenshotUrl?: string;
  @state() private screenshotCanvas?: HTMLCanvasElement;
  @state() private railOpen = false;

  private toastTimer = 0;
  private logcat?: LogcatSession;

  connectedCallback(): void {
    super.connectedCallback();
    appStore.addEventListener('change', this.syncStore);
    window.addEventListener('keydown', this.onWindowKeydown);
    this.applyTheme();
  }

  disconnectedCallback(): void {
    appStore.removeEventListener('change', this.syncStore);
    window.removeEventListener('keydown', this.onWindowKeydown);
    void this.stopLogcat(false);
    URL.revokeObjectURL(this.screenshotUrl || '');
    document.body.style.overflow = '';
    super.disconnectedCallback();
  }

  private syncStore = () => {
    this.app = appStore.state;
    this.applyTheme();
  };

  private applyTheme(): void {
    this.dataset.theme = appStore.state.settings.theme;
  }

  render() {
    return html`
      <div class="shell">
        <button class=${this.railOpen ? 'drawer-scrim open' : 'drawer-scrim'} @click=${() => this.closeRail()} aria-label="关闭导航"></button>
        <header class="topbar">
          <button class="menu-button" @click=${() => this.toggleRail()} aria-label=${this.railOpen ? '关闭导航' : '打开导航'} aria-expanded=${this.railOpen}>☰</button>
          <div class="brand">
            <div class="brand-mark">A</div>
            <div>
              <strong>ADB / Fastboot 工具箱</strong>
              <span>WebUSB 生产级设备控制台</span>
            </div>
          </div>
          <div class="status-cluster">
            ${this.statusChip('ADB', this.app.adb.status, this.app.adb.model || this.app.adb.serial)}
            ${this.statusChip('Fastboot', this.app.fastboot.status, this.app.fastboot.productName)}
          </div>
          <md-outlined-button @click=${() => this.toggleTheme()}>${this.app.settings.theme === 'dark' ? '浅色' : '深色'}</md-outlined-button>
          <md-filled-button @click=${() => this.connectAdb()}>${this.app.adb.status === 'connected' ? '断开 ADB' : '连接 ADB'}</md-filled-button>
          <md-outlined-button @click=${() => this.connectFastboot()}
            >${this.app.fastboot.status === 'connected' ? '断开 Fastboot' : '连接 Fastboot'}</md-outlined-button
          >
        </header>

        <aside class=${this.railOpen ? 'rail open' : 'rail'}>${navGroups.map((group) => this.navGroup(group))}</aside>
        <main class="main">
          ${this.activeTask()} ${this.renderPage()}
        </main>
        <nav class="bottom-nav">
          ${[
            ['overview', '工作台', '◆'],
            ['shell', 'ADB', '⌘'],
            ['files', '文件', '▣'],
            ['fb-queue', '刷机', '⚡'],
            ['logs', '日志', '◷'],
          ].map(([id, label, icon]) => this.mobileNavItem(id, label, icon))}
        </nav>
        ${this.toast ? html`<div class="toast">${this.toast}</div>` : nothing}
      </div>
    `;
  }

  private renderPage() {
    const page = this.app.activePage;
    if (page === 'overview') return this.overviewPage();
    if (page === 'shell') return this.shellPage();
    if (page === 'apps') return this.appsPage();
    if (page === 'files') return this.filesPage();
    if (page === 'screen') return this.screenPage();
    if (page === 'logcat') return this.logcatPage();
    if (page === 'fb-queue') return this.fastbootQueuePage();
    if (page === 'fb-single') return this.fastbootSinglePage();
    if (page === 'fb-terminal') return this.fastbootTerminalPage();
    if (page === 'fb-tools') return this.fastbootToolsPage();
    if (page === 'settings') return this.settingsPage();
    return this.logsPage();
  }

  private overviewPage() {
    return html`
      <section class="page">
        ${this.pageHead('设备概览', '查看 ADB 设备信息、系统属性和常用状态。', html`
          <md-filled-button @click=${() => this.refreshDeviceInfo()}>刷新信息</md-filled-button>
          <md-outlined-button @click=${() => this.safeAdbCommand('reboot', '确认重启系统？')}>重启系统</md-outlined-button>
          <md-outlined-button @click=${() => this.safeAdbCommand('reboot bootloader', '确认重启到 Bootloader？')}
            >重启 Bootloader</md-outlined-button
          >
        `)}
        <div class="metric-grid">
          ${this.metric('ADB 状态', this.statusLabel(this.app.adb.status))}
          ${this.metric('Fastboot 状态', this.statusLabel(this.app.fastboot.status))}
          ${this.metric('型号', this.app.adb.model || '-')}
          ${this.metric('Android', this.app.adb.android || '-')}
        </div>
        <div class="card">
          <div class="card-title">详细信息</div>
          <pre class="log-panel">${this.deviceInfo}</pre>
        </div>
      </section>
    `;
  }

  private shellPage() {
    return html`
      <section class="page">
        ${this.pageHead('ADB Shell', '执行单条命令，输出会被完整读取并限制日志长度。')}
        <div class="card">
          <div class="toolbar">
            <md-outlined-text-field id="shellInput" class="mono" value="getprop ro.product.model" label="Shell 命令"></md-outlined-text-field>
            <md-filled-button @click=${() => this.runShellFromInput()}>执行</md-filled-button>
            <md-outlined-button @click=${() => (this.shellOutput = '')}>清空</md-outlined-button>
          </div>
          <div class="chips">
            ${['getprop ro.product.model', 'wm size; wm density', 'dumpsys battery', 'ip addr', 'df -h'].map(
              (cmd) => html`<button class="chip" @click=${() => this.runShellCommand(cmd)}>${cmd}</button>`,
            )}
          </div>
          <pre class="log-panel tall">${this.shellOutput}</pre>
        </div>
      </section>
    `;
  }

  private appsPage() {
    return html`
      <section class="page">
        ${this.pageHead('应用管理', '安装 APK、查看包名、启动、停止、清除数据和卸载。', html`
          <md-filled-button @click=${() => this.refreshPackages()}>刷新包列表</md-filled-button>
        `)}
        <div class="grid two">
          <div class="card">
            <div class="card-title">安装 APK</div>
            <label class="dropzone">
              <input type="file" accept=".apk,application/vnd.android.package-archive" @change=${(event: Event) => this.pickApk(event)} />
              <strong>${this.apkFile?.name || '选择或拖拽 APK'}</strong>
              <span>${this.apkFile ? formatSize(this.apkFile.size) : '支持大文件流式上传'}</span>
            </label>
            <div class="toolbar compact">
              <label class="check"><md-checkbox id="apkReinstall" checked></md-checkbox>-r 覆盖</label>
              <label class="check"><md-checkbox id="apkGrant"></md-checkbox>-g 授权</label>
              <md-filled-button @click=${() => this.installSelectedApk()}>安装</md-filled-button>
            </div>
          </div>
          <div class="card">
            <div class="card-title">包名操作</div>
            <md-outlined-text-field id="pkgInput" class="mono" label="包名" value=""></md-outlined-text-field>
            <div class="toolbar compact">
              ${[
                ['open', '打开', false],
                ['stop', '停止', false],
                ['disable', '禁用', true],
                ['enable', '启用', false],
                ['clear', '清除数据', true],
                ['uninstall', '卸载', true],
              ].map(
                ([action, label, danger]) => danger
                  ? html`<md-filled-button @click=${() => this.runPackageAction(action as any)}>${label}</md-filled-button>`
                  : html`<md-outlined-button @click=${() => this.runPackageAction(action as any)}>${label}</md-outlined-button>`,
              )}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="toolbar">
            <md-outlined-text-field id="pkgFilter" label="搜索包名" @input=${() => this.refreshPackages()}></md-outlined-text-field>
            <md-outlined-select id="pkgType" value="3" @change=${() => this.refreshPackages()}>
              <md-select-option value="3" selected><div slot="headline">第三方应用</div></md-select-option>
              <md-select-option value="all"><div slot="headline">全部应用</div></md-select-option>
              <md-select-option value="s"><div slot="headline">系统应用</div></md-select-option>
            </md-outlined-select>
          </div>
          ${this.packageRows.length ? html`<div class="table">${this.packageRows.map((name) => this.packageRow(name))}</div>` : this.empty('等待刷新包列表')}
        </div>
        <div class="card">
          <div class="card-title">应用详情</div>
          <pre class="log-panel">${this.packageInfo}</pre>
        </div>
      </section>
    `;
  }

  private filesPage() {
    return html`
      <section class="page">
        ${this.pageHead('文件管理', '浏览、上传、下载、删除和新建目录。')}
        <div class="card">
          <div class="toolbar">
            <md-outlined-button @click=${() => this.openPath('/sdcard/')}>/sdcard</md-outlined-button>
            <md-outlined-button @click=${() => this.openPath(dirname(this.currentPath))}>上级</md-outlined-button>
            <md-outlined-text-field id="pathInput" class="mono" label="路径" value=${this.currentPath}></md-outlined-text-field>
            <md-filled-button @click=${() => this.openPath(this.inputValue('pathInput') || '/sdcard/')}>打开</md-filled-button>
            <md-outlined-button @click=${() => this.openPath(this.currentPath)}>刷新</md-outlined-button>
            <md-outlined-button @click=${() => this.copyText(this.currentPath, '当前路径已复制')}>复制路径</md-outlined-button>
          </div>
        </div>
        <div class="grid two">
          <div class="card">
            <div class="card-title">上传文件</div>
            <label class="dropzone">
              <input type="file" multiple @change=${(event: Event) => this.uploadPickedFiles(event)} />
              <strong>上传到当前目录</strong>
              <span>${this.currentPath}</span>
            </label>
          </div>
          <div class="card">
            <div class="card-title">快捷操作</div>
            <div class="toolbar">
              <md-outlined-text-field id="mkdirInput" label="新建目录名"></md-outlined-text-field>
              <md-filled-button @click=${() => this.mkdir()}>新建</md-filled-button>
            </div>
            <div class="toolbar">
              <md-outlined-text-field id="downloadInput" class="mono" label="直接下载路径"></md-outlined-text-field>
              <md-outlined-button @click=${() => this.downloadPath(this.inputValue('downloadInput'))}>下载</md-outlined-button>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title mono">${this.currentPath}</div>
          ${this.fileRows.length ? html`<div class="table">${this.fileRows.map((row) => this.fileRow(row))}</div>` : this.empty('等待打开目录')}
        </div>
      </section>
    `;
  }

  private screenPage() {
    return html`
      <section class="page">
        ${this.pageHead('截图与按键', '截图优先使用二进制 exec 通道，按键使用 Android keyevent。', html`
          <md-filled-button @click=${() => this.captureScreen()}>获取截图</md-filled-button>
          <md-outlined-button @click=${() => this.saveScreenshot()} ?disabled=${!this.screenshotUrl && !this.screenshotCanvas}>保存图片</md-outlined-button>
        `)}
        <div class="grid two">
          <div class="card screen-card" id="screenStage">
            ${this.screenshotUrl ? html`<img src=${this.screenshotUrl} alt="设备截图" />` : this.empty('暂无截图')}
          </div>
          <div class="card">
            <div class="card-title">常用按键</div>
            <div class="key-grid">
              ${[
                ['3', 'Home'],
                ['4', '返回'],
                ['187', '最近任务'],
                ['82', '菜单'],
                ['19', '上'],
                ['20', '下'],
                ['21', '左'],
                ['22', '右'],
                ['23', '确认'],
                ['24', '音量+'],
                ['25', '音量-'],
                ['26', '电源'],
              ].map(([key, label]) => html`<button class="key" @click=${() => this.sendKey(key)}>${label}</button>`)}
            </div>
            <div class="toolbar">
              <md-outlined-text-field id="customKey" label="自定义 keyevent"></md-outlined-text-field>
              <md-filled-button @click=${() => this.sendKey(this.inputValue('customKey'))}>发送</md-filled-button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private logcatPage() {
    return html`
      <section class="page">
        ${this.pageHead('实时日志', '流式读取 logcat，停止时自动取消读取并释放 socket。', html`
          <md-filled-button @click=${() => this.startLogcat()} ?disabled=${Boolean(this.logcat)}>开始</md-filled-button>
          <md-outlined-button @click=${() => this.stopLogcat()} ?disabled=${!this.logcat}>停止</md-outlined-button>
          <md-outlined-button @click=${() => (this.logcatLines = [])}>清空</md-outlined-button>
        `)}
        <div class="card">
          <div class="toolbar">
            <md-outlined-text-field id="logcatFilter" label="过滤关键字"></md-outlined-text-field>
            <md-outlined-select id="logcatLevel" value="I">
              ${[
                ['V', '全部'],
                ['D', '调试+'],
                ['I', '信息+'],
                ['W', '警告+'],
                ['E', '错误'],
              ].map(
                ([level, label]) => html`<md-select-option value=${level} ?selected=${level === 'I'}><div slot="headline">${label}</div></md-select-option>`,
              )}
            </md-outlined-select>
          </div>
          <pre class="log-panel tall">${this.logcatLines.join('\n') || '等待开始...'}</pre>
        </div>
      </section>
    `;
  }

  private fastbootQueuePage() {
    return html`
      <section class="page">
        ${this.pageHead('Fastboot 批量刷入', '多镜像队列、自动猜测分区、顺序刷入和整体进度。', html`
          <md-filled-button @click=${() => this.startQueue()}>开始队列</md-filled-button>
          <md-outlined-button @click=${() => (this.queue = [])}>清空</md-outlined-button>
        `)}
        <div class="card">
          <label class="dropzone">
            <input type="file" accept=".img,.bin" multiple @change=${(event: Event) => this.pickQueueFiles(event)} />
            <strong>选择 .img / .bin 文件</strong>
            <span>支持多选，可手动调整分区名</span>
          </label>
          ${this.queue.length ? html`<div class="queue">${this.queue.map((item, index) => this.queueRow(item, index))}</div>` : this.empty('队列为空')}
        </div>
      </section>
    `;
  }

  private fastbootSinglePage() {
    return html`
      <section class="page">
        ${this.pageHead('Fastboot 手动刷入', '选择单个镜像并指定目标分区。')}
        <div class="card">
          <label class="dropzone">
            <input type="file" accept=".img,.bin" @change=${(event: Event) => this.pickSingleFile(event)} />
            <strong>${this.fbSingleFile?.name || '选择 .img / .bin 文件'}</strong>
            <span>${this.fbSingleFile ? formatSize(this.fbSingleFile.size) : '未选择文件'}</span>
          </label>
          <div class="grid two">
            <md-outlined-select id="singlePartition" value="boot">
              ${PARTITIONS.map((part) => html`<md-select-option value=${part} ?selected=${part === 'boot'}><div slot="headline">${part}</div></md-select-option>`)}
            </md-outlined-select>
            <md-outlined-text-field id="singleCustom" class="mono" label="自定义分区"></md-outlined-text-field>
          </div>
          <md-filled-button class="full" @click=${() => this.flashSingle()}>开始刷入</md-filled-button>
        </div>
      </section>
    `;
  }

  private fastbootTerminalPage() {
    return html`
      <section class="page">
        ${this.pageHead('Fastboot 终端', '发送 Fastboot 原始命令并查看响应。')}
        <div class="card">
          <div class="toolbar">
            <md-outlined-text-field id="fbCommand" class="mono" value="getvar all" label="Fastboot 命令"></md-outlined-text-field>
            <md-filled-button @click=${() => this.runFastbootInput()}>执行</md-filled-button>
            <md-outlined-button @click=${() => (this.fbOutput = '')}>清空</md-outlined-button>
          </div>
          <div class="chips">
            ${['getvar all', 'getvar product', 'getvar unlocked', 'getvar current-slot', 'flashing unlock', 'flashing lock'].map(
              (cmd) => html`<button class=${cmd.includes('flashing') ? 'chip danger' : 'chip'} @click=${() => this.runFastbootCommand(cmd)}>${cmd}</button>`,
            )}
          </div>
          <pre class="log-panel tall">${this.fbOutput}</pre>
        </div>
      </section>
    `;
  }

  private fastbootToolsPage() {
    return html`
      <section class="page">
        ${this.pageHead('Fastboot 常用操作', '危险命令会二次确认并记录运行日志。')}
        <div class="grid two">
          <div class="card">
            <div class="card-title">重启</div>
            <div class="actions">
              ${['reboot', 'reboot-bootloader', 'continue'].map((cmd) => html`<md-outlined-button @click=${() => this.runFastbootCommand(cmd)}>${cmd}</md-outlined-button>`)}
            </div>
          </div>
          <div class="card danger-zone">
            <div class="card-title">危险操作</div>
            <div class="actions">
              ${['erase userdata', 'erase cache', 'flashing unlock', 'flashing lock'].map(
                (cmd) => html`<md-filled-button @click=${() => this.runFastbootCommand(cmd)}>${cmd}</md-filled-button>`,
              )}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private settingsPage() {
    return html`
      <section class="page">
        ${this.pageHead('设置', 'USB VID、Fastboot 传输块和日志限制。')}
        <div class="grid two">
          <div class="card">
            <div class="card-title">USB VID</div>
            <div class="vid-list">${this.renderVids()}</div>
            <div class="toolbar">
              <md-outlined-text-field id="vidInput" label="例如 0x1234"></md-outlined-text-field>
              <md-filled-button @click=${() => this.addVid()}>添加</md-filled-button>
            </div>
          </div>
          <div class="card">
            <div class="field-stack">
              <label>外观主题</label>
              <md-outlined-select id="themeMode" value=${this.app.settings.theme} @change=${() => this.updateThemeMode()}>
                <md-select-option value="light" ?selected=${this.app.settings.theme === 'light'}><div slot="headline">浅色</div></md-select-option>
                <md-select-option value="dark" ?selected=${this.app.settings.theme === 'dark'}><div slot="headline">深色</div></md-select-option>
              </md-outlined-select>
              <label>Fastboot 传输块</label>
              <md-outlined-select id="chunkSize" value=${String(this.app.settings.fastbootChunkSize)} @change=${() => this.updateChunkSize()}>
                <md-select-option value="1048576" ?selected=${this.app.settings.fastbootChunkSize === 1048576}><div slot="headline">1 MB</div></md-select-option>
                <md-select-option value="524288" ?selected=${this.app.settings.fastbootChunkSize === 524288}><div slot="headline">512 KB</div></md-select-option>
                <md-select-option value="262144" ?selected=${this.app.settings.fastbootChunkSize === 262144}><div slot="headline">256 KB</div></md-select-option>
              </md-outlined-select>
              <label>最大日志行数</label>
              <md-outlined-select id="maxLogs" value=${String(this.app.settings.maxLogLines)} @change=${() => this.updateMaxLogs()}>
                ${[600, 1000, 2000].map(
                  (n) => html`<md-select-option value=${String(n)} ?selected=${this.app.settings.maxLogLines === n}><div slot="headline">${n}</div></md-select-option>`,
                )}
              </md-outlined-select>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private logsPage() {
    return html`
      <section class="page">
        ${this.pageHead('运行日志', '全局操作日志和诊断信息。', html`
          <md-outlined-button @click=${() => appStore.patch({ logs: [] })}>清空</md-outlined-button>
          <md-filled-button @click=${() => this.copyLogs()}>复制</md-filled-button>
        `)}
        <div class="card">
          <pre class="log-panel tall">${this.app.logs.map((l) => `[${new Date(l.time).toLocaleTimeString()}] ${l.message}`).join('\n')}</pre>
        </div>
      </section>
    `;
  }

  private pageHead(title: string, desc: string, actions: unknown = nothing) {
    return html`<div class="page-head"><div><h1>${title}</h1><p>${desc}</p></div><div class="page-actions">${actions}</div></div>`;
  }

  private statusChip(label: string, status: string, detail?: string) {
    return html`<div class="status ${status}"><span></span><strong>${label}</strong><small>${detail || this.statusLabel(status)}</small></div>`;
  }

  private statusLabel(status: string) {
    return ({ idle: '未连接', connecting: '连接中', connected: '已连接', disconnecting: '断开中', error: '异常' } as Record<string, string>)[status] || status;
  }

  private navGroup(group: { title: string; items: string[][] }) {
    return html`<section class="nav-group"><h3>${group.title}</h3>${group.items.map(([id, label, icon]) => this.navItem(id, label, icon))}</section>`;
  }

  private navItem(id: string, label: string, icon: string) {
    return html`<button class=${this.app.activePage === id ? 'nav-item active' : 'nav-item'} @click=${() => this.navigate(id)}><span>${icon}</span>${label}</button>`;
  }

  private mobileNavItem(id: string, label: string, icon: string) {
    return html`<button class=${this.app.activePage === id ? 'mobile-item active' : 'mobile-item'} @click=${() => this.navigate(id)}><span>${icon}</span>${label}</button>`;
  }

  private metric(label: string, value: string) {
    return html`<div class="metric"><span>${label}</span><strong class="mono">${value}</strong></div>`;
  }

  private activeTask() {
    const task = [...this.app.tasks].reverse().find((item) => item.status === 'running');
    if (!task) return nothing;
    return html`<div class="task-strip"><span>${task.label}</span><md-linear-progress value=${task.progress / 100}></md-linear-progress><b>${Math.round(task.progress)}%</b></div>`;
  }

  private empty(text: string) {
    return html`<div class="empty">${text}</div>`;
  }

  private packageRow(name: string) {
    return html`<div class="table-row">
      <span class="mono">${name}</span>
      <div>
        <button @click=${() => this.setInput('pkgInput', name)}>选择</button>
        <button @click=${() => this.runPackageAction('open', name)}>打开</button>
        <button @click=${() => this.showPackageDetail(name)}>详情</button>
        <button @click=${() => this.extractApk(name)}>提取 APK</button>
        <button @click=${() => this.copyText(name, '包名已复制')}>复制</button>
      </div>
    </div>`;
  }

  private fileRow(row: RemoteFile) {
    return html`<div class="table-row file">
      <button class="file-name" @click=${() => (row.isDir ? this.openPath(`${row.path}/`) : this.setInput('downloadInput', row.path))}>${row.isDir ? '文件夹' : '文件'} ${row.name}</button>
      <span>${row.isDir ? '-' : formatSize(row.size)}</span><span>${row.time}</span>
      <div>
        ${row.isDir ? html`<button @click=${() => this.openPath(`${row.path}/`)}>打开</button>` : html`<button @click=${() => this.downloadPath(row.path)}>下载</button>`}
        <button @click=${() => this.copyText(row.path, '路径已复制')}>复制路径</button>
        <button class="danger-text" @click=${() => this.removePath(row)}>删除</button>
      </div>
    </div>`;
  }

  private queueRow(item: QueueItem, index: number) {
    return html`<div class=${`queue-row ${item.status}`}>
      <span class="mono">${item.file.name}<small>${formatSize(item.file.size)}</small></span>
      <input value=${item.partition} @change=${(event: Event) => (this.queue[index].partition = (event.target as HTMLInputElement).value.trim())} />
      <b>${item.status}</b>
      <button @click=${() => this.moveQueue(index)} ?disabled=${index === 0}>↑</button>
      <button class="danger-text" @click=${() => (this.queue = this.queue.filter((row) => row.id !== item.id))}>删除</button>
    </div>`;
  }

  private renderVids() {
    const custom = this.app.settings.customVendorIds;
    return html`${appStore.allVendorIds().map(
      (vid) =>
        html`<div class="vid"><span class="mono">${formatVid(vid)}</span><small>${custom.includes(vid) ? '自定义' : '内置'}</small>${custom.includes(vid) ? html`<button @click=${() => this.removeVid(vid)}>删除</button>` : nothing}</div>`,
    )}`;
  }

  private inputValue(id: string): string {
    return ((this.renderRoot.querySelector(`#${id}`) as HTMLInputElement | null)?.value || '').trim();
  }

  private setInput(id: string, value: string): void {
    const input = this.renderRoot.querySelector(`#${id}`) as HTMLInputElement | null;
    if (input) input.value = value;
  }

  private showToast(message: string): void {
    this.toast = message;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast = ''), 3200);
  }

  private handleError(error: unknown): void {
    const appError = toAppError(error);
    this.showToast(appError.suggestion ? `${appError.message} ${appError.suggestion}` : appError.message);
    appStore.log(appError.detail ? `${appError.message}\n${appError.detail}` : appError.message, 'err');
  }

  private async connectAdb() {
    try {
      if (this.app.adb.status === 'connected') await this.stopLogcat(false);
      await adbClient.connect();
      this.showToast(appStore.state.adb.status === 'connected' ? 'ADB 已连接' : 'ADB 已断开');
      if (appStore.state.adb.status === 'connected') await this.refreshDeviceInfo();
    } catch (error) {
      this.handleError(error);
    }
  }

  private async connectFastboot() {
    try {
      await fastbootClient.connect();
      this.showToast(appStore.state.fastboot.status === 'connected' ? 'Fastboot 已连接' : 'Fastboot 已断开');
    } catch (error) {
      this.handleError(error);
    }
  }

  private async refreshDeviceInfo() {
    const task = appStore.task('刷新设备信息');
    try {
        const script = [
          'echo MODEL=$(getprop ro.product.model)',
          'echo BRAND=$(getprop ro.product.brand)',
          'echo DEVICE=$(getprop ro.product.device)',
          'echo ABI=$(getprop ro.product.cpu.abi)',
          'echo ANDROID=$(getprop ro.build.version.release)',
          'echo SDK=$(getprop ro.build.version.sdk)',
          'echo SERIAL=$(getprop ro.serialno)',
          'echo BUILD=$(getprop ro.build.display.id)',
          'echo SECURITY_PATCH=$(getprop ro.build.version.security_patch)',
          'wm size 2>/dev/null',
          'wm density 2>/dev/null',
          'dumpsys battery 2>/dev/null | head -n 16',
          'settings get global adb_enabled 2>/dev/null | sed "s/^/ADB_ENABLED=/"',
          'ip route 2>/dev/null | head -n 4',
          'df -h /sdcard 2>/dev/null',
        ].join('; ');
      const output = await runShellText(script);
      const pick = (name: string) => output.match(new RegExp(`${name}=([^\\n]+)`))?.[1]?.trim();
      appStore.patch({ adb: { ...appStore.state.adb, model: pick('MODEL'), android: pick('ANDROID'), serial: pick('SERIAL') || appStore.state.adb.serial } });
      this.deviceInfo = output.trim();
      task.done('设备信息已刷新');
      appStore.log('设备信息已刷新', 'ok');
    } catch (error) {
      task.fail('刷新失败');
      this.handleError(error);
    }
  }

  private async runShellFromInput() {
    await this.runShellCommand(this.inputValue('shellInput'));
  }

  private async runShellCommand(command: string) {
    if (!command) return;
    this.shellOutput = `> ${command}\n`;
    const task = appStore.task(`执行 ADB：${command}`);
    try {
      this.shellOutput += await runShellText(command);
      task.done('ADB 命令完成');
      appStore.log(`ADB shell: ${command}`, 'ok');
    } catch (error) {
      task.fail('ADB 命令失败');
      this.handleError(error);
    }
  }

  private async safeAdbCommand(command: string, message: string) {
    if (!confirm(message)) return;
    await this.runShellCommand(command);
  }

  private pickApk(event: Event) {
    this.apkFile = (event.target as HTMLInputElement).files?.[0];
  }

  private async installSelectedApk() {
    if (!this.apkFile) return this.showToast('请先选择 APK。');
    const args = [];
    if ((this.renderRoot.querySelector('#apkReinstall') as any)?.checked) args.push('-r');
    if ((this.renderRoot.querySelector('#apkGrant') as any)?.checked) args.push('-g');
    const task = appStore.task(`安装 ${this.apkFile.name}`);
    try {
      await installApk(this.apkFile, args, (progress, label) => task.update(progress, label));
      task.done('APK 安装完成');
      this.showToast('APK 安装完成');
      appStore.log(`APK 安装完成：${this.apkFile.name}`, 'ok');
    } catch (error) {
      task.fail('APK 安装失败');
      this.handleError(error);
    }
  }

  private async refreshPackages() {
    try {
      this.packageRows = await listPackages(this.inputValue('pkgType') || '3', this.inputValue('pkgFilter'));
    } catch (error) {
      this.handleError(error);
    }
  }

  private async runPackageAction(action: 'open' | 'stop' | 'clear' | 'uninstall' | 'disable' | 'enable', value = this.inputValue('pkgInput')) {
    if (!value) return this.showToast('请输入包名。');
    if (['clear', 'uninstall', 'disable'].includes(action) && !confirm(`确认对 ${value} 执行 ${action}？`)) return;
    try {
      const result = await packageAction(action, value);
      this.showToast(result.trim() || '操作完成');
      appStore.log(`包名操作 ${action}: ${value}`, 'ok');
      if (action === 'uninstall') await this.refreshPackages();
    } catch (error) {
      this.handleError(error);
    }
  }

  private async showPackageDetail(packageName = this.inputValue('pkgInput')) {
    if (!packageName) return this.showToast('请输入包名。');
    try {
      this.packageInfo = await packageDetail(packageName);
      this.setInput('pkgInput', packageName);
      appStore.log(`查看应用详情：${packageName}`, 'ok');
    } catch (error) {
      this.handleError(error);
    }
  }

  private async extractApk(packageName: string) {
    const task = appStore.task(`提取 ${packageName}`);
    try {
      const paths = await packageApkPaths(packageName);
      if (!paths.length) throw new Error('未找到 APK 路径。');
      for (const path of paths) await this.downloadPath(path);
      task.done('APK 提取完成');
    } catch (error) {
      task.fail('APK 提取失败');
      this.handleError(error);
    }
  }

  private async copyText(text: string, message: string) {
    await navigator.clipboard.writeText(text);
    this.showToast(message);
  }

  private async openPath(path: string) {
    try {
      this.currentPath = path.endsWith('/') ? path : `${path}/`;
      this.setInput('pathInput', this.currentPath);
      this.fileRows = await listDirectory(this.currentPath);
      appStore.log(`打开目录：${this.currentPath}`, 'ok');
    } catch (error) {
      this.handleError(error);
    }
  }

  private async uploadPickedFiles(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files || []);
    if (!files.length) return;
    const task = appStore.task(`上传 ${files.length} 个文件`);
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        await pushFile(file, joinPath(this.currentPath, file.name), (percent) => task.update(((i + percent / 100) / files.length) * 100, `上传 ${file.name}`));
      }
      task.done('上传完成');
      this.showToast('上传完成');
      await this.openPath(this.currentPath);
    } catch (error) {
      task.fail('上传失败');
      this.handleError(error);
    }
  }

  private async mkdir() {
    const name = this.inputValue('mkdirInput');
    if (!name) return this.showToast('请输入目录名。');
    try {
      await runShellText(`mkdir -p ${shellQuote(joinPath(this.currentPath, name))}`);
      this.setInput('mkdirInput', '');
      await this.openPath(this.currentPath);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async downloadPath(path: string) {
    if (!path) return this.showToast('请输入远程路径。');
    const task = appStore.task(`下载 ${path}`);
    try {
      const { blob, filename } = await pullFile(path);
      this.downloadBlob(blob, filename);
      task.done('下载完成');
      appStore.log(`文件已下载：${path} (${formatSize(blob.size)})`, 'ok');
    } catch (error) {
      task.fail('下载失败');
      this.handleError(error);
    }
  }

  private async removePath(row: RemoteFile) {
    if (!confirm(`确认删除 ${row.path}？`)) return;
    try {
      await deleteRemotePath(row.path, row.isDir);
      this.showToast('删除完成');
      await this.openPath(this.currentPath);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async captureScreen() {
    const task = appStore.task('获取截图');
    try {
      URL.revokeObjectURL(this.screenshotUrl || '');
      this.screenshotUrl = undefined;
      this.screenshotCanvas = undefined;
      const result = await takeScreenshot();
      if (result.blob) this.screenshotUrl = URL.createObjectURL(result.blob);
      if (result.canvas) {
        this.screenshotCanvas = result.canvas;
        await this.updateComplete;
        this.renderRoot.querySelector('#screenStage')?.append(result.canvas);
      }
      task.done('截图完成');
    } catch (error) {
      task.fail('截图失败');
      this.handleError(error);
    }
  }

  private saveScreenshot() {
    if (this.screenshotUrl) return this.downloadBlob(this.screenshotUrl, `screenshot-${Date.now()}.png`);
    if (this.screenshotCanvas) return this.downloadBlob(this.screenshotCanvas.toDataURL('image/png'), `screenshot-${Date.now()}.png`);
  }

  private async sendKey(key: string) {
    if (!Number.isFinite(Number(key))) return this.showToast('keyevent 必须是数字。');
    await this.runShellCommand(`input keyevent ${Number(key)}`);
  }

  private async startLogcat() {
    if (this.logcat) return;
    this.logcat = new LogcatSession();
    try {
      this.logcatLines = [];
      await this.logcat.start(this.inputValue('logcatLevel') || 'I', this.inputValue('logcatFilter'), (line) => {
        this.logcatLines = [...this.logcatLines, line].slice(-this.app.settings.maxLogLines);
      });
    } catch (error) {
      if (this.logcat) this.handleError(error);
    } finally {
      await this.stopLogcat(false);
    }
  }

  private async stopLogcat(show = true) {
    const current = this.logcat;
    this.logcat = undefined;
    await current?.stop();
    if (show) this.showToast('logcat 已停止');
  }

  private pickQueueFiles(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files || []);
    this.queue = [
      ...this.queue,
      ...files.map((file) => ({ id: crypto.randomUUID(), file, partition: guessPartition(file.name), status: 'waiting' as const })),
    ];
  }

  private moveQueue(index: number) {
    if (index <= 0) return;
    const queue = [...this.queue];
    [queue[index - 1], queue[index]] = [queue[index], queue[index - 1]];
    this.queue = queue;
  }

  private async startQueue() {
    if (!this.queue.length) return this.showToast('队列为空。');
    const bad = this.queue.find((item) => !item.partition);
    if (bad) return this.showToast(`请设置分区：${bad.file.name}`);
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
      this.showToast('队列刷入完成');
    } catch (error) {
      const failed = this.queue.find((item) => item.status === 'flashing');
      if (failed) failed.status = 'failed';
      task.fail('队列刷入失败');
      this.handleError(error);
    }
  }

  private pickSingleFile(event: Event) {
    this.fbSingleFile = (event.target as HTMLInputElement).files?.[0];
    if (this.fbSingleFile) this.setInput('singleCustom', guessPartition(this.fbSingleFile.name));
  }

  private async flashSingle() {
    if (!this.fbSingleFile) return this.showToast('请选择镜像文件。');
    const partition = this.inputValue('singleCustom') || this.inputValue('singlePartition') || 'boot';
    const task = appStore.task(`刷入 ${this.fbSingleFile.name}`);
    try {
      await fastbootClient.flash(this.fbSingleFile, partition, this.app.settings.fastbootChunkSize, (percent) => task.update(percent, `刷入 ${partition}`));
      task.done('刷入完成');
      this.showToast('刷入完成');
    } catch (error) {
      task.fail('刷入失败');
      this.handleError(error);
    }
  }

  private async runFastbootInput() {
    await this.runFastbootCommand(this.inputValue('fbCommand'));
  }

  private async runFastbootCommand(command: string) {
    if (!command) return;
    const normalized = normalizeFastbootCommand(command);
    if (/^(erase|flashing|oem unlock|oem lock)/i.test(command) && !confirm(`确认执行危险 Fastboot 命令？\n${command}`)) return;
    this.fbOutput = `> ${command}${normalized !== command ? `\n# protocol: ${normalized}` : ''}\n`;
    const task = appStore.task(`Fastboot：${command}`);
    try {
      const result = await fastbootClient.command(normalized);
      this.fbOutput += result || 'OK';
      task.done('Fastboot 命令完成');
      appStore.log(`Fastboot: ${command}`, 'ok');
    } catch (error) {
      this.fbOutput += `错误：${toAppError(error).message}`;
      task.fail('Fastboot 命令失败');
      this.handleError(error);
    }
  }

  private addVid() {
    const raw = this.inputValue('vidInput');
    const value = parseInt(raw.replace(/^0x/i, ''), 16);
    if (!Number.isFinite(value) || value <= 0 || value > 0xffff) return this.showToast('VID 格式无效。');
    if (appStore.allVendorIds().includes(value)) return this.showToast('VID 已存在。');
    appStore.updateSettings({ customVendorIds: [...this.app.settings.customVendorIds, value] });
    this.setInput('vidInput', '');
  }

  private removeVid(value: number) {
    appStore.updateSettings({ customVendorIds: this.app.settings.customVendorIds.filter((vid) => vid !== value) });
  }

  private updateChunkSize = () => appStore.updateSettings({ fastbootChunkSize: Number(this.inputValue('chunkSize')) });
  private updateMaxLogs = () => appStore.updateSettings({ maxLogLines: Number(this.inputValue('maxLogs')) });
  private updateThemeMode = () => appStore.updateSettings({ theme: (this.inputValue('themeMode') || 'light') as 'light' | 'dark' });

  private toggleTheme = () => {
    appStore.updateSettings({ theme: this.app.settings.theme === 'dark' ? 'light' : 'dark' });
  };

  private async copyLogs() {
    await navigator.clipboard.writeText(this.app.logs.map((l) => `[${new Date(l.time).toISOString()}] ${l.message}`).join('\n'));
    this.showToast('日志已复制');
  }

  private downloadBlob(blobOrUrl: Blob | string, filename: string) {
    const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private navigate(id: string): void {
    appStore.setPage(id);
    this.closeRail();
  }

  private toggleRail = () => {
    this.setRailOpen(!this.railOpen);
  };

  private closeRail = () => {
    this.setRailOpen(false);
  };

  private setRailOpen(open: boolean): void {
    this.railOpen = open;
    document.body.style.overflow = open ? 'hidden' : '';
  }

  private onWindowKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.closeRail();
  };

  static styles = css`
    * {
      box-sizing: border-box;
    }
    :host {
      display: block;
      min-height: 100vh;
      --app-log-bg: #eef2fb;
      --app-log-fg: #222832;
      --app-log-border: #d7dce6;
      --app-section-bg: transparent;
      --app-row-bg: var(--md-sys-color-surface-container-low);
      --app-section-gap: 18px;
      --app-inner-gap: 10px;
      font-size: 14px;
      line-height: 1.45;
      font-family: var(--app-font);
      color: var(--md-sys-color-on-surface);
    }
    :host([data-theme='dark']) {
      color-scheme: dark;
      --md-sys-color-primary: #adc6ff;
      --md-sys-color-on-primary: #082f60;
      --md-sys-color-primary-container: #284777;
      --md-sys-color-on-primary-container: #d7e3ff;
      --md-sys-color-secondary: #bec6dc;
      --md-sys-color-secondary-container: #3e4759;
      --md-sys-color-on-secondary-container: #dae2f9;
      --md-sys-color-tertiary: #ddbce0;
      --md-sys-color-tertiary-container: #573e5c;
      --md-sys-color-on-tertiary-container: #fad8fd;
      --md-sys-color-error: #ffb4ab;
      --md-sys-color-error-container: #93000a;
      --md-sys-color-background: #111318;
      --md-sys-color-on-background: #e2e2e9;
      --md-sys-color-surface: #111318;
      --md-sys-color-on-surface: #e2e2e9;
      --md-sys-color-surface-container-lowest: #0c0e13;
      --md-sys-color-surface-container-low: #191c22;
      --md-sys-color-surface-container: #1d2027;
      --md-sys-color-surface-container-high: #282a31;
      --md-sys-color-surface-container-highest: #33353c;
      --md-sys-color-outline: #8e9199;
      --md-sys-color-outline-variant: #44474f;
      --app-bg: #111318;
      --app-bg-accent-a: rgba(173, 198, 255, 0.08);
      --app-bg-accent-b: rgba(221, 188, 224, 0.06);
      --app-log-bg: #1b1e25;
      --app-log-fg: #e2e7f5;
      --app-log-border: #3f4450;
      --app-section-bg: transparent;
      --app-row-bg: var(--md-sys-color-surface-container);
      --app-shadow-soft: 0 1px 2px rgba(0, 0, 0, 0.24);
    }
    button,
    input,
    select,
    textarea {
      color: inherit;
      font: inherit;
    }
    md-filled-button,
    md-outlined-button {
      --md-filled-button-container-height: 36px;
      --md-outlined-button-container-height: 36px;
      --md-filled-button-container-shape: 12px;
      --md-outlined-button-container-shape: 12px;
      --md-filled-button-label-text-weight: 760;
      --md-outlined-button-label-text-weight: 760;
      --md-outlined-button-label-text-color: var(--md-sys-color-primary);
      --md-outlined-button-outline-color: var(--md-sys-color-outline-variant);
    }
    md-outlined-text-field,
    md-outlined-select {
      --md-outlined-text-field-container-height: 44px;
      --md-outlined-select-text-field-container-height: 44px;
      --md-outlined-text-field-container-shape: 12px;
      --md-outlined-select-text-field-container-shape: 12px;
      --md-outlined-text-field-focus-outline-color: var(--md-sys-color-primary);
      --md-outlined-select-text-field-focus-outline-color: var(--md-sys-color-primary);
      --md-outlined-text-field-input-text-color: var(--md-sys-color-on-surface);
      --md-outlined-text-field-label-text-color: var(--md-sys-color-outline);
      --md-outlined-select-text-field-input-text-color: var(--md-sys-color-on-surface);
      --md-outlined-select-text-field-label-text-color: var(--md-sys-color-outline);
    }
    .shell {
      display: grid;
      grid-template-columns: var(--app-sidebar) minmax(0, 1fr);
      grid-template-rows: var(--app-header) minmax(0, 1fr);
      min-height: 100vh;
      background:
        radial-gradient(circle at 20% 0%, var(--app-bg-accent-a), transparent 38%),
        radial-gradient(circle at 90% 10%, var(--app-bg-accent-b), transparent 34%),
        var(--app-bg);
      color: var(--md-sys-color-on-surface);
    }
    .topbar {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 58px;
      padding: 7px 16px;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
      background: color-mix(in srgb, var(--md-sys-color-surface) 96%, transparent);
      backdrop-filter: blur(18px);
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 220px;
      align-self: stretch;
      padding-right: 10px;
    }
    .brand-mark {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      color: var(--md-sys-color-on-primary-container);
      background: var(--md-sys-color-primary-container);
      font-weight: 800;
    }
    .brand span,
    .status small,
    .page-head p,
    .empty,
    .card small {
      color: var(--md-sys-color-outline);
    }
    .brand span {
      display: block;
      font-size: 13px;
    }
    .menu-button {
      display: none;
    }
    .status-cluster {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }
    .status {
      width: 142px;
      min-height: 36px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 0 8px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      font-size: 13px;
    }
    .status span {
      grid-row: span 2;
      width: 8px;
      height: 8px;
      align-self: center;
      border-radius: 999px;
      background: var(--md-sys-color-outline);
    }
    .status.connected span {
      background: var(--app-success);
    }
    .status.error span {
      background: var(--md-sys-color-error);
    }
    .status strong,
    .status small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status strong {
      color: var(--md-sys-color-on-surface);
    }
    .topbar > md-filled-button,
    .topbar > md-outlined-button {
      flex: 0 0 auto;
      min-width: 96px;
    }
    .rail {
      overflow: auto;
      padding: 14px 10px;
      border-right: 1px solid var(--md-sys-color-outline-variant);
      background: var(--md-sys-color-surface-container-low);
    }
    .nav-group + .nav-group {
      margin-top: 14px;
    }
    .nav-group h3 {
      margin: 0 12px 7px;
      color: var(--md-sys-color-outline);
      font-size: 12px;
      letter-spacing: 0.04em;
    }
    .nav-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 0 10px;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: var(--md-sys-color-on-surface);
      cursor: pointer;
      text-align: left;
      transition:
        background var(--app-duration) var(--app-easing),
        transform var(--app-duration-fast) var(--app-easing);
    }
    .nav-item:hover {
      background: color-mix(in srgb, var(--md-sys-color-primary-container) 34%, transparent);
      color: var(--md-sys-color-on-surface);
    }
    .nav-item.active {
      background: color-mix(in srgb, var(--md-sys-color-primary-container) 58%, transparent);
      color: var(--md-sys-color-on-primary-container);
    }
    .nav-item.active {
      font-weight: 760;
    }
    .nav-item:active {
      transform: scale(0.98);
    }
    .nav-item span {
      width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: transparent;
      font-size: 13px;
      color: var(--md-sys-color-primary);
    }
    .nav-item.active span {
      background: transparent;
    }
    .main {
      overflow: auto;
      padding: 20px 22px;
    }
    .page {
      width: min(1280px, 100%);
      margin: 0 auto 82px;
      animation: enter var(--app-duration) var(--app-easing);
    }
    @keyframes enter {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.99);
      }
    }
    .page-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin: 0 0 var(--app-section-gap);
    }
    h1 {
      margin: 0;
      font-size: clamp(22px, 2.6vw, 30px);
      letter-spacing: 0;
    }
    .page-head p {
      max-width: 760px;
      margin: 6px 0 0;
      line-height: 1.6;
      font-size: 13px;
    }
    .page-actions,
    .toolbar,
    .actions,
    .chips {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--app-inner-gap);
    }
    .toolbar md-outlined-text-field {
      flex: 1 1 280px;
    }
    .toolbar md-outlined-select {
      flex: 0 1 190px;
      min-width: 160px;
    }
    .compact {
      margin-top: var(--app-inner-gap);
    }
    .grid {
      display: grid;
      gap: 12px;
      margin-bottom: var(--app-section-gap);
    }
    .two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: var(--app-section-gap);
    }
    .metric,
    .card {
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .metric {
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 16px;
      min-height: 78px;
      padding: 14px;
      background: var(--app-row-bg);
    }
    .metric span {
      display: block;
      color: var(--md-sys-color-outline);
      font-size: 12px;
      margin-bottom: 6px;
    }
    .metric strong {
      font-size: 16px;
      overflow-wrap: anywhere;
    }
    .card {
      padding: 0;
      margin-bottom: var(--app-section-gap);
      background: transparent;
    }
    .card-title {
      font-weight: 750;
      margin-bottom: 10px;
      font-size: 14px;
      color: var(--md-sys-color-on-surface);
    }
    .dropzone {
      min-height: 104px;
      display: grid;
      place-items: center;
      gap: 6px;
      padding: 16px;
      border: 1px dashed var(--md-sys-color-outline-variant);
      border-radius: 16px;
      color: var(--md-sys-color-on-surface);
      background: var(--app-row-bg);
      cursor: pointer;
      text-align: center;
      transition:
        transform var(--app-duration-fast) var(--app-easing),
        background var(--app-duration) var(--app-easing),
        border-color var(--app-duration) var(--app-easing);
    }
    .dropzone:hover {
      border-color: var(--md-sys-color-primary);
      background: var(--md-sys-color-surface-container);
    }
    .dropzone input {
      display: none;
    }
    .log-panel {
      overflow: auto;
      min-height: 190px;
      margin: var(--app-inner-gap) 0 0;
      padding: 12px;
      border-radius: 14px;
      color: var(--app-log-fg);
      background: var(--app-log-bg);
      border: 1px solid var(--app-log-border);
      white-space: pre-wrap;
      font-family: var(--app-mono);
      font-size: 12px;
      line-height: 1.55;
    }
    .tall {
      min-height: 360px;
    }
    .table,
    .queue,
    .vid-list {
      display: grid;
      gap: 10px;
      margin-top: var(--app-inner-gap);
    }
    .table-row,
    .queue-row,
    .vid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding: 9px 10px;
      border-radius: 14px;
      color: var(--md-sys-color-on-surface);
      background: var(--app-row-bg);
    }
    .table-row > div,
    .queue-row > div {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
    .table-row button,
    .queue-row button,
    .vid button {
      border: 0;
      border-radius: 12px;
      background: var(--md-sys-color-secondary-container);
      color: var(--md-sys-color-on-secondary-container);
      min-height: 32px;
      padding: 6px 10px;
      cursor: pointer;
    }
    .file {
      grid-template-columns: minmax(200px, 1fr) 92px 142px 132px;
    }
    .file-name {
      overflow: hidden;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .queue-row {
      grid-template-columns: minmax(200px, 1fr) 170px 76px auto auto;
    }
    .queue-row input {
      min-width: 0;
      height: 36px;
      padding: 0 10px;
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 12px;
      background: var(--md-sys-color-surface);
      color: var(--md-sys-color-on-surface);
    }
    .queue-row b {
      justify-self: center;
      color: var(--md-sys-color-outline);
      font-size: 12px;
      font-weight: 700;
    }
    .queue-row small {
      display: block;
      margin-top: 2px;
    }
    .vid {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }
    .danger-text,
    .danger {
      color: var(--md-sys-color-error) !important;
    }
    .danger-zone {
      border-color: var(--md-sys-color-error-container);
      background: transparent;
    }
    .danger-zone .card-title {
      color: var(--md-sys-color-error);
    }
    .chip {
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 999px;
      color: var(--md-sys-color-on-surface);
      background: var(--app-row-bg);
      min-height: 32px;
      padding: 6px 11px;
      font-size: 13px;
      cursor: pointer;
      transition: transform var(--app-duration-fast) var(--app-easing), background var(--app-duration);
    }
    .chip:active {
      transform: scale(0.96);
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .key-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: var(--app-inner-gap);
    }
    .key {
      min-height: 38px;
      border: 0;
      border-radius: 14px;
      background: var(--md-sys-color-secondary-container);
      color: var(--md-sys-color-on-secondary-container);
      cursor: pointer;
      transition: transform var(--app-duration-fast) var(--app-easing);
    }
    .key:active {
      transform: scale(0.96);
    }
    .screen-card {
      display: grid;
      min-height: 320px;
      place-items: center;
      background: var(--app-log-bg);
    }
    .screen-card img,
    .screen-card canvas {
      max-width: 100%;
      max-height: 70vh;
      border-radius: 12px;
    }
    .empty {
      display: grid;
      min-height: 84px;
      place-items: center;
      border-radius: 16px;
      color: var(--md-sys-color-outline);
      background: var(--app-row-bg);
      text-align: center;
    }
    .full {
      width: 100%;
      margin-top: var(--app-inner-gap);
    }
    .field-stack {
      display: grid;
      gap: 10px;
    }
    .field-stack label,
    label {
      color: var(--md-sys-color-on-surface);
    }
    .task-strip {
      width: min(1280px, 100%);
      margin: 0 auto 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(140px, 320px) auto;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 16px;
      background: var(--md-sys-color-surface);
      box-shadow: var(--app-shadow-soft);
      color: var(--md-sys-color-on-surface);
    }
    .toast {
      position: fixed;
      left: 50%;
      bottom: 28px;
      z-index: 50;
      transform: translateX(-50%);
      max-width: min(520px, calc(100vw - 32px));
      padding: 13px 18px;
      border-radius: 14px;
      color: var(--app-log-fg);
      background: var(--app-log-bg);
      border: 1px solid var(--app-log-border);
      box-shadow: var(--app-shadow);
      animation: toast-in var(--app-duration) var(--app-easing);
    }
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(10px);
      }
    }
    .bottom-nav {
      display: none;
    }
    .drawer-scrim {
      display: none;
    }
    @media (max-width: 1040px) {
      .status-cluster {
        display: none;
      }
      .two,
      .metric-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 760px) {
      .shell {
        grid-template-columns: 1fr;
      }
      .topbar {
        margin: 0;
        padding: 0 10px;
        border-radius: 0;
      }
      .menu-button {
        display: inline-grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border: 0;
        border-radius: 12px;
        background: var(--md-sys-color-surface-container);
      }
      .brand {
        min-width: 0;
        flex: 1;
      }
      .brand span {
        display: none;
      }
      .topbar md-filled-button,
      .topbar md-outlined-button {
        display: none;
      }
      .rail {
        position: fixed;
        inset: var(--app-header) auto 0 0;
        z-index: 30;
        width: min(86vw, 312px);
        transform: translateX(-105%);
        transition: transform var(--app-duration) var(--app-easing);
        box-shadow: var(--app-shadow);
      }
      .rail.open {
        transform: translateX(0);
      }
      .drawer-scrim {
        position: fixed;
        inset: var(--app-header) 0 0;
        z-index: 29;
        display: block;
        border: 0;
        opacity: 0;
        pointer-events: none;
        background: color-mix(in srgb, var(--md-sys-color-scrim) 34%, transparent);
        transition: opacity var(--app-duration) var(--app-easing);
      }
      .drawer-scrim.open {
        opacity: 1;
        pointer-events: auto;
      }
      .main {
        padding: 14px 12px 86px;
      }
      .page-head,
      .toolbar,
      .page-actions {
        align-items: stretch;
        flex-direction: column;
      }
      .toolbar md-outlined-text-field,
      .toolbar md-outlined-select {
        flex-basis: auto;
        width: 100%;
      }
      .task-strip {
        grid-template-columns: 1fr auto;
      }
      .task-strip md-linear-progress {
        grid-column: 1 / -1;
      }
      .table-row,
      .queue-row,
      .file {
        grid-template-columns: 1fr;
        align-items: stretch;
        gap: 10px;
      }
      .table-row > div,
      .queue-row > div {
        justify-content: flex-start;
      }
      .queue-row input {
        width: 100%;
      }
      .key-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .bottom-nav {
        position: fixed;
        left: 10px;
        right: 10px;
        bottom: 10px;
        z-index: 25;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 4px;
        padding: 7px;
        border: 1px solid rgba(190, 201, 199, 0.58);
        border-radius: 22px;
        background: color-mix(in srgb, var(--md-sys-color-surface) 94%, transparent);
        box-shadow: var(--app-shadow-soft);
        backdrop-filter: blur(16px);
      }
      .mobile-item {
        display: grid;
        place-items: center;
        gap: 2px;
        min-height: 48px;
        border: 0;
        border-radius: 16px;
        background: transparent;
        color: var(--md-sys-color-outline);
        font-size: 12px;
      }
      .mobile-item span {
        font-size: 12px;
      }
      .mobile-item.active {
        color: var(--md-sys-color-on-primary-container);
        background: var(--md-sys-color-primary-container);
      }
    }
    @media (max-width: 560px) {
      .metric-grid,
      .two {
        grid-template-columns: 1fr;
      }
      .card,
      .metric {
        padding: 12px;
      }
      .card {
        padding: 0;
      }
      .page-head p {
        font-size: 13px;
      }
      .log-panel {
        min-height: 240px;
        font-size: 12px;
      }
      .tall {
        min-height: 300px;
      }
      .bottom-nav {
        left: 6px;
        right: 6px;
        bottom: 6px;
      }
      .mobile-item {
        min-height: 46px;
      }
    }
  `;
}
