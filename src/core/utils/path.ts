export function joinPath(base: string, name: string): string {
  if (!base || base === '/') return `/${name.replace(/^\/+/, '')}`;
  return `${base.replace(/\/+$/, '')}/${name.replace(/^\/+/, '')}`;
}

export function dirname(path: string): string {
  const cleaned = path.replace(/\/+$/, '');
  const index = cleaned.lastIndexOf('/');
  if (index <= 0) return '/';
  return `${cleaned.slice(0, index)}/`;
}

export function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() || 'download.bin';
}

const protectedPaths = new Set(['/', '/sdcard', '/sdcard/', '/system', '/vendor', '/product', '/data']);

export function assertSafeDeletePath(path: string): void {
  const normalized = path.trim().replace(/\/+$/, '') || '/';
  if (protectedPaths.has(normalized) || normalized.length < 5) {
    throw new Error(`拒绝删除高风险路径：${path}`);
  }
}
