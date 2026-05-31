import { AppError } from '../utils/errors';

export function assertWebUsbReady(): void {
  if (!window.isSecureContext) {
    throw new AppError('INSECURE_CONTEXT', '当前页面不是安全上下文。', '请通过 HTTPS 或 localhost 打开此工具。');
  }
  if (!('usb' in navigator)) {
    throw new AppError('WEBUSB_UNAVAILABLE', '当前浏览器不支持 WebUSB。', '请使用 Chrome 或 Edge。');
  }
}

export function getUsb(): any {
  assertWebUsbReady();
  return (navigator as any).usb;
}
