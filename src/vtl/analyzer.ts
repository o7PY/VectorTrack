// VTL semantic analysis: name resolution, mode-scoped builtin checks, arity/type checks,
// and declaration-level rules. Runs after a successful parse. See internal-docs/Algorithms.md
// §1.9 for the error-code table this file implements.

import { makeError, unknownFunctionError, unknownIdentifierError } from "./errors";
import { SHARED_BUILTINS, type BuiltinSig } from "./builtins/shared";
import { LINE_BUILTINS } from "./builtins/line";
import { MAZE_BUILTINS, MAZE_DIRECTION_CONSTANTS } from "./builtins/maze";
import type {
  CallStmt,
  Expr,
  IfStmt,
  LetStmt,
  Program,
  SetStmt,
  Statement,
  VtlError,
  VtlMode,
  VtlValueKind,
} from "./types";

type InferredType = VtlValueKind | "unknown";

// Per-argument-position expected types for builtins whose signature is unambiguous from the
// spec text. `null` at a position means "not checked" (the spec doesn't pin down a type there).
const ARG_TYPES: Record<string, (VtlValueKind | null)[]> = {
  abs: ["number"],
  min: ["number", "number"],
  max: ["number", "number"],
  clamp: ["number", "number", "number"],
  sign: ["number"],
  sqrt: ["number"],
  sin: ["number"],
  cos: ["number"],
  atan2: ["number", "number"],
  log: ["string", null],
  sensor: ["number"],
  sensor_x: ["number"],
  sensor_y: ["number"],
  drive: ["number", "number"],
  range: ["string"],
  can_move: ["string"],
  move_to: ["string"],
  visited: ["string"],
  distance_to_goal: ["string"],
};

class Scope {
  private vars = new Map<string, InferredType>();
  private parent: Scope | null;
  constructor(parent: Scope | null = null) {
    this.parent = parent;
  }

  child(): Scope {
    return new Scope(this);
  }

  declare(name: string, type: InferredType): void {
    this.vars.set(name, type);
  }

  // Returns the scope that owns `name`, walking outward, or null if undeclared.
  owner(name: string): Scope | null {
    if (this.vars.has(name)) return this;
    return this.parent ? this.parent.owner(name) : null;
  }

  lookup(name: string): InferredType | null {
    const owner = this.owner(name);
    return owner ? (owner.vars.get(name) as InferredType) : null;
  }

  allNames(): string[] {
    const names = [...this.vars.keys()];
    return this.parent ? [...names, ...this.parent.allNames()] : names;
  }
}

