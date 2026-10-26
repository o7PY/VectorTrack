// Static resolution of `for` loop bounds — shared by analyzer.ts (VTL015 validation, iteration
// caps) and compile.ts (staticNodeEstimate). A bound is "resolvable" when its shape is one of:
// a number literal, `len(name)`, `sensor_count()`, or one of those minus a number literal.
// Anything else (e.g. a param, or arithmetic other than a trailing "- N") can't be pinned down
// at compile time and is rejected — v0.3.1.md §C.1/§D.1.

import type { Expr, Program } from "./types";

export interface ArrayLengths {
  arrays: Map<string, number>;
  tables: Map<string, number>;
}

export function arrayLengthsFromProgram(program: Program): ArrayLengths {
  const arrays = new Map<string, number>();
  for (const s of program.states) {
    if (s.length !== null) arrays.set(s.name, s.length);
  }
  const tables = new Map<string, number>();
  for (const t of program.tables) tables.set(t.name, t.values.length);
  return { arrays, tables };
}

export type BoundResolution = { ok: true; value: number } | { ok: false; reason: string };

// Reads a literal number out of an expression, including a leading unary minus (e.g. `-1`),
// without evaluating anything — used for both loop bounds and compile-time index bounds checks.
export function asLiteralNumber(expr: Expr): number | null {
  if (expr.kind === "number") return expr.value;
  if (expr.kind === "unary" && expr.op === "-" && expr.expr.kind === "number") return -expr.expr.value;
  return null;
}

export function resolveLoopBound(expr: Expr, lens: ArrayLengths, maxSensorCount: number): BoundResolution {
  const lit = asLiteralNumber(expr);
  if (lit !== null) return { ok: true, value: lit };
  if (expr.kind === "call" && expr.name === "len" && expr.args.length === 1 && expr.args[0].kind === "ident") {
    const name = expr.args[0].name;
    const len = lens.arrays.get(name) ?? lens.tables.get(name);
    if (len === undefined) {
      return { ok: false, reason: `"${name}" isn't a declared array or table.` };
    }
    return { ok: true, value: len };
  }
  if (expr.kind === "call" && expr.name === "sensor_count" && expr.args.length === 0) {
    return { ok: true, value: maxSensorCount };
  }
  if (expr.kind === "binary" && expr.op === "-") {
    const rightLit = asLiteralNumber(expr.right);
    if (rightLit !== null) {
      const left = resolveLoopBound(expr.left, lens, maxSensorCount);
      if (!left.ok) return left;
      return { ok: true, value: left.value - rightLit };
    }
  }
  return {
    ok: false,
    reason: `a loop bound must be a number, "len(...)", or "sensor_count()" (optionally minus a number).`,
  };
}
