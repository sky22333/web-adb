import { describe, expect, it } from 'vitest';
import { assertSafeDeletePath, basename, dirname, joinPath } from '../src/core/utils/path';

describe('path utilities', () => {
  it('joins and splits android paths', () => {
    expect(joinPath('/sdcard/', 'Download/a.txt')).toBe('/sdcard/Download/a.txt');
    expect(dirname('/sdcard/Download/a.txt')).toBe('/sdcard/Download/');
    expect(basename('/sdcard/Download/a.txt')).toBe('a.txt');
  });

  it('blocks protected delete paths', () => {
    expect(() => assertSafeDeletePath('/')).toThrow();
    expect(() => assertSafeDeletePath('/sdcard/')).toThrow();
    expect(() => assertSafeDeletePath('/sdcard/Download/file.txt')).not.toThrow();
  });
});
