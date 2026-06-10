import { LitElement, css, html, nothing, TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './components/material';
import './pages/overview-page';
import './pages/shell-page';
import './pages/apps-page';
import './pages/files-page';
import './pages/screen-page';
import './pages/logcat-page';
import './pages/fastboot-queue-page';
import './pages/fastboot-single-page';
import './pages/fastboot-terminal-page';
import './pages/fastboot-tools-page';
import './pages/settings-page';
import './pages/logs-page';
import { adbClient } from './core/adb/adb-client';
import { fastbootClient } from './core/fastboot/fastboot-client';
import { logcatController } from './core/adb/adb-logcat';
import { AppState, appStore, ConnectionStatus } from './core/state/app-store';
import { notify, reportError } from './core/ui/feedback';
import { statusLabel } from './pages/widgets';

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: '设备与 ADB',
    items: [
      { id: 'overview', label: '设备概览', icon: 'dashboard' },
      { id: 'shell', label: 'ADB Shell', icon: 'terminal' },
      { id: 'apps', label: '应用管理', icon: 'apps' },
      { id: 'files', label: '文件管理', icon: 'folder' },
      { id: 'screen', label: '截图与按键', icon: 'screenshot_monitor' },
      { id: 'logcat', label: '实时日志', icon: 'article' },
    ],
  },
  {
    title: 'Fastboot 刷机',
    items: [
      { id: 'fb-queue', label: '批量刷入', icon: 'layers' },
      { id: 'fb-single', label: '手动刷入', icon: 'bolt' },
      { id: 'fb-terminal', label: 'Fastboot 终端', icon: 'code' },
      { id: 'fb-tools', label: '常用操作', icon: 'build' },
    ],
  },
  {
    title: '系统',
    items: [
      { id: 'settings', label: '设置', icon: 'settings' },
      { id: 'logs', label: '运行日志', icon: 'history' },
    ],
  },
];

const MOBILE_NAV: NavItem[] = [
  { id: 'overview', label: '工作台', icon: 'dashboard' },
  { id: 'shell', label: 'ADB', icon: 'terminal' },
  { id: 'files', label: '文件', icon: 'folder' },
  { id: 'fb-queue', label: '刷机', icon: 'bolt' },
  { id: 'logs', label: '日志', icon: 'history' },
];

const GITHUB_MARK = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  <path
    d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
  />
