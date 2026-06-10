export type FastbootPacket =
  | { type: 'okay'; message: string }
  | { type: 'fail'; message: string }
  | { type: 'info'; message: string }
  | { type: 'text'; message: string }
  | { type: 'data'; message: string; size: number };

export function parseFastbootPacket(packet: string): FastbootPacket {
  const prefix = packet.slice(0, 4);
  const message = packet.slice(4).replace(/\0+$/, '');
  if (prefix === 'OKAY') return { type: 'okay', message };
  if (prefix === 'FAIL') return { type: 'fail', message };
  if (prefix === 'INFO') return { type: 'info', message };
  if (prefix === 'TEXT') return { type: 'text', message };
  if (prefix === 'DATA') {
    if (!/^[0-9a-fA-F]{8}$/.test(message)) {
      throw new Error(`Invalid Fastboot DATA packet: ${packet}`);
    }
    return { type: 'data', message, size: Number.parseInt(message, 16) };
  }
  throw new Error(`Unknown Fastboot packet: ${packet}`);
}

export const PARTITIONS = [
  'boot',
  'boot_a',
  'boot_b',
  'init_boot',
  'init_boot_a',
  'init_boot_b',
  'vendor_boot',
  'vendor_boot_a',
  'vendor_boot_b',
  'recovery',
  'system',
  'system_a',
  'system_b',
  'vendor',
  'vendor_a',
  'vendor_b',
  'vbmeta',
  'vbmeta_a',
  'vbmeta_b',
  'dtbo',
  'super',
  'userdata',
];

export function guessPartition(name: string): string {
  const normalized = name.toLowerCase().replace(/\.(img|bin)$/, '');
  if (PARTITIONS.includes(normalized)) return normalized;
  const slotless = normalized.replace(/_(a|b)$/, '');
  return PARTITIONS.includes(slotless) ? slotless : '';
}

export function normalizeFastbootCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed || trimmed.includes(':')) return trimmed;
  const [verb, ...rest] = trimmed.split(/\s+/);
  const arg = rest.join(' ');
  if (['getvar', 'erase', 'flash'].includes(verb) && arg) return `${verb}:${arg}`;
  if (verb === 'oem' && arg) return `oem ${arg}`;
  return trimmed;
}

export function parseFastbootNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed.replace(/^0x/i, ''), 16);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function isAndroidSparseImage(file: File): Promise<boolean> {
  if (file.size < 4) return false;
  const header = new DataView(await file.slice(0, 4).arrayBuffer());
  return header.getUint32(0, true) === 0xed26ff3a;
}
