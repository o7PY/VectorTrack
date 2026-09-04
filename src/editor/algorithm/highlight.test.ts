import { describe, expect, it } from 'vitest';
import { highlightTokens, splitTokensIntoLines } from './highlight';

function reassemble(source: string): string {
  return highlightTokens(source)
    .map((t) => t.text)
    .join('');
}

describe('highlightTokens', () => {
  it('reconstructs the source exactly, character for character', () => {
    const source = 'param Kp = 0.45 range 0..2\n\nstate integral = 0  # comment\non tick:\n  let e = line_error()\n  drive(base - e, base + e)\n';
    expect(reassemble(source)).toBe(source);
  });

  it('classifies keywords, builtins, direction constants, and plain identifiers distinctly', () => {
    const tokens = highlightTokens('on tick:\n  if can_move(left):\n    move_to(forward)\n');
    const kinds = Object.fromEntries(tokens.filter((t) => t.type !== 'whitespace' && t.type !== 'newline').map((t) => [t.text, t.type]));
    expect(kinds.on).toBe('keyword');
    expect(kinds.if).toBe('keyword');
    expect(kinds.can_move).toBe('builtin');
    expect(kinds.move_to).toBe('builtin');
    expect(kinds.left).toBe('constant');
    expect(kinds.forward).toBe('constant');
  });

  it('treats a "#" that starts a comment as running to end of line, not consuming the newline', () => {
    const tokens = highlightTokens('drive(0, 0) # go\nlet x = 1\n');
    const comment = tokens.find((t) => t.type === 'comment');
    expect(comment?.text).toBe('# go');
    expect(tokens.some((t) => t.type === 'newline')).toBe(true);
  });

  it('treats a backslash-escaped quote inside a string as not closing the string', () => {
    const source = 'log("a\\"b", 1)\n';
    const tokens = highlightTokens(source);
    const str = tokens.find((t) => t.type === 'string');
    expect(str?.text).toBe('"a\\"b"');
    expect(reassemble(source)).toBe(source);
  });

  it('never drops or duplicates a character, even for unexpected input', () => {
    const source = 'let x = @@@ 1\n';
    expect(reassemble(source)).toBe(source);
  });
});

describe('splitTokensIntoLines', () => {
  it('splits on newline tokens and drops them, keeping a trailing line with no final newline', () => {
    const lines = splitTokensIntoLines(highlightTokens('a\nb\nc'));
    expect(lines).toHaveLength(3);
    expect(lines[0].map((t) => t.text).join('')).toBe('a');
    expect(lines[1].map((t) => t.text).join('')).toBe('b');
    expect(lines[2].map((t) => t.text).join('')).toBe('c');
  });

  it('produces one line array per newline-delimited row, including blank lines', () => {
    const lines = splitTokensIntoLines(highlightTokens('a\n\nb\n'));
    expect(lines).toHaveLength(4); // "a", "", "b", "" (trailing empty line after the final \n)
    expect(lines[1]).toEqual([]);
    expect(lines[3]).toEqual([]);
  });
});
