import { describe, expect, it } from 'vitest';
import { parseLsOutput } from '../src/core/utils/ls-parser';

describe('parseLsOutput', () => {
  it('parses directories and files', () => {
    const rows = parseLsOutput(
      [
        'total 4',
        'drwxr-xr-x 2 shell shell 4096 2026-06-01 00:00 Download',
        '-rw-r--r-- 1 shell shell 12 2026-06-01 00:01 note.txt',
      ].join('\n'),
      '/sdcard/',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].isDir).toBe(true);
    expect(rows[1].path).toBe('/sdcard/note.txt');
  });
});
