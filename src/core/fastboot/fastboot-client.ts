import { appStore } from '../state/app-store';
import { getUsb } from '../usb/usb-capabilities';
import { AppError, toAppError } from '../utils/errors';
import { FastbootPacket, isAndroidSparseImage, parseFastbootNumber, parseFastbootPacket } from './fastboot-protocol';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const RESPONSE_BYTES = 256;
const COMMAND_TIMEOUT_MS = 10_000;
const LONG_COMMAND_TIMEOUT_MS = 120_000;
const DATA_TIMEOUT_MS = 30_000;
const FLASH_TIMEOUT_MS = 120_000;

type FinalPacket = Extract<FastbootPacket, { type: 'okay' | 'data' }>;

interface EndpointSelection {
  iface: number;
  alternateSetting: number;
  epIn: any;
  epOut: any;
}

export class FastbootClient {
  device: any = null;
  iface: number | null = null;
  epIn: any = null;
  epOut: any = null;
  private locked = false;
  private maxDownloadSize?: number;

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
          'Fastboot bulk interface was not found.',
          'Make sure the device is in bootloader or fastbootd mode.',
        );
      }

      await device.claimInterface(found.iface);
      if (found.alternateSetting !== 0) await device.selectAlternateInterface(found.iface, found.alternateSetting);

      this.device = device;
      this.iface = found.iface;
      this.epIn = found.epIn;
      this.epOut = found.epOut;

      await this.probeProtocol();
      const version = await this.getvarOptional('version');
      const productName = (await this.getvarOptional('product')) || device.productName;
      this.maxDownloadSize = await this.readMaxDownloadSize();
      appStore.patchFastboot({
        status: 'connected',
        productName,
        vendorId: device.vendorId,
        productId: device.productId,
      });
      appStore.log(`Fastboot connected: ${productName || 'unknown device'} (protocol ${version || 'unknown'})`, 'ok');
    } catch (error) {
      await this.closeDevice();
      const appError = toAppError(error, 'FASTBOOT_ENDPOINT_NOT_FOUND');
      appStore.patchFastboot({ status: 'error', error: appError });
      appStore.log(`Fastboot connection failed: ${appError.message}`, 'err');
      throw appError;
    }
  }

  async disconnect(): Promise<void> {
    await this.closeDevice();
    appStore.patchFastboot({ status: 'idle', productName: undefined, vendorId: undefined, productId: undefined, error: undefined });
    appStore.log('Fastboot disconnected', 'warn');
  }

  async command(command: string): Promise<string> {
    this.ensure();
    return this.withLock(async () => this.commandUnlocked(command));
  }

  async flash(file: File, partition: string, chunkSize: number, onProgress?: (percent: number) => void): Promise<void> {
    this.ensure();
    await this.withLock(async () => {
      await this.assertFlashable(file);

      const sizeHex = file.size.toString(16).padStart(8, '0');
      await this.writeCommand(`download:${sizeHex}`);

      const { packet: data } = await this.readFinal(['data'], COMMAND_TIMEOUT_MS);
      if (data.size !== file.size) {
        throw new AppError(
          'FASTBOOT_PROTOCOL_ERROR',
          `Device accepted ${data.message} bytes, but image size is ${sizeHex}.`,
        );
      }

      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const chunk = new Uint8Array(await file.slice(offset, Math.min(offset + chunkSize, file.size)).arrayBuffer());
        await this.writeRaw(chunk, DATA_TIMEOUT_MS);
        onProgress?.(Math.min(95, ((offset + chunk.byteLength) / file.size) * 95));
      }

      await this.readFinal(['okay'], COMMAND_TIMEOUT_MS);
      await this.writeCommand(`flash:${partition}`);
      await this.readFinal(['okay'], FLASH_TIMEOUT_MS);
      onProgress?.(100);
    });
  }

  private async commandUnlocked(command: string): Promise<string> {
    await this.writeCommand(command);
    const { packet, output } = await this.readFinal(['okay', 'data'], this.commandTimeout(command));
    return (output + packet.message).trim();
  }

  private async probeProtocol(): Promise<void> {
    try {
      await this.commandUnlocked('getvar:product');
    } catch (error) {
      const appError = toAppError(error, 'FASTBOOT_FAIL');
      if (appError.code === 'FASTBOOT_FAIL') return;
      throw appError;
    }
  }

  private async assertFlashable(file: File): Promise<void> {
    const max = this.maxDownloadSize ?? (await this.readMaxDownloadSize());
    this.maxDownloadSize = max;
    if (!max || file.size <= max) return;

    const sparse = await isAndroidSparseImage(file);
    throw new AppError(
      'UNSUPPORTED_OPERATION',
      `${sparse ? 'Sparse' : 'Raw'} image is larger than the device download limit.`,
      `Image size is ${file.size} bytes, max-download-size is ${max} bytes. Split the image with platform fastboot first, or flash a smaller partition image.`,
    );
  }

  private async readMaxDownloadSize(): Promise<number | undefined> {
    const value = await this.getvarOptional('max-download-size');
    return value ? parseFastbootNumber(value) : undefined;
  }

  private async getvarOptional(name: string): Promise<string | undefined> {
    try {
      return await this.commandUnlocked(`getvar:${name}`);
    } catch (error) {
      const appError = toAppError(error, 'FASTBOOT_FAIL');
      if (appError.code === 'FASTBOOT_FAIL') return undefined;
      throw appError;
    }
  }

  private commandTimeout(command: string): number {
    return command === 'getvar:all' ? LONG_COMMAND_TIMEOUT_MS : COMMAND_TIMEOUT_MS;
  }

  private async readFinal<T extends FinalPacket['type']>(
    allowed: T[],
    timeoutMs: number,
  ): Promise<{ packet: Extract<FinalPacket, { type: T }>; output: string }> {
    let output = '';
    while (true) {
      const packet = await this.readPacket(timeoutMs);
      if (packet.type === 'fail') throw new AppError('FASTBOOT_FAIL', packet.message || 'Fastboot command failed.');
      if (packet.type === 'info') {
        appStore.log(`Fastboot INFO: ${packet.message}`, 'info');
        output += `${packet.message}\n`;
        continue;
      }
      if (packet.type === 'text') {
        appStore.log(`Fastboot TEXT: ${packet.message}`, 'info');
        output += packet.message;
        continue;
      }
      if (allowed.includes(packet.type as T)) return { packet: packet as Extract<FinalPacket, { type: T }>, output };
      return this.failSession(new AppError('FASTBOOT_PROTOCOL_ERROR', `Unexpected Fastboot ${packet.type.toUpperCase()} response.`));
    }
  }

  private async readPacket(timeoutMs: number): Promise<FastbootPacket> {
    const result = await this.transferIn(RESPONSE_BYTES, timeoutMs);
    if (result.status !== 'ok' || !result.data) {
      return this.failSession(new AppError('FASTBOOT_PROTOCOL_ERROR', `Fastboot IN transfer ended with status ${result.status}.`));
    }
    try {
      return parseFastbootPacket(decoder.decode(result.data));
    } catch (error) {
      return this.failSession(new AppError('FASTBOOT_PROTOCOL_ERROR', toAppError(error).message, undefined, undefined, error));
    }
  }

  private async writeCommand(command: string): Promise<void> {
    await this.writeRaw(encoder.encode(command), COMMAND_TIMEOUT_MS);
  }

  private async writeRaw(data: Uint8Array, timeoutMs: number): Promise<void> {
    const result = await this.transferOut(data, timeoutMs);
    if (result.status !== 'ok' || result.bytesWritten !== data.byteLength) {
      return this.failSession(
        new AppError('FASTBOOT_PROTOCOL_ERROR', `Fastboot OUT transfer wrote ${result.bytesWritten} of ${data.byteLength} bytes.`),
      );
    }
  }

  private async transferIn(length: number, timeoutMs: number): Promise<any> {
    return this.withTransferBoundary(this.device.transferIn(this.epIn.endpointNumber, length), timeoutMs, 'Fastboot IN transfer');
  }

  private async transferOut(data: Uint8Array, timeoutMs: number): Promise<any> {
    return this.withTransferBoundary(this.device.transferOut(this.epOut.endpointNumber, data), timeoutMs, 'Fastboot OUT transfer');
  }

  private async withTransferBoundary<T>(transfer: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AppError('TRANSFER_TIMEOUT', `${label} timed out.`)), timeoutMs);
    });

    try {
      return await Promise.race([transfer, timeout]);
    } catch (error) {
      const appError = toAppError(error, 'TRANSFER_ABORTED');
      await this.closeDevice();
      appStore.patchFastboot({ status: 'error', error: appError });
      throw appError;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async failSession(error: AppError): Promise<never> {
    await this.closeDevice();
    appStore.patchFastboot({ status: 'error', error });
    throw error;
  }

  private ensure(): void {
    if (!this.device) throw new AppError('FASTBOOT_ENDPOINT_NOT_FOUND', 'Connect a Fastboot device first.');
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

  private async closeDevice(): Promise<void> {
    const device = this.device;
    const iface = this.iface;
    this.device = null;
    this.iface = null;
    this.epIn = null;
    this.epOut = null;
    this.maxDownloadSize = undefined;
    this.locked = false;

    if (!device?.opened) return;
    if (iface !== null) await device.releaseInterface(iface).catch(() => undefined);
    await device.close().catch(() => undefined);
  }

  private findEndpoints(device: any): EndpointSelection | null {
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
        if (epIn && epOut) {
          return { iface: iface.interfaceNumber, alternateSetting: alt.alternateSetting, epIn, epOut };
        }
      }
    }
    return null;
  }
}

export const fastbootClient = new FastbootClient();
