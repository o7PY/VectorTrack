// VTL lexer — tab-to-4-space normalization, then Python-style INDENT/DEDENT tracking.
// Grammar source of truth: internal-docs/Algorithms.md §1.3.

import type { VtlError } from "./types";
import { makeError } from "./errors";

export type TokenType =
  | "NUMBER"
  | "STRING"
  | "NAME"
  | "OP"
  | "NEWLINE"
  | "INDENT"
  | "DEDENT"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  numberValue?: number;
  line: number;
  column: number;
}

// Exported so display-only tooling (editor/algorithm/highlight.ts) can assert its own operator
// set against this one and catch drift — see highlight.test.ts.
export const OPERATORS = [
  "..",
  "<=",
  ">=",
  "==",
  "!=",
  "(",
  ")",
  "[",
  "]",
  ":",
  ",",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "=",
];

export interface LexResult {
  tokens: Token[];
  errors: VtlError[];
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

export function tokenize(source: string): LexResult {
  const errors: VtlError[] = [];
  const tokens: Token[] = [];
  const rawLines = source.split(/\r\n|\r|\n/);
  const indentStack = [0];
  // Depth of unclosed `[`/`(` carried across line boundaries, so a `table` literal (or any
  // bracketed expression) can be wrapped across lines without tripping INDENT/DEDENT or needing a
  // NEWLINE mid-declaration — Python does the same for its own brackets.
  let bracketDepth = 0;

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const lineNo = lineIdx + 1;
    const original = rawLines[lineIdx];
    // Normalize leading tabs to 4 spaces before measuring indentation (§1.2.2).
    let leading = "";
    let i = 0;
    while (i < original.length && (original[i] === " " || original[i] === "\t")) {
      leading += original[i] === "\t" ? "    " : " ";
      i++;
    }
    const rest = original.slice(i);
    const contentOnly = rest.split("#")[0];
    if (contentOnly.trim().length === 0) {
      // Blank or comment-only line: no tokens, indentation unaffected (Python behavior).
      continue;
    }
    const indent = leading.length;
    const isContinuation = bracketDepth > 0;

    if (!isContinuation && indent > indentStack[indentStack.length - 1]) {
      indentStack.push(indent);
      tokens.push({ type: "INDENT", value: "", line: lineNo, column: 1 });
    } else if (!isContinuation && indent < indentStack[indentStack.length - 1]) {
      while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
        indentStack.pop();
        tokens.push({ type: "DEDENT", value: "", line: lineNo, column: 1 });
      }
      if (indentStack[indentStack.length - 1] !== indent) {
        errors.push(
          makeError(
            "VTL002",
            lineNo,
            indent + 1,
            `Indentation doesn't match an enclosing block. Expected column ${indentStack[indentStack.length - 1] + 1}, found column ${indent + 1}.`,
          ),
        );
        // Recover by treating this line at the nearest known level.
        indentStack.push(indent);
      }
    }

    let col = indent;
    let hadTokenOnLine = false;
    while (col < rest.length + indent) {
      const idx = col - indent;
      const ch = rest[idx];
      if (ch === undefined) break;
      if (ch === "#") break; // comment runs to end of line
      if (ch === " " || ch === "\t") {
        col++;
        continue;
      }
      const startCol = col + 1;

      if (ch === '"') {
        let j = idx + 1;
        let value = "";
        let closed = false;
        while (j < rest.length) {
          const c = rest[j];
          if (c === '"') {
            closed = true;
            j++;
            break;
          }
          if (c === "\\" && j + 1 < rest.length) {
            const next = rest[j + 1];
            value += next === "n" ? "\n" : next;
            j += 2;
            continue;
          }
          value += c;
          j++;
        }
        if (!closed) {
          errors.push(makeError("VTL001", lineNo, startCol, "Unterminated string literal."));
        }
        tokens.push({ type: "STRING", value, line: lineNo, column: startCol });
        hadTokenOnLine = true;
        col = indent + j;
        continue;
      }

      if (isDigit(ch)) {
        let j = idx;
        while (j < rest.length && isDigit(rest[j])) j++;
        if (rest[j] === "." && isDigit(rest[j + 1] ?? "")) {
          j++;
          while (j < rest.length && isDigit(rest[j])) j++;
        }
        const text = rest.slice(idx, j);
        tokens.push({ type: "NUMBER", value: text, numberValue: Number(text), line: lineNo, column: startCol });
        hadTokenOnLine = true;
        col = indent + j;
        continue;
      }

      if (isIdentStart(ch)) {
        let j = idx;
        while (j < rest.length && isIdentPart(rest[j])) j++;
        const text = rest.slice(idx, j);
        tokens.push({ type: "NAME", value: text, line: lineNo, column: startCol });
        hadTokenOnLine = true;
        col = indent + j;
        continue;
      }

      const two = rest.slice(idx, idx + 2);
      if (two.length === 2 && OPERATORS.includes(two)) {
        tokens.push({ type: "OP", value: two, line: lineNo, column: startCol });
        hadTokenOnLine = true;
        col = indent + idx + 2;
        continue;
      }
      const one = rest[idx];
      if (OPERATORS.includes(one)) {
        if (one === "[" || one === "(") bracketDepth++;
        else if ((one === "]" || one === ")") && bracketDepth > 0) bracketDepth--;
        tokens.push({ type: "OP", value: one, line: lineNo, column: startCol });
        hadTokenOnLine = true;
        col = indent + idx + 1;
        continue;
      }

      errors.push(makeError("VTL001", lineNo, startCol, `Unexpected character "${ch}".`));
      col = indent + idx + 1;
    }

    if (hadTokenOnLine && bracketDepth === 0) {
      tokens.push({ type: "NEWLINE", value: "", line: lineNo, column: rest.length + indent + 1 });
    }
  }

  const lastLine = rawLines.length + 1;
  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push({ type: "DEDENT", value: "", line: lastLine, column: 1 });
  }
  tokens.push({ type: "EOF", value: "", line: lastLine, column: 1 });

  return { tokens, errors };
}
