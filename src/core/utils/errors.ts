export type AppErrorCode =
  | 'WEBUSB_UNAVAILABLE'
  | 'INSECURE_CONTEXT'
  | 'DEVICE_NOT_SELECTED'
  | 'ADB_AUTH_FAILED'
  | 'ADB_SOCKET_FAILED'
  | 'FASTBOOT_ENDPOINT_NOT_FOUND'
  | 'FASTBOOT_FAIL'
  | 'TRANSFER_ABORTED'
  | 'TRANSFER_TIMEOUT'
  | 'UNSUPPORTED_OPERATION'
  | 'UNKNOWN';

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public suggestion?: string,
    public detail?: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toAppError(error: unknown, fallback: AppErrorCode = 'UNKNOWN'): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) return new AppError(fallback, error.message, undefined, error.stack, error);
  return new AppError(fallback, String(error));
}
