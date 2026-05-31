import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { StorePage } from './base-page';
import { pageHead, metric, statusLabel } from './widgets';
import { runShellText } from '../core/adb/adb-shell';
import { appStore } from '../core/state/app-store';
import { confirmDialog, reportError } from '../core/ui/feedback';

const INFO_SCRIPT = [
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

@customElement('overview-page')
export class OverviewPage extends StorePage {
  @state() private deviceInfo = '等待连接 ADB...';
  private autoLoaded = false;

  protected updated(): void {
    if (this.app.adb.status !== 'connected') {
      this.autoLoaded = false;
      return;
    }
    if (!this.autoLoaded) {
      this.autoLoaded = true;
      void this.refresh();
    }
  }

  render() {
    return html`
      <section class="page">
        ${pageHead(
          '设备概览',
          '查看 ADB 设备信息、系统属性和常用状态。',
          html`
            <md-filled-button @click=${this.refresh}>刷新信息</md-filled-button>
            <md-outlined-button @click=${() => this.reboot('reboot', '确认重启系统？')}>重启系统</md-outlined-button>
            <md-outlined-button @click=${() => this.reboot('reboot bootloader', '确认重启到 Bootloader？')}
              >重启 Bootloader</md-outlined-button
            >
          `,
        )}
        <div class="metric-grid">
          ${metric('ADB 状态', statusLabel(this.app.adb.status))}
          ${metric('Fastboot 状态', statusLabel(this.app.fastboot.status))}
          ${metric('型号', this.app.adb.model || '-')}
          ${metric('Android', this.app.adb.android || '-')}
        </div>
        <div class="card">
          <div class="card-title">详细信息</div>
          <pre class="log-panel">${this.deviceInfo}</pre>
        </div>
      </section>
    `;
  }

  private refresh = async () => {
    const task = appStore.task('刷新设备信息');
    try {
      const output = await runShellText(INFO_SCRIPT);
      const pick = (name: string) => output.match(new RegExp(`${name}=([^\\n]+)`))?.[1]?.trim();
      appStore.patchAdb({ model: pick('MODEL'), android: pick('ANDROID'), serial: pick('SERIAL') || this.app.adb.serial });
      this.deviceInfo = output.trim();
      task.done('设备信息已刷新');
      appStore.log('设备信息已刷新', 'ok');
    } catch (error) {
      task.fail('刷新失败');
      reportError(error);
    }
  };

  private async reboot(command: string, message: string) {
    if (!(await confirmDialog({ message, danger: true }))) return;
    const task = appStore.task(`执行 ADB：${command}`);
    try {
      await runShellText(command);
      task.done('ADB 命令完成');
      appStore.log(`ADB shell: ${command}`, 'ok');
    } catch (error) {
      task.fail('ADB 命令失败');
      reportError(error);
    }
  }
}
