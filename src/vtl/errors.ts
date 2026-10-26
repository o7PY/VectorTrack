// VTL error codes VTL001-VTL017 — internal-docs/Algorithms.md §1.9.
// Every message here is public-facing copy (SPEC.md's copy standard): no section
// references, no "not yet implemented" language.

import type { VtlError } from "./types";

export type VtlErrorCode =
  | "VTL001"
  | "VTL002"
  | "VTL003"
  | "VTL004"
  | "VTL005"
  | "VTL006"
  | "VTL007"
  | "VTL008"
  | "VTL009"
  | "VTL010"
  | "VTL011"
  | "VTL012"
  | "VTL013"
  | "VTL014"
  | "VTL015"
  | "VTL016"
  | "VTL017";

export function makeError(
  code: VtlErrorCode,
  line: number,
  column: number,
  message: string,
): VtlError {
  return { code, message, line, column };
}

// Levenshtein edit distance, used to rank near-match suggestions for VTL003/VTL004.
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[rows - 1][cols - 1];
}

// Orders `candidates` by similarity to `name`, nearest first, capped to `limit`.
export function nearMatches(name: string, candidates: string[], limit = 3): string[] {
  return candidates
    .map((c) => ({ c, dist: editDistance(name.toLowerCase(), c.toLowerCase()) }))
    .filter((entry) => entry.dist <= Math.max(2, Math.ceil(name.length / 2)))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
    .map((entry) => entry.c);
}

function formatList(items: string[]): string {
  if (items.length === 0) return "nothing";
  return items.join(", ");
}

export function unknownIdentifierError(
  name: string,
  line: number,
  column: number,
  inScope: string[],
): VtlError {
  const near = nearMatches(name, inScope);
  const suggestion =
    near.length > 0
      ? ` Did you mean ${formatList(near)}?`
      : inScope.length > 0
        ? ` In scope: ${formatList(inScope)}.`
        : "";
  return makeError("VTL003", line, column, `"${name}" isn't defined.${suggestion}`);
}

export function unknownFunctionError(
  name: string,
  line: number,
  column: number,
  available: string[],
): VtlError {
  const near = nearMatches(name, available);
  const suggestion =
    near.length > 0 ? ` Did you mean ${formatList(near)}?` : ` Available: ${formatList(available)}.`;
  return makeError("VTL004", line, column, `"${name}" isn't a function.${suggestion}`);
}

export function wrongModeBuiltinError(
  name: string,
  line: number,
  column: number,
  belongsTo: "line" | "maze",
): VtlError {
  return makeError(
    "VTL005",
    line,
    column,
    `"${name}" is a ${belongsTo}-mode builtin and isn't available here.`,
  );
}
