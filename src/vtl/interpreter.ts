// VTL tree-walking interpreter. Mode-agnostic: takes a compiled `Program` plus a table of
// host-supplied builtin implementations (wired up per mode by sim/algorithms/vtlAdapter.ts in a
// later phase) and runs one event at a time. See internal-docs/Algorithms.md §1.6/§1.10.

import { DEFAULT_NODE_BUDGET } from "./caps";
import type { Expr, Identifier, Program, Statement, VtlEventName } from "./types";

export type VtlValue = number | string | boolean | null;

export class VtlRuntimeHalt extends Error {
  code: string;
  line: number;
  column: number;
  constructor(code: string, message: string, line: number, column: number) {
    super(message);
    this.code = code;
    this.line = line;
    this.column = column;
  }
}

// Thrown by a builtin (e.g. `move_to`) to end the current event's remaining statements without
// being an error — Algorithms.md §1.6: "Ends the current on junction."
export class VtlEventStop extends Error {}

export interface VtlBuiltinContext {
  line: number;
  column: number;
}

export type VtlBuiltinFn = (args: VtlValue[], ctx: VtlBuiltinContext) => VtlValue;

export interface VtlRunState {
  states: Map<string, VtlValue>;
  params: Map<string, VtlValue>;
  // Read-only global identifiers that aren't params/states, e.g. maze mode's direction words
  // (Algorithms.md §1.7) — supplied by the caller since the interpreter itself is mode-agnostic.
  constants: Map<string, VtlValue>;
  // Array states only — tables are compile-time-only and read straight from `Program` instead.
  arrays: Map<string, number[]>;
}

export function createRunState(program: Program, constants: Record<string, VtlValue> = {}): VtlRunState {
  const states = new Map<string, VtlValue>();
  const arrays = new Map<string, number[]>();
  for (const s of program.states) {
    if (s.length !== null) {
      arrays.set(s.name, new Array(s.length).fill(s.value as number));
    } else {
      states.set(s.name, s.value);
    }
  }
  const params = new Map<string, VtlValue>();
  for (const p of program.params) params.set(p.name, p.value);
  return { states, params, constants: new Map(Object.entries(constants)), arrays };
}

export function truthy(v: VtlValue): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  return false;
}

class RuntimeScope {
  private vars = new Map<string, VtlValue>();
  private parent: RuntimeScope | null;
  constructor(parent: RuntimeScope | null) {
    this.parent = parent;
  }

  child(): RuntimeScope {
    return new RuntimeScope(this);
  }

  declare(name: string, value: VtlValue): void {
    this.vars.set(name, value);
  }

  has(name: string): boolean {
    if (this.vars.has(name)) return true;
    return this.parent ? this.parent.has(name) : false;
  }

  get(name: string): VtlValue {
    if (this.vars.has(name)) return this.vars.get(name) as VtlValue;
    if (this.parent) return this.parent.get(name);
    throw new Error(`Internal error: "${name}" not found in scope.`);
  }

  set(name: string, value: VtlValue): void {
    if (this.vars.has(name)) {
      this.vars.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.set(name, value);
      return;
    }
    throw new Error(`Internal error: "${name}" not found in scope.`);
  }
}

function toFiniteNumber(v: VtlValue, opLabel: string, line: number, column: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new VtlRuntimeHalt("VTL011", `"${opLabel}" produced a non-numeric or infinite result.`, line, column);
  }
  return n;
}

