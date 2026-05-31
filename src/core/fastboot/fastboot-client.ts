import { appStore } from '../state/app-store';
import { getUsb } from '../usb/usb-capabilities';
import { AppError, toAppError } from '../utils/errors';
import { parseFastbootPacket } from './fastboot-protocol';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class FastbootClient {
  device: any = null;
  iface: number | null = null;
  epIn: any = null;
  epOut: any = null;
  private locked = false;

  get connected(): boolean {
    return Boolean(this.device);
  }

  async connect(): Promise<void> {
    if (this.connected) return this.disconnect();
    appStore.patchFastboot({ status: 'connecting', error: undefined });
    try {
      const usb = getUsb();
      const device = await usb.requestDevice({ filters: appStore.allVendorIds().map((vendorId) => ({ vendorId })) });
      await device.open();
      if (device.configuration === null) await device.selectConfiguration(1);
      const found = this.findEndpoints(device);
      if (!found) {
        await device.close().catch(() => undefined);
        throw new AppError(
          'FASTBOOT_ENDPOINT_NOT_FOUND',
          '未找到 Fastboot bulk 接口。',
          '请确认设备已进入 Bootloader/Fastboot 模式。',
        );
      }
      await device.claimInterface(found.iface);
      this.device = device;
      this.iface = found.iface;
      this.epIn = found.epIn;
      this.epOut = found.epOut;
      appStore.patchFastboot({
        status: 'connected',
        productName: device.productName,
        vendorId: device.vendorId,
        productId: device.productId,
      });
      appStore.log(`Fastboot 已连接：${device.productName || '未知设备'}`, 'ok');
    } catch (error) {
      this.device = null;
      this.iface = null;
      this.epIn = null;
      this.epOut = null;
      const appError = toAppError(error, 'FASTBOOT_ENDPOINT_NOT_FOUND');
      appStore.patchFastboot({ status: 'error', error: appError });
      appStore.log(`Fastboot 连接失败：${appError.message}`, 'err');
      throw appError;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.device?.opened) {
        if (this.iface !== null) await this.device.releaseInterface(this.iface);
        await this.device.close();
      }
    } finally {
      this.device = null;
      this.iface = null;
      this.epIn = null;
      this.epOut = null;
      this.locked = false;
      appStore.patchFastboot({ status: 'idle', productName: undefined, vendorId: undefined, productId: undefined, error: undefined });
      appStore.log('Fastboot 已断开', 'warn');
    }
  }

  async command(command: string): Promise<string> {
    this.ensure();
    return this.withLock(async () => this.commandUnlocked(command));
  }

  async commandUnlocked(command: string): Promise<string> {
    await this.write(encoder.encode(command));
    let output = '';
    for (let i = 0; i < 256; i += 1) {
      const packet = parseFastbootPacket(await this.read());
      if (packet.type === 'okay') return (output + packet.message).trim();
      if (packet.type === 'fail') throw new AppError('FASTBOOT_FAIL', packet.message || 'Fastboot 返回 FAIL。');
      if (packet.type === 'info') {
        output += `${packet.message}\n`;
        continue;
      }
      if (packet.type === 'data') return packet.message.trim();
    }
    throw new AppError('TRANSFER_TIMEOUT', 'Fastboot 响应超时。');
  }

  async flash(file: File, partition: string, chunkSize: number, onProgress?: (percent: number) => void): Promise<void> {
    this.ensure();
    await this.withLock(async () => {
      const sizeHex = file.size.toString(16).padStart(8, '0');
      await this.write(encoder.encode(`download:${sizeHex}`));
      const ack = parseFastbootPacket(await this.read());
      if (ack.type !== 'data') throw new AppError('FASTBOOT_FAIL', `download 无响应：${ack.message}`);
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const chunk = new Uint8Array(await file.slice(offset, Math.min(offset + chunkSize, file.size)).arrayBuffer());
        await this.writeRaw(chunk);
        onProgress?.(Math.min(100, ((offset + chunk.byteLength) / file.size) * 100));
      }
      const done = parseFastbootPacket(await this.read());
      if (done.type === 'fail') throw new AppError('FASTBOOT_FAIL', done.message);
      await this.write(encoder.encode(`flash:${partition}`));
      for (let i = 0; i < 128; i += 1) {
        const packet = parseFastbootPacket(await this.read());
        if (packet.type === 'okay') return;
        if (packet.type === 'fail') throw new AppError('FASTBOOT_FAIL', packet.message);
        if (packet.type === 'info') appStore.log(`Fastboot INFO: ${packet.message}`, 'info');
      }
      throw new AppError('TRANSFER_TIMEOUT', '刷入命令响应超时。');
    });
  }

  private ensure(): void {
    if (!this.device) throw new AppError('FASTBOOT_ENDPOINT_NOT_FOUND', '请先连接 Fastboot 设备。');
  }

  private async withLock<T>(task: () => Promise<T>): Promise<T> {
    while (this.locked) await new Promise((resolve) => setTimeout(resolve, 30));
    this.locked = true;
    try {
      return await task();
    } finally {
      this.locked = false;
    }
  }

  private async write(data: Uint8Array): Promise<void> {
    await this.writeRaw(data);
  }

  private async writeRaw(data: Uint8Array): Promise<void> {
    await this.device.transferOut(this.epOut.endpointNumber, data);
    if (data.byteLength % this.epOut.packetSize === 0) {
      await this.device.transferOut(this.epOut.endpointNumber, new Uint8Array(0));
    }
  }

  private async read(): Promise<string> {
    const result = await this.device.transferIn(this.epIn.endpointNumber, this.epIn.packetSize || 64);
    return decoder.decode(result.data);
  }

  private findEndpoints(device: any): { iface: number; epIn: any; epOut: any } | null {
    for (const iface of device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass !== 0xff) continue;
        let epIn = null;
        let epOut = null;
        for (const ep of alt.endpoints) {
          if (ep.type !== 'bulk') continue;
          if (ep.direction === 'in') epIn = ep;
          if (ep.direction === 'out') epOut = ep;
        }
        if (epIn && epOut) return { iface: iface.interfaceNumber, epIn, epOut };
      }
    }
    return null;
  }
}

export const fastbootClient = new FastbootClient();