export function analyze(program: Program, mode: VtlMode): VtlError[] {
  const errors: VtlError[] = [];
  const declaredNames = new Set<string>();

  for (const p of program.params) {
    if (declaredNames.has(p.name)) {
      errors.push(makeError("VTL009", p.line, p.column, `"${p.name}" is already declared.`));
    }
    declaredNames.add(p.name);
    if (p.valueKind === "number" && p.range[0] >= p.range[1]) {
      errors.push(
        makeError(
          "VTL009",
          p.line,
          p.column,
          `"${p.name}"'s range must have a lower bound below its upper bound (got ${p.range[0]}..${p.range[1]}).`,
        ),
      );
    }
  }
  for (const s of program.states) {
    if (declaredNames.has(s.name)) {
      errors.push(makeError("VTL009", s.line, s.column, `"${s.name}" is already declared.`));
    }
    declaredNames.add(s.name);
  }

  const requiredEvents = mode === "line" ? ["tick"] : ["tick", "junction"];
  const hasRequired = program.events.some((e) => requiredEvents.includes(e.event));
  if (!hasRequired) {
    const needs = mode === "line" ? "an `on tick` block" : "an `on tick` or `on junction` block";
    errors.push(
      makeError("VTL010", 1, 1, `A ${mode} program needs ${needs}.`),
    );
  }
  for (const e of program.events) {
    if (mode === "line" && e.event === "junction") {
      errors.push(
        makeError("VTL010", e.line, e.column, `"on junction" is a maze-mode event and isn't available here.`),
      );
    }
  }

  const globalScope = new Scope();
  for (const p of program.params) globalScope.declare(p.name, p.valueKind);
  for (const s of program.states) {
    globalScope.declare(s.name, s.valueKind === "none" ? "unknown" : s.valueKind);
  }
  if (mode === "maze") {
    for (const d of MAZE_DIRECTION_CONSTANTS) globalScope.declare(d, "string");
  }
  const stateNames = new Set(program.states.map((s) => s.name));
  const paramNames = new Set(program.params.map((p) => p.name));

  const ownBuiltins: BuiltinSig[] = [...SHARED_BUILTINS, ...(mode === "line" ? LINE_BUILTINS : MAZE_BUILTINS)];
  const otherBuiltins: BuiltinSig[] = mode === "line" ? MAZE_BUILTINS : LINE_BUILTINS;
  const otherModeName: VtlMode = mode === "line" ? "maze" : "line";

  function checkCall(name: string, args: Expr[], line: number, column: number, scope: Scope): InferredType {
    // Resolve the call target and report mode/name problems before inspecting its
    // arguments, so e.g. calling a maze builtin from a line program reports VTL005
    // instead of an unrelated VTL003 from an argument that only makes sense in maze mode.
    const sig = ownBuiltins.find((b) => b.name === name);
    if (!sig) {
      const otherSig = otherBuiltins.find((b) => b.name === name);
      if (otherSig) {
        errors.push(
          makeError(
            "VTL005",
            line,
            column,
            `"${name}" is a ${otherModeName}-mode builtin and isn't available here.`,
          ),
        );
      } else {
        errors.push(unknownFunctionError(name, line, column, ownBuiltins.map((b) => b.name)));
      }
      for (const a of args) inferType(a, scope);
      return "unknown";
    }

    if (args.length !== sig.arity) {
      errors.push(
        makeError(
          "VTL007",
          line,
          column,
          `"${name}" takes ${sig.arity} argument${sig.arity === 1 ? "" : "s"}, got ${args.length}.`,
        ),
      );
    }

    const expected = ARG_TYPES[name];
    args.forEach((a, i) => {
      const got = inferType(a, scope);
      const want = expected?.[i];
      if (want && got !== "unknown" && got !== want) {
        errors.push(
          makeError(
            "VTL008",
            a.line,
            a.column,
            `"${name}"'s argument ${i + 1} should be a ${want}, got a ${got}.`,
          ),
        );
      }
    });

    return sig.returns;
  }

  function inferType(expr: Expr, scope: Scope): InferredType {
    switch (expr.kind) {
      case "number":
        return "number";
      case "string":
        return "string";
      case "ident": {
        const t = scope.lookup(expr.name);
        if (t === null) {
          errors.push(unknownIdentifierError(expr.name, expr.line, expr.column, scope.allNames()));
          return "unknown";
        }
        return t;
      }
      case "call":
        return checkCall(expr.name, expr.args, expr.line, expr.column, scope);
      case "unary": {
        const t = inferType(expr.expr, scope);
        if (expr.op === "-") {
          if (t !== "unknown" && t !== "number") {
            errors.push(makeError("VTL008", expr.line, expr.column, `Can't negate a ${t}.`));
          }
          return "number";
        }
        if (t !== "unknown" && t !== "bool") {
          errors.push(makeError("VTL008", expr.line, expr.column, `"not" needs a true/false value, got a ${t}.`));
        }
        return "bool";
      }
      case "binary": {
        const l = inferType(expr.left, scope);
        const r = inferType(expr.right, scope);
        if (["+", "-", "*", "/", "%"].includes(expr.op)) {
          if ((l !== "unknown" && l !== "number") || (r !== "unknown" && r !== "number")) {
            errors.push(
              makeError("VTL008", expr.line, expr.column, `Arithmetic ("${expr.op}") needs numbers, not ${l !== "number" ? l : r}.`),
            );
          }
          return "number";
        }
        if (["<", ">", "<=", ">="].includes(expr.op)) {
          if ((l !== "unknown" && l !== "number") || (r !== "unknown" && r !== "number")) {
            errors.push(
              makeError("VTL008", expr.line, expr.column, `Comparison ("${expr.op}") needs numbers, not ${l !== "number" ? l : r}.`),
            );
          }
          return "bool";
        }
        if (expr.op === "and" || expr.op === "or") {
          if ((l !== "unknown" && l !== "bool") || (r !== "unknown" && r !== "bool")) {
            errors.push(
              makeError("VTL008", expr.line, expr.column, `"${expr.op}" needs true/false values, not ${l !== "bool" ? l : r}.`),
            );
          }
          return "bool";
        }
        // == / != : any matching types allowed.
        return "bool";
      }
      default:
        return "unknown";
    }
  }

  function checkStatement(stmt: Statement, scope: Scope): void {
    switch (stmt.kind) {
      case "let": {
        const letStmt = stmt as LetStmt;
        const t = inferType(letStmt.expr, scope);
        scope.declare(letStmt.name, t);
        return;
      }
      case "set": {
        const setStmt = stmt as SetStmt;
        const isState = stateNames.has(setStmt.name);
        const letOwner = scope.owner(setStmt.name);
        const isLet = letOwner !== null && !paramNames.has(setStmt.name) && !stateNames.has(setStmt.name);
        if (!isState && !isLet) {
          const reason = paramNames.has(setStmt.name)
            ? `"${setStmt.name}" is a param — params can't be changed from inside the program.`
            : `"${setStmt.name}" isn't a state or a variable declared with "let".`;
          errors.push(makeError("VTL006", setStmt.line, setStmt.column, reason));
        }
        inferType(setStmt.expr, scope);
        return;
      }
      case "if": {
        const ifStmt = stmt as IfStmt;
        for (const branch of ifStmt.branches) {
          inferType(branch.cond, scope);
          const child = scope.child();
          for (const s of branch.body) checkStatement(s, child);
        }
        if (ifStmt.elseBody) {
          const child = scope.child();
          for (const s of ifStmt.elseBody) checkStatement(s, child);
        }
        return;
      }
      case "callStmt": {
        const callStmt = stmt as CallStmt;
        checkCall(callStmt.name, callStmt.args, callStmt.line, callStmt.column, scope);
        return;
      }
    }
  }

  for (const event of program.events) {
    const scope = globalScope.child();
    for (const stmt of event.body) checkStatement(stmt, scope);
  }

  return errors;
}
