// Hand-rolled tokenizer for the in-simulator code panel's syntax highlighting —
// internal-docs/Algorithms.md §3.3 ("no CodeMirror/Monaco"). Deliberately separate from
// `vtl/lexer.ts`: that lexer drops comments, normalizes tabs to spaces, and reports line/column
// (not character offsets), none of which work for a `<pre>` overlay that must reconstruct the
// source byte-for-byte to stay character-aligned with the `<textarea>` it sits behind. Every
// token's `text` concatenated in order reproduces `source` exactly.

import { KEYWORDS } from '../../vtl/parser';
import { SHARED_BUILTINS } from '../../vtl/builtins/shared';
import { LINE_BUILTINS } from '../../vtl/builtins/line';
import { MAZE_BUILTINS } from '../../vtl/builtins/maze';
import { MAZE_DIRECTION_CONSTANTS } from '../../vtl/builtins/maze';

export type HighlightTokenType =
  | 'keyword'
  | 'builtin'
  | 'constant'
  | 'ident'
  | 'number'
  | 'string'
  | 'comment'
  | 'operator'
  | 'whitespace'
  | 'newline';

export interface HighlightToken {
  type: HighlightTokenType;
  text: string;
}

const BUILTIN_NAMES = new Set([...SHARED_BUILTINS, ...LINE_BUILTINS, ...MAZE_BUILTINS].map((b) => b.name));
const DIRECTION_CONSTANTS = new Set<string>(MAZE_DIRECTION_CONSTANTS);

// Mirrors `vtl/lexer.ts`'s OPERATORS list — small and grammar-frozen enough that duplicating it
// here (rather than exporting it from the lexer) is simpler than threading a shared constant
// through a module that otherwise has no reason to know this file exists.
const TWO_CHAR_OPERATORS = new Set(['..', '<=', '>=', '==', '!=']);
const ONE_CHAR_OPERATORS = new Set(['(', ')', ':', ',', '+', '-', '*', '/', '%', '<', '>', '=']);

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

/** Tokenizes `source` for display. Never throws — an unrecognized character becomes its own single-char token so the output always reconstructs the input exactly. */
export function highlightTokens(source: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const n = source.length;
  let i = 0;

  while (i < n) {
    const ch = source[i];

    if (ch === '\n') {
      tokens.push({ type: 'newline', text: '\n' });
      i++;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      let j = i;
      while (j < n && (source[j] === ' ' || source[j] === '\t')) j++;
      tokens.push({ type: 'whitespace', text: source.slice(i, j) });
      i = j;
      continue;
    }

    if (ch === '#') {
      let j = i;
      while (j < n && source[j] !== '\n') j++;
      tokens.push({ type: 'comment', text: source.slice(i, j) });
      i = j;
      continue;
    }

    if (ch === '"') {
      // Same escape-skipping rule as `vtl/lexer.ts`'s STRING scan: a backslash always consumes the
      // next char as part of the escape, even if that next char is the closing quote.
      let j = i + 1;
      while (j < n) {
        if (source[j] === '"') {
          j++;
          break;
        }
        if (source[j] === '\\' && j + 1 < n) {
          j += 2;
          continue;
        }
        j++;
      }
      tokens.push({ type: 'string', text: source.slice(i, j) });
      i = j;
      continue;
    }

    if (isDigit(ch)) {
      let j = i;
      while (j < n && isDigit(source[j])) j++;
      if (source[j] === '.' && isDigit(source[j + 1] ?? '')) {
        j++;
        while (j < n && isDigit(source[j])) j++;
      }
      tokens.push({ type: 'number', text: source.slice(i, j) });
      i = j;
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i;
      while (j < n && isIdentPart(source[j])) j++;
      const text = source.slice(i, j);
      const type: HighlightTokenType = KEYWORDS.has(text)
        ? 'keyword'
        : BUILTIN_NAMES.has(text)
          ? 'builtin'
          : DIRECTION_CONSTANTS.has(text)
            ? 'constant'
            : 'ident';
      tokens.push({ type, text });
      i = j;
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR_OPERATORS.has(two)) {
      tokens.push({ type: 'operator', text: two });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPERATORS.has(ch)) {
      tokens.push({ type: 'operator', text: ch });
      i += 1;
      continue;
    }

    tokens.push({ type: 'ident', text: ch });
    i += 1;
  }

  return tokens;
}

/** Splits a flat token stream into per-line arrays (the `newline` tokens themselves are dropped — a line is what sits between them). A trailing line with no final `\n` is included. */
export function splitTokensIntoLines(tokens: HighlightToken[]): HighlightToken[][] {
  const lines: HighlightToken[][] = [[]];
  for (const token of tokens) {
    if (token.type === 'newline') {
      lines.push([]);
      continue;
    }
    lines[lines.length - 1].push(token);
  }
  return lines;
}
