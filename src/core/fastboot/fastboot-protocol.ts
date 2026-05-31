export type FastbootPacket =
  | { type: 'okay'; message: string }
  | { type: 'fail'; message: string }
  | { type: 'info'; message: string }
  | { type: 'data'; message: string };

export function parseFastbootPacket(packet: string): FastbootPacket {
  const prefix = packet.slice(0, 4);
  const message = packet.slice(4);
  if (prefix === 'OKAY') return { type: 'okay', message };
  if (prefix === 'FAIL') return { type: 'fail', message };
  if (prefix === 'INFO') return { type: 'info', message };
  if (prefix === 'DATA') return { type: 'data', message };
  return { type: 'info', message: packet };
}

export const PARTITIONS = [
  'boot',
  'boot_a',
  'boot_b',
  'init_boot',
  'init_boot_a',
  'init_boot_b',
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
  return [...PARTITIONS].sort((a, b) => b.length - a.length).find((part) => normalized.includes(part)) || '';
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