function evalBinaryOp(op: string, l: VtlValue, r: VtlValue, line: number, column: number): VtlValue {
  switch (op) {
    case "+":
    case "-":
    case "*": {
      const a = toFiniteNumber(l, op, line, column);
      const b = toFiniteNumber(r, op, line, column);
      const result = op === "+" ? a + b : op === "-" ? a - b : a * b;
      if (!Number.isFinite(result)) {
        throw new VtlRuntimeHalt("VTL011", `"${op}" produced a non-numeric or infinite result.`, line, column);
      }
      return result;
    }
    case "/":
    case "%": {
      const a = toFiniteNumber(l, op, line, column);
      const b = toFiniteNumber(r, op, line, column);
      if (b === 0) {
        throw new VtlRuntimeHalt("VTL011", `Division by zero ("${op}").`, line, column);
      }
      const result = op === "/" ? a / b : a % b;
      if (!Number.isFinite(result)) {
        throw new VtlRuntimeHalt("VTL011", `"${op}" produced a non-numeric or infinite result.`, line, column);
      }
      return result;
    }
    case "<":
      return Number(l) < Number(r);
    case ">":
      return Number(l) > Number(r);
    case "<=":
      return Number(l) <= Number(r);
    case ">=":
      return Number(l) >= Number(r);
    case "==":
      return l === r;
    case "!=":
      return l !== r;
    default:
      throw new Error(`Internal error: unknown operator "${op}".`);
  }
}

export class Interpreter {
  private program: Program;
  private builtins: Record<string, VtlBuiltinFn>;
  private nodeBudget: number;
  private nodeCount = 0;
  private tableValues = new Map<string, number[]>();

  constructor(program: Program, builtins: Record<string, VtlBuiltinFn>, nodeBudget = DEFAULT_NODE_BUDGET) {
    this.program = program;
    this.builtins = builtins;
    this.nodeBudget = nodeBudget;
    for (const t of program.tables) this.tableValues.set(t.name, t.values);
  }

  // Arrays are mutable per-run state; tables are immutable and read straight from the program.
  private readIndexable(name: string, state: VtlRunState): number[] {
    const arr = state.arrays.get(name) ?? this.tableValues.get(name);
    if (!arr) throw new Error(`Internal error: "${name}" is neither an array nor a table.`);
    return arr;
  }

  // Runs every event block matching `eventName`, in source order (Algorithms.md §1.5: "strictly
  // source order — no implicit scheduling").
  runEvent(eventName: VtlEventName, state: VtlRunState): void {
    this.nodeCount = 0;
    const blocks = this.program.events.filter((e) => e.event === eventName);
    for (const block of blocks) {
      const scope = new RuntimeScope(null);
      try {
        this.execStatements(block.body, scope, state);
      } catch (e) {
        if (e instanceof VtlEventStop) continue;
        throw e;
      }
    }
  }

  private tick(line: number, column: number): void {
    this.nodeCount++;
    if (this.nodeCount > this.nodeBudget) {
      throw new VtlRuntimeHalt(
        "VTL014",
        `Program exceeded ${this.nodeBudget} evaluated steps in a single tick.`,
        line,
        column,
      );
    }
  }

  private execStatements(stmts: Statement[], scope: RuntimeScope, state: VtlRunState): void {
    for (const stmt of stmts) this.execStatement(stmt, scope, state);
  }

  private execStatement(stmt: Statement, scope: RuntimeScope, state: VtlRunState): void {
    this.tick(stmt.line, stmt.column);
    switch (stmt.kind) {
      case "let":
        scope.declare(stmt.name, this.evalExpr(stmt.expr, scope, state));
        return;
      case "set": {
        const value = this.evalExpr(stmt.expr, scope, state);
        if (state.states.has(stmt.name)) {
          state.states.set(stmt.name, value);
        } else {
          scope.set(stmt.name, value);
        }
        return;
      }
      case "if": {
        for (const branch of stmt.branches) {
          if (truthy(this.evalExpr(branch.cond, scope, state))) {
            this.execStatements(branch.body, scope.child(), state);
            return;
          }
        }
        if (stmt.elseBody) this.execStatements(stmt.elseBody, scope.child(), state);
        return;
      }
      case "callStmt":
        this.evalCall(stmt.name, stmt.args, stmt.line, stmt.column, scope, state);
        return;
      case "indexedSet": {
        const idx = Math.trunc(toFiniteNumber(this.evalExpr(stmt.index, scope, state), "[...]", stmt.line, stmt.column));
        const value = toFiniteNumber(this.evalExpr(stmt.expr, scope, state), "set", stmt.line, stmt.column);
        const arr = state.arrays.get(stmt.name);
        if (!arr) throw new Error(`Internal error: array "${stmt.name}" not found.`);
        if (idx < 0 || idx >= arr.length) {
          throw new VtlRuntimeHalt(
            "VTL017",
            `Index ${idx} is out of range for "${stmt.name}" (length ${arr.length}).`,
            stmt.line,
            stmt.column,
          );
        }
        arr[idx] = value;
        return;
      }
      case "for": {
        const from = Math.trunc(toFiniteNumber(this.evalExpr(stmt.from, scope, state), "for", stmt.line, stmt.column));
        const to = Math.trunc(toFiniteNumber(this.evalExpr(stmt.to, scope, state), "for", stmt.line, stmt.column));
        for (let i = from; i <= to; i++) {
          const child = scope.child();
          child.declare(stmt.varName, i);
          this.execStatements(stmt.body, child, state);
        }
        return;
      }
      default: {
        const _exhaustive: never = stmt;
        return _exhaustive;
      }
    }
  }

