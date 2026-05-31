import { Adb, AdbDaemonTransport } from '@yume-chan/adb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';
import { appStore } from '../state/app-store';
import { assertWebUsbReady } from '../usb/usb-capabilities';
import { AppError, toAppError } from '../utils/errors';

export class AdbClient {
  adb: any = null;
  transport: any = null;
  device: any = null;

  get connected(): boolean {
    return Boolean(this.adb);
  }

  async connect(): Promise<void> {
    if (this.connected) return this.disconnect();
    appStore.patchAdb({ status: 'connecting', error: undefined });
    try {
      assertWebUsbReady();
      const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
      if (!manager) throw new AppError('WEBUSB_UNAVAILABLE', '当前浏览器无法创建 ADB WebUSB 管理器。', '请使用 Chrome 或 Edge。');
      const device = await manager.requestDevice();
      if (!device) throw new AppError('DEVICE_NOT_SELECTED', '未选择 ADB 设备。');
      const connection = await device.connect();
      const credentialStore = new AdbWebCredentialStore('adb-fastboot-toolbox');
      const transport = await AdbDaemonTransport.authenticate({
        serial: device.serial,
        connection,
        credentialStore,
      });

      this.adb = new Adb(transport);
      this.transport = transport;
      this.device = device;
      appStore.patchAdb({ status: 'connected', serial: device.serial });
      appStore.log('ADB 已连接', 'ok');
    } catch (error) {
      const appError = toAppError(error, 'ADB_AUTH_FAILED');
      appStore.patchAdb({ status: 'error', error: appError });
      appStore.log(`ADB 连接失败：${appError.message}`, 'err');
      throw appError;
    }
  }

  async disconnect(): Promise<void> {
    appStore.patchAdb({ status: 'disconnecting' });
    try {
      await this.adb?.close?.();
      await this.transport?.close?.();
    } finally {
      this.adb = null;
      this.transport = null;
      this.device = null;
      appStore.patchAdb({ status: 'idle', serial: undefined, model: undefined, android: undefined, error: undefined });
      appStore.log('ADB 已断开', 'warn');
    }
  }

  ensure(): any {
    if (!this.adb) throw new AppError('ADB_SOCKET_FAILED', '请先连接 ADB 设备。');
    return this.adb;
  }

  async socket(service: string): Promise<any> {
    const adb = this.ensure();
    if (typeof adb.createSocket === 'function') return adb.createSocket(service);
    if (adb.transport?.connect) return adb.transport.connect(service);
    if (this.transport?.connect) return this.transport.connect(service);
    throw new AppError('UNSUPPORTED_OPERATION', '当前 ADB 库实例不支持 socket 连接。');
  }
}

export const adbClient = new AdbClient();
