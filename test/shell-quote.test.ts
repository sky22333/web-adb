import { describe, expect, it } from 'vitest';
import { shellQuote } from '../src/core/utils/shell-quote';

describe('shellQuote', () => {
  it('wraps values safely', () => {
    expect(shellQuote('hello world')).toBe("'hello world'");
    expect(shellQuote("a'b")).toBe("'a'\"'\"'b'");
  });
});