  private evalCall(
    name: string,
    argExprs: Expr[],
    line: number,
    column: number,
    scope: RuntimeScope,
    state: VtlRunState,
  ): VtlValue {
    // `len(name)` is a language-level pseudo-function: its argument is a bare array/table name,
    // resolved from the AST directly rather than evaluated as a normal expression (the analyzer
    // guarantees the argument is an Identifier naming a declared array or table).
    if (name === "len") {
      const arg = argExprs[0] as Identifier;
      return this.readIndexable(arg.name, state).length;
    }
    const args = argExprs.map((a) => this.evalExpr(a, scope, state));
    const fn = this.builtins[name];
    if (!fn) {
      throw new VtlRuntimeHalt("VTL004", `"${name}" isn't a function.`, line, column);
    }
    try {
      return fn(args, { line, column });
    } catch (e) {
      if (e instanceof VtlEventStop || e instanceof VtlRuntimeHalt) throw e;
      throw new VtlRuntimeHalt("VTL011", e instanceof Error ? e.message : String(e), line, column);
    }
  }

  private evalExpr(expr: Expr, scope: RuntimeScope, state: VtlRunState): VtlValue {
    this.tick(expr.line, expr.column);
    switch (expr.kind) {
      case "number":
        return expr.value;
      case "string":
        return expr.value;
      case "ident": {
        if (scope.has(expr.name)) return scope.get(expr.name);
        if (state.states.has(expr.name)) return state.states.get(expr.name) as VtlValue;
        if (state.params.has(expr.name)) return state.params.get(expr.name) as VtlValue;
        if (state.constants.has(expr.name)) return state.constants.get(expr.name) as VtlValue;
        throw new VtlRuntimeHalt("VTL003", `"${expr.name}" isn't defined.`, expr.line, expr.column);
      }
      case "call":
        return this.evalCall(expr.name, expr.args, expr.line, expr.column, scope, state);
      case "index": {
        const arr = this.readIndexable(expr.name, state);
        const idx = Math.trunc(toFiniteNumber(this.evalExpr(expr.index, scope, state), "[...]", expr.line, expr.column));
        if (idx < 0 || idx >= arr.length) {
          throw new VtlRuntimeHalt(
            "VTL017",
            `Index ${idx} is out of range for "${expr.name}" (length ${arr.length}).`,
            expr.line,
            expr.column,
          );
        }
        return arr[idx];
      }
      case "unary": {
        const v = this.evalExpr(expr.expr, scope, state);
        if (expr.op === "-") return -toFiniteNumber(v, "-", expr.line, expr.column);
        return !truthy(v);
      }
      case "binary": {
        if (expr.op === "and") {
          const l = this.evalExpr(expr.left, scope, state);
          if (!truthy(l)) return false;
          return truthy(this.evalExpr(expr.right, scope, state));
        }
        if (expr.op === "or") {
          const l = this.evalExpr(expr.left, scope, state);
          if (truthy(l)) return true;
          return truthy(this.evalExpr(expr.right, scope, state));
        }
        const l = this.evalExpr(expr.left, scope, state);
        const r = this.evalExpr(expr.right, scope, state);
        return evalBinaryOp(expr.op, l, r, expr.line, expr.column);
      }
      default:
        throw new Error("Internal error: unknown expression kind.");
    }
  }
}
