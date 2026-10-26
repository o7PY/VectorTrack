// Ties lexing, parsing, and semantic analysis together, plus the compile-time safety caps from
// internal-docs/Algorithms.md §1.10: 16 KB source, expression depth 32, 64 states, 32 params.

import { parse } from "./parser";
import { analyze } from "./analyzer";
import { makeError } from "./errors";
import {
  DEFAULT_NODE_BUDGET,
  MAX_EXPR_DEPTH,
  MAX_LOOP_ITERATIONS,
  MAX_PARAMS,
  MAX_SOURCE_BYTES,
  MAX_STATES,
} from "./caps";
import { arrayLengthsFromProgram, resolveLoopBound } from "./loopBounds";
import { MAX_RANGEFINDER_SENSORS, MAX_REFLECTANCE_SENSORS } from "../sim/sensors/placement";
import type { CompileResult, EventBlock, Expr, ForStmt, Program, Statement, VtlError, VtlMode } from "./types";

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
    case "index":
      return 1 + exprDepth(expr.index);
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

function statementExprs(stmt: Statement): Expr[] {
  switch (stmt.kind) {
    case "let":
    case "set":
      return [stmt.expr];
    case "indexedSet":
      return [stmt.index, stmt.expr];
    case "callStmt":
      return stmt.args;
    case "for": {
      const exprs: Expr[] = [stmt.from, stmt.to];
      for (const s of stmt.body) exprs.push(...statementExprs(s));
      return exprs;
    }
    case "if": {
      const exprs: Expr[] = [];
      for (const b of stmt.branches) {
        exprs.push(b.cond);
        for (const s of b.body) exprs.push(...statementExprs(s));
      }
      if (stmt.elseBody) for (const s of stmt.elseBody) exprs.push(...statementExprs(s));
      return exprs;
    }
    default: {
      const _exhaustive: never = stmt;
      return _exhaustive;
    }
  }
}

// Walks each event block, multiplying a loop body's per-iteration cost by its statically resolved
// iteration count and taking an `if`'s worst single branch (condition + body) rather than summing
// all branches — converting the common runtime VTL014 into a compile-time error that names the
// dominating loop. v0.3.1.md §D.1.
function estimateExprCost(expr: Expr): number {
  switch (expr.kind) {
    case "number":
    case "string":
    case "ident":
      return 1;
    case "unary":
      return 1 + estimateExprCost(expr.expr);
    case "binary":
      return 1 + estimateExprCost(expr.left) + estimateExprCost(expr.right);
    case "call":
      return 1 + expr.args.reduce((sum, a) => sum + estimateExprCost(a), 0);
    case "index":
      return 1 + estimateExprCost(expr.index);
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

interface CostEstimate {
  total: number;
  worstLoop: ForStmt | null;
  worstLoopCost: number;
}

function mergeWorst(a: CostEstimate, b: { stmt: ForStmt | null; cost: number }): CostEstimate {
  if (b.stmt && b.cost > a.worstLoopCost) {
    return { total: a.total, worstLoop: b.stmt, worstLoopCost: b.cost };
  }
  return a;
}

function estimateStatementCost(
  stmt: Statement,
  lens: ReturnType<typeof arrayLengthsFromProgram>,
  maxSensorCount: number,
): CostEstimate {
  switch (stmt.kind) {
    case "let":
    case "set":
      return { total: 1 + estimateExprCost(stmt.expr), worstLoop: null, worstLoopCost: 0 };
    case "indexedSet":
      return {
        total: 1 + estimateExprCost(stmt.index) + estimateExprCost(stmt.expr),
        worstLoop: null,
        worstLoopCost: 0,
      };
    case "callStmt":
      return {
        total: 1 + stmt.args.reduce((sum, a) => sum + estimateExprCost(a), 0),
        worstLoop: null,
        worstLoopCost: 0,
      };
    case "if": {
      let worst: CostEstimate = { total: 1, worstLoop: null, worstLoopCost: 0 };
      let worstBranchCost = 0;
      for (const b of stmt.branches) {
        let branchTotal = estimateExprCost(b.cond);
        for (const s of b.body) {
          const c = estimateStatementCost(s, lens, maxSensorCount);
          branchTotal += c.total;
          worst = mergeWorst(worst, { stmt: c.worstLoop, cost: c.worstLoopCost });
        }
        worstBranchCost = Math.max(worstBranchCost, branchTotal);
      }
      if (stmt.elseBody) {
        let branchTotal = 0;
        for (const s of stmt.elseBody) {
          const c = estimateStatementCost(s, lens, maxSensorCount);
          branchTotal += c.total;
          worst = mergeWorst(worst, { stmt: c.worstLoop, cost: c.worstLoopCost });
        }
        worstBranchCost = Math.max(worstBranchCost, branchTotal);
      }
      return { total: worst.total + worstBranchCost, worstLoop: worst.worstLoop, worstLoopCost: worst.worstLoopCost };
    }
    case "for": {
      let bodyTotal = 0;
      let worst: CostEstimate = { total: 0, worstLoop: null, worstLoopCost: 0 };
      for (const s of stmt.body) {
        const c = estimateStatementCost(s, lens, maxSensorCount);
        bodyTotal += c.total;
        worst = mergeWorst(worst, { stmt: c.worstLoop, cost: c.worstLoopCost });
      }
      const fromR = resolveLoopBound(stmt.from, lens, maxSensorCount);
      const toR = resolveLoopBound(stmt.to, lens, maxSensorCount);
      const iterations = fromR.ok && toR.ok ? Math.max(0, toR.value - fromR.value + 1) : MAX_LOOP_ITERATIONS;
      const clamped = Math.min(iterations, MAX_LOOP_ITERATIONS);
      const thisLoopCost = 1 + estimateExprCost(stmt.from) + estimateExprCost(stmt.to) + clamped * bodyTotal;
      worst = mergeWorst(worst, { stmt, cost: thisLoopCost });
      return { total: thisLoopCost, worstLoop: worst.worstLoop, worstLoopCost: worst.worstLoopCost };
    }
    default: {
      const _exhaustive: never = stmt;
      return _exhaustive;
    }
  }
}

function staticNodeEstimateErrors(program: Program, mode: VtlMode): VtlError[] {
  const errors: VtlError[] = [];
  const lens = arrayLengthsFromProgram(program);
  const maxSensorCount = mode === "line" ? MAX_REFLECTANCE_SENSORS : MAX_RANGEFINDER_SENSORS;
  for (const event of program.events as EventBlock[]) {
    let total = 0;
    let worst: CostEstimate = { total: 0, worstLoop: null, worstLoopCost: 0 };
    for (const stmt of event.body) {
      const c = estimateStatementCost(stmt, lens, maxSensorCount);
      total += c.total;
      worst = mergeWorst(worst, { stmt: c.worstLoop, cost: c.worstLoopCost });
    }
    if (total > DEFAULT_NODE_BUDGET) {
      const loop = worst.worstLoop;
      const detail = loop
        ? ` The loop at line ${loop.line} accounts for most of it.`
        : "";
      errors.push(
        makeError(
          "VTL014",
          event.line,
          event.column,
          `This "on ${event.event}" block would need about ${total} evaluated steps in a single tick — the limit is ${DEFAULT_NODE_BUDGET}.${detail}`,
        ),
      );
    }
  }
  return errors;
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

  // Only meaningful once the program is otherwise well-formed — a bad reference elsewhere would
  // make the cost estimate noise, not signal.
  const budgetErrors = staticNodeEstimateErrors(program, mode);
  if (budgetErrors.length > 0) return { ok: false, errors: budgetErrors };
  return { ok: true, program };
}
