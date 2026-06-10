import { describe, expect, it } from 'vitest';
import { guessPartition, normalizeFastbootCommand, parseFastbootPacket } from '../src/core/fastboot/fastboot-protocol';

describe('fastboot protocol', () => {
  it('parses packet prefixes', () => {
    expect(parseFastbootPacket('OKAYdone')).toEqual({ type: 'okay', message: 'done' });
    expect(parseFastbootPacket('FAILbad')).toEqual({ type: 'fail', message: 'bad' });
    expect(parseFastbootPacket('INFOstep')).toEqual({ type: 'info', message: 'step' });
    expect(parseFastbootPacket('TEXTstep')).toEqual({ type: 'text', message: 'step' });
    expect(parseFastbootPacket('DATA00000100')).toEqual({ type: 'data', message: '00000100', size: 256 });
  });

  it('guesses partitions from filenames', () => {
    expect(guessPartition('boot.img')).toBe('boot');
    expect(guessPartition('magisk_patched_init_boot.img')).toBe('init_boot');
    expect(guessPartition('unknown.img')).toBe('');
  });

  it('normalizes cli-like commands to raw protocol commands', () => {
    expect(normalizeFastbootCommand('getvar product')).toBe('getvar:product');
    expect(normalizeFastbootCommand('erase userdata')).toBe('erase:userdata');
    expect(normalizeFastbootCommand('flashing unlock')).toBe('flashing unlock');
  });
});
