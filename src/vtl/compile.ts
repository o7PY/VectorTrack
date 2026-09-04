// Ties lexing, parsing, and semantic analysis together, plus the compile-time safety caps from
// internal-docs/Algorithms.md §1.10: 16 KB source, expression depth 32, 64 states, 32 params.

import { parse } from "./parser";
import { analyze } from "./analyzer";
import { makeError } from "./errors";
import type { CompileResult, EventBlock, Expr, Program, Statement, VtlError, VtlMode } from "./types";

const MAX_SOURCE_BYTES = 16 * 1024;
const MAX_EXPR_DEPTH = 32;
const MAX_STATES = 64;
const MAX_PARAMS = 32;

function exprDepth(expr: Expr): number {
  switch (expr.kind) {
    case "number":
    case "string":
    case "ident":
      return 1;
    case "unary":
      return 1 + exprDepth(expr.expr);
    case "binary":
      return 1 + Math.max(exprDepth(expr.left), exprDepth(expr.right));
    case "call":
      return 1 + (expr.args.length > 0 ? Math.max(...expr.args.map(exprDepth)) : 0);
    default:
      return 1;
  }
}

function statementExprs(stmt: Statement): Expr[] {
  switch (stmt.kind) {
    case "let":
    case "set":
      return [stmt.expr];
    case "callStmt":
      return stmt.args;
    case "if": {
      const exprs: Expr[] = [];
      for (const b of stmt.branches) {
        exprs.push(b.cond);
        for (const s of b.body) exprs.push(...statementExprs(s));
      }
      if (stmt.elseBody) for (const s of stmt.elseBody) exprs.push(...statementExprs(s));
      return exprs;
    }
    default:
      return [];
  }
}

function checkCaps(program: Program): VtlError[] {
  const errors: VtlError[] = [];
  if (program.params.length > MAX_PARAMS) {
    errors.push(makeError("VTL014", 1, 1, `Too many params: max ${MAX_PARAMS}, found ${program.params.length}.`));
  }
  if (program.states.length > MAX_STATES) {
    errors.push(makeError("VTL014", 1, 1, `Too many states: max ${MAX_STATES}, found ${program.states.length}.`));
  }
  for (const event of program.events as EventBlock[]) {
    for (const stmt of event.body) {
      for (const expr of statementExprs(stmt)) {
        const depth = exprDepth(expr);
        if (depth > MAX_EXPR_DEPTH) {
          errors.push(
            makeError(
              "VTL014",
              expr.line,
              expr.column,
              `Expression is too deeply nested: max depth ${MAX_EXPR_DEPTH}, found ${depth}.`,
            ),
          );
        }
      }
    }
  }
  return errors;
}

export function compile(source: string, mode: VtlMode): CompileResult {
  if (source.length > MAX_SOURCE_BYTES) {
    return {
      ok: false,
      errors: [
        makeError(
          "VTL014",
          1,
          1,
          `Program is too long: max ${MAX_SOURCE_BYTES / 1024} KB, found ${(source.length / 1024).toFixed(1)} KB.`,
        ),
      ],
    };
  }

  const { program, errors: parseErrors } = parse(source);
  if (!program) return { ok: false, errors: parseErrors };

  const capErrors = checkCaps(program);
  const semErrors = analyze(program, mode);
  const allErrors = [...capErrors, ...semErrors];
  if (allErrors.length > 0) return { ok: false, errors: allErrors };
  return { ok: true, program };
}