</svg>`;

const isWindows = /Windows/i.test(
  (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.userAgent,
);

@customElement('adb-toolbox-app')
export class AdbToolboxApp extends LitElement {
  @state() private app: AppState = appStore.state;
  @state() private railOpen = false;
  private media = window.matchMedia('(prefers-color-scheme: dark)');

  connectedCallback(): void {
    super.connectedCallback();
    appStore.addEventListener('change', this.syncStore);
    this.media.addEventListener('change', this.applyTheme);
    window.addEventListener('keydown', this.onWindowKeydown);
    this.applyTheme();
  }

  disconnectedCallback(): void {
    appStore.removeEventListener('change', this.syncStore);
    this.media.removeEventListener('change', this.applyTheme);
    window.removeEventListener('keydown', this.onWindowKeydown);
    document.body.style.overflow = '';
    super.disconnectedCallback();
  }

  private syncStore = () => {
    this.app = appStore.state;
    this.applyTheme();
  };

  private applyTheme = () => {
    const mode = appStore.state.settings.theme;
    const dark = mode === 'dark' || (mode === 'auto' && this.media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  };

  render() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    return html`
      <div class="shell">
        <button
          class=${this.railOpen ? 'drawer-scrim open' : 'drawer-scrim'}
          @click=${this.closeRail}
          aria-label="关闭导航"
        ></button>
        <header class="topbar">
          <button class="menu-button" @click=${this.toggleRail} aria-label="切换导航" aria-expanded=${this.railOpen}>
            <md-icon>menu</md-icon>
          </button>
          <div class="brand">
            <div class="brand-mark"><md-icon>adb</md-icon></div>
            <div>
              <strong>ADB / Fastboot 工具箱</strong>
              <span>WebUSB 生产级设备控制台</span>
            </div>
          </div>
          <div class="status-cluster">
            ${this.statusChip('ADB', this.app.adb.status, this.app.adb.model || this.app.adb.serial)}
            ${this.statusChip('Fastboot', this.app.fastboot.status, this.app.fastboot.productName)}
          </div>
          <button class="icon-button" @click=${this.toggleTheme} aria-label="切换主题">
            <md-icon>${isDark ? 'light_mode' : 'dark_mode'}</md-icon>
          </button>
          <div class="connect-actions">
            <md-filled-button @click=${this.connectAdb}
              >${this.app.adb.status === 'connected' ? '断开 ADB' : '连接 ADB'}</md-filled-button
            >
            <md-outlined-button @click=${this.connectFastboot}
              >${this.app.fastboot.status === 'connected' ? '断开 Fastboot' : '连接 Fastboot'}</md-outlined-button
            >
          </div>
        </header>

        <aside class=${this.railOpen ? 'rail open' : 'rail'}>
          <div class="nav-scroll">${NAV_GROUPS.map((group) => this.navGroup(group))}</div>
          <div class="rail-footer">
            <a
              class="rail-link"
              href="https://github.com/sky22333/web-adb"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub 仓库"
              title="GitHub 仓库"
              >${GITHUB_MARK}</a
            >
            ${isWindows
              ? html`<a
                  class="rail-link"
                  href="https://github.com/pbatard/libwdi"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Windows USB 驱动 (libwdi)"
                  title="Windows USB 驱动 (libwdi)"
                  ><md-icon>usb</md-icon></a
                >`
              : nothing}
          </div>
        </aside>
        <main class="main">${this.activeTask()} ${this.renderPage()}</main>
        <nav class="bottom-nav">${MOBILE_NAV.map((item) => this.mobileNavItem(item))}</nav>
      </div>
    `;
  }

  private renderPage(): TemplateResult {
    switch (this.app.activePage) {
      case 'shell':
        return html`<shell-page></shell-page>`;
      case 'apps':
        return html`<apps-page></apps-page>`;
      case 'files':
        return html`<files-page></files-page>`;
      case 'screen':
        return html`<screen-page></screen-page>`;
      case 'logcat':
        return html`<logcat-page></logcat-page>`;
      case 'fb-queue':
        return html`<fastboot-queue-page></fastboot-queue-page>`;
      case 'fb-single':
        return html`<fastboot-single-page></fastboot-single-page>`;
      case 'fb-terminal':
        return html`<fastboot-terminal-page></fastboot-terminal-page>`;
      case 'fb-tools':
        return html`<fastboot-tools-page></fastboot-tools-page>`;
      case 'settings':
        return html`<settings-page></settings-page>`;
      case 'logs':
        return html`<logs-page></logs-page>`;
      default:
        return html`<overview-page></overview-page>`;
    }
  }

  private statusChip(label: string, status: ConnectionStatus, detail?: string) {
    return html`<div class="status ${status}">
      <span></span><strong>${label}</strong><small>${detail || statusLabel(status)}</small>
    </div>`;
  }

  private navGroup(group: { title: string; items: NavItem[] }) {
    return html`<section class="nav-group">
      <h3>${group.title}</h3>
      ${group.items.map((item) => this.navItem(item))}
    </section>`;
  }

  private navItem(item: NavItem) {
    return html`<button
      class=${this.app.activePage === item.id ? 'nav-item active' : 'nav-item'}
      @click=${() => this.navigate(item.id)}
    >
      <md-icon>${item.icon}</md-icon>${item.label}
    </button>`;
  }

  private mobileNavItem(item: NavItem) {
    return html`<button
      class=${this.app.activePage === item.id ? 'mobile-item active' : 'mobile-item'}
      @click=${() => this.navigate(item.id)}
    >
      <md-icon>${item.icon}</md-icon>${item.label}
    </button>`;
  }

  private activeTask() {
    const task = [...this.app.tasks].reverse().find((item) => item.status === 'running');
    if (!task) return nothing;
    return html`<div class="task-strip">
      <span>${task.label}</span>
      <md-linear-progress value=${task.progress / 100}></md-linear-progress>
      <b>${Math.round(task.progress)}%</b>
    </div>`;
  }

  private connectAdb = async () => {
    try {
      if (this.app.adb.status === 'connected') await logcatController.stop();
      await adbClient.connect();
      const connected = appStore.state.adb.status === 'connected';
      notify(connected ? 'ADB 已连接' : 'ADB 已断开', 'ok');
      if (connected) appStore.setPage('overview');
    } catch (error) {
      reportError(error);
    }
  };

  private connectFastboot = async () => {
    try {
      await fastbootClient.connect();
      notify(appStore.state.fastboot.status === 'connected' ? 'Fastboot 已连接' : 'Fastboot 已断开', 'ok');
    } catch (error) {
      reportError(error);
    }
  };

  private toggleTheme = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    appStore.updateSettings({ theme: dark ? 'light' : 'dark' });
  };

  private navigate(id: string): void {
    appStore.setPage(id);
    this.closeRail();
  }

  private toggleRail = () => this.setRailOpen(!this.railOpen);
  private closeRail = () => this.setRailOpen(false);

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
      font-size: 14px;
      line-height: 1.45;
      font-family: var(--app-font);
      color: var(--md-sys-color-on-surface);
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
    }
    .brand strong {
      display: block;
    }
    .brand span {
      display: block;
      font-size: 13px;
      color: var(--md-sys-color-outline);
    }
    .menu-button,
    .icon-button {
      display: inline-grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: var(--md-sys-color-on-surface);
      cursor: pointer;
    }
    .icon-button:hover {
      background: var(--md-sys-color-surface-container);
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
    .status.connecting span,
    .status.disconnecting span {
      background: var(--md-sys-color-primary);
      animation: pulse 1s var(--app-easing) infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.3;
      }
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
    .status small {
      color: var(--md-sys-color-outline);
    }
    .connect-actions {
      display: flex;
      gap: 8px;
      flex: 0 0 auto;
    }
    .connect-actions md-filled-button,
    .connect-actions md-outlined-button {
      flex: 0 0 auto;
      min-width: 96px;
    }
    .rail {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 14px 10px 8px;
      border-right: 1px solid var(--md-sys-color-outline-variant);
      background: var(--md-sys-color-surface-container-low);
    }
    .nav-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    .rail-footer {
      display: flex;
      gap: 4px;
      margin-top: 6px;
      padding-top: 8px;
      border-top: 1px solid var(--md-sys-color-outline-variant);
    }
    .rail-link {
      display: inline-grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 10px;
      color: var(--md-sys-color-outline);
      text-decoration: none;
      transition:
        background var(--app-duration) var(--app-easing),
        color var(--app-duration) var(--app-easing);
    }
    .rail-link:hover {
      background: var(--md-sys-color-surface-container);
      color: var(--md-sys-color-on-surface);
    }
    .rail-link svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    .rail-link md-icon {
      font-size: 18px;
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
      gap: 10px;
      min-height: 36px;
      padding: 0 12px;
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
    .nav-item md-icon,
    .mobile-item md-icon {
      font-size: 20px;
      color: var(--md-sys-color-primary);
    }
    .nav-item:hover {
      background: color-mix(in srgb, var(--md-sys-color-primary-container) 34%, transparent);
    }
    .nav-item.active {
      background: color-mix(in srgb, var(--md-sys-color-primary-container) 58%, transparent);
      color: var(--md-sys-color-on-primary-container);
      font-weight: 760;
    }
    .nav-item:active {
      transform: scale(0.98);
    }
    .main {
      overflow: auto;
      padding: 20px 22px;
    }
    .task-strip {
      width: min(1180px, 100%);
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
    }
    @media (max-width: 760px) {
      :host {
        --app-header: 96px;
      }
      .shell {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(0, 1fr);
      }
      .topbar {
        flex-wrap: wrap;
        gap: 8px;
        min-height: auto;
        padding: 8px 10px;
      }
      .menu-button {
        display: inline-grid;
        background: var(--md-sys-color-surface-container);
      }
      .brand {
        min-width: 0;
        flex: 1;
      }
      .brand span {
        display: none;
      }
      .connect-actions {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
      .connect-actions md-filled-button,
      .connect-actions md-outlined-button {
        width: 100%;
        min-width: 0;
        --md-filled-button-container-height: 34px;
        --md-outlined-button-container-height: 34px;
      }
      .rail {
        position: fixed;
        inset: var(--app-header) auto 0 0;
        z-index: 30;
        width: min(78vw, 248px);
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
      .task-strip {
        grid-template-columns: 1fr auto;
      }
      .task-strip md-linear-progress {
        grid-column: 1 / -1;
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
        border: 1px solid var(--md-sys-color-outline-variant);
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
        cursor: pointer;
      }
      .mobile-item.active {
        color: var(--md-sys-color-on-primary-container);
        background: var(--md-sys-color-primary-container);
      }
    }
  `;
}
