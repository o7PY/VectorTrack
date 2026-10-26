// VTL semantic analysis: name resolution, mode-scoped builtin checks, arity/type checks,
// and declaration-level rules. Runs after a successful parse. See internal-docs/Algorithms.md
// §1.9 for the error-code table this file implements.

import { makeError, unknownFunctionError, unknownIdentifierError } from "./errors";
import { SHARED_BUILTINS, type BuiltinSig } from "./builtins/shared";
import { LINE_BUILTINS } from "./builtins/line";
import { MAZE_BUILTINS, MAZE_DIRECTION_CONSTANTS } from "./builtins/maze";
import { MAX_ARRAY_LENGTH, MAX_LOOP_ITERATIONS, MAX_LOOP_NEST_DEPTH, MAX_TABLE_LENGTH } from "./caps";
import { arrayLengthsFromProgram, asLiteralNumber, resolveLoopBound } from "./loopBounds";
import { MAX_RANGEFINDER_SENSORS, MAX_REFLECTANCE_SENSORS } from "../sim/sensors/placement";
import type {
  CallStmt,
  Expr,
  ForStmt,
  IfStmt,
  IndexedSetStmt,
  LetStmt,
  Program,
  SetStmt,
  Statement,
  VtlError,
  VtlMode,
  VtlValueKind,
} from "./types";

type InferredType = VtlValueKind | "unknown";

interface ArrayOrTableInfo {
  kind: "array" | "table";
  length: number;
}

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
  deriv: ["number", "number"],
  steer: ["number", "number"],
  range: ["string"],
  can_move: ["string"],
  move_to: ["string"],
  visited: ["string"],
  distance_to_goal: ["string"],
};

class Scope {
  private vars = new Map<string, InferredType>();
  private immutable = new Set<string>();
  private parent: Scope | null;
  constructor(parent: Scope | null = null) {
    this.parent = parent;
  }

  child(): Scope {
    return new Scope(this);
  }

  declare(name: string, type: InferredType, opts: { immutable?: boolean } = {}): void {
    this.vars.set(name, type);
    if (opts.immutable) this.immutable.add(name);
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

  // True only for a loop variable — a fresh, immutable binding introduced by `for` (§C.2).
  isImmutable(name: string): boolean {
    if (this.vars.has(name)) return this.immutable.has(name);
    return this.parent ? this.parent.isImmutable(name) : false;
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
    if (s.length !== null) {
      if (!Number.isInteger(s.length) || s.length < 1 || s.length > MAX_ARRAY_LENGTH) {
        errors.push(
          makeError(
            "VTL009",
            s.line,
            s.column,
            `"${s.name}"'s array length must be a whole number from 1 to ${MAX_ARRAY_LENGTH}, found ${s.length}.`,
          ),
        );
      }
    }
  }
  for (const t of program.tables) {
    if (declaredNames.has(t.name)) {
      errors.push(makeError("VTL009", t.line, t.column, `"${t.name}" is already declared.`));
    }
    declaredNames.add(t.name);
    if (t.values.length < 1 || t.values.length > MAX_TABLE_LENGTH) {
      errors.push(
        makeError(
          "VTL009",
          t.line,
          t.column,
          `"${t.name}"'s table must have between 1 and ${MAX_TABLE_LENGTH} values, found ${t.values.length}.`,
        ),
      );
    }
  }

  const arrayInfo = new Map<string, ArrayOrTableInfo>();
  for (const s of program.states) {
    if (s.length !== null) arrayInfo.set(s.name, { kind: "array", length: s.length });
  }
  for (const t of program.tables) arrayInfo.set(t.name, { kind: "table", length: t.values.length });
  const arrayLengths = arrayLengthsFromProgram(program);
  const maxSensorCount = mode === "line" ? MAX_REFLECTANCE_SENSORS : MAX_RANGEFINDER_SENSORS;

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
    // Array states are never plain scope variables — a bare reference to one is a compile error
    // (VTL016) rather than a normal number, so it's resolved through `arrayInfo` instead.
    if (s.length === null) globalScope.declare(s.name, s.valueKind === "none" ? "unknown" : s.valueKind);
  }
  if (mode === "maze") {
    for (const d of MAZE_DIRECTION_CONSTANTS) globalScope.declare(d, "string");
  }
  const stateNames = new Set(program.states.filter((s) => s.length === null).map((s) => s.name));
  const paramNames = new Set(program.params.map((p) => p.name));
  let loopNestDepth = 0;
  let insideLoopDepth = 0;

  const ownBuiltins: BuiltinSig[] = [...SHARED_BUILTINS, ...(mode === "line" ? LINE_BUILTINS : MAZE_BUILTINS)];
  const otherBuiltins: BuiltinSig[] = mode === "line" ? MAZE_BUILTINS : LINE_BUILTINS;
  const otherModeName: VtlMode = mode === "line" ? "maze" : "line";

  // `len(a)` is a language-level pseudo-function, not a mode-scoped builtin: its argument is a
  // bare array/table name, not a value, so it can't go through the normal sig-based checkCall path.
  function checkLenCall(args: Expr[], line: number, column: number): InferredType {
    if (args.length !== 1) {
      errors.push(makeError("VTL007", line, column, `"len" takes 1 argument, got ${args.length}.`));
      return "number";
    }
    const arg = args[0];
    if (arg.kind !== "ident") {
      errors.push(
        makeError("VTL016", arg.line, arg.column, `"len(...)" needs an array or table name, not an expression.`),
      );
      return "number";
    }
    const info = arrayInfo.get(arg.name);
    if (!info) {
      if (stateNames.has(arg.name) || paramNames.has(arg.name)) {
        errors.push(
          makeError(
            "VTL016",
            arg.line,
            arg.column,
            `"${arg.name}" is a number — "len(...)" needs an array or table name.`,
          ),
        );
      } else {
        errors.push(unknownIdentifierError(arg.name, arg.line, arg.column, [...arrayInfo.keys()]));
      }
    }
    return "number";
  }

  function checkCall(name: string, args: Expr[], line: number, column: number, scope: Scope): InferredType {
    if (name === "len") return checkLenCall(args, line, column);
    if (name === "deriv" && insideLoopDepth > 0) {
      errors.push(
        makeError(
          "VTL013",
          line,
          column,
          `"deriv" keeps its own state per call site, so it can't be called from inside a loop.`,
        ),
      );
    }
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
        if (arrayInfo.has(expr.name)) {
          errors.push(
            makeError(
              "VTL016",
              expr.line,
              expr.column,
              `"${expr.name}" is ${arrayInfo.get(expr.name)!.kind === "table" ? "a table" : "an array"} — use "${expr.name}[i]" to read an element, or "len(${expr.name})" for its length.`,
            ),
          );
          return "number";
        }
        const t = scope.lookup(expr.name);
        if (t === null) {
          errors.push(unknownIdentifierError(expr.name, expr.line, expr.column, scope.allNames()));
          return "unknown";
        }
        return t;
      }
      case "call":
        return checkCall(expr.name, expr.args, expr.line, expr.column, scope);
      case "index": {
        const info = arrayInfo.get(expr.name);
        if (!info) {
          if (scope.lookup(expr.name) !== null) {
            errors.push(
              makeError("VTL016", expr.line, expr.column, `"${expr.name}" is a number — it can't be indexed.`),
            );
          } else {
            errors.push(unknownIdentifierError(expr.name, expr.line, expr.column, [...arrayInfo.keys(), ...scope.allNames()]));
          }
          return "number";
        }
        const idxType = inferType(expr.index, scope);
        if (idxType !== "unknown" && idxType !== "number") {
          errors.push(
            makeError("VTL008", expr.index.line, expr.index.column, `An array index must be a number, got a ${idxType}.`),
          );
        }
        const litIdx = asLiteralNumber(expr.index);
        if (litIdx !== null && (litIdx < 0 || litIdx >= info.length)) {
          errors.push(
            makeError(
              "VTL017",
              expr.index.line,
              expr.index.column,
              `Index ${litIdx} is out of range for "${expr.name}" (length ${info.length}).`,
            ),
          );
        }
        return "number";
      }
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
      default: {
        const _exhaustive: never = expr;
        return _exhaustive;
      }
    }
  }

  // Type-checks whatever's inside the bound expression (so a bad sub-part still gets its own
  // error), then separately checks the bound's overall *shape* is one of the statically
  // resolvable forms — v0.3.1.md §C.1.
  function checkLoopBound(expr: Expr, scope: Scope): void {
    inferType(expr, scope);
    const resolved = resolveLoopBound(expr, arrayLengths, maxSensorCount);
    if (!resolved.ok) {
      errors.push(makeError("VTL015", expr.line, expr.column, `Invalid loop bound: ${resolved.reason}`));
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
        if (arrayInfo.has(setStmt.name)) {
          const info = arrayInfo.get(setStmt.name)!;
          errors.push(
            makeError(
              "VTL016",
              setStmt.line,
              setStmt.column,
              `"${setStmt.name}" is ${info.kind === "table" ? "a table" : "an array"} — use "${setStmt.name}[i] = ..." to set one element.`,
            ),
          );
          inferType(setStmt.expr, scope);
          return;
        }
        const isState = stateNames.has(setStmt.name);
        const letOwner = scope.owner(setStmt.name);
        const isLet = letOwner !== null && !paramNames.has(setStmt.name) && !stateNames.has(setStmt.name);
        const isLoopVar = isLet && letOwner!.isImmutable(setStmt.name);
        if (!isState && !isLet) {
          const reason = paramNames.has(setStmt.name)
            ? `"${setStmt.name}" is a param — params can't be changed from inside the program.`
            : `"${setStmt.name}" isn't a state or a variable declared with "let".`;
          errors.push(makeError("VTL006", setStmt.line, setStmt.column, reason));
        } else if (isLoopVar) {
          errors.push(
            makeError(
              "VTL006",
              setStmt.line,
              setStmt.column,
              `"${setStmt.name}" is a loop variable — loop variables can't be reassigned.`,
            ),
          );
        }
        inferType(setStmt.expr, scope);
        return;
      }
      case "indexedSet": {
        const idxStmt = stmt as IndexedSetStmt;
        const info = arrayInfo.get(idxStmt.name);
        if (!info) {
          if (scope.lookup(idxStmt.name) !== null) {
            errors.push(
              makeError("VTL016", idxStmt.line, idxStmt.column, `"${idxStmt.name}" is a number — it can't be indexed.`),
            );
          } else {
            errors.push(unknownIdentifierError(idxStmt.name, idxStmt.line, idxStmt.column, [...arrayInfo.keys(), ...scope.allNames()]));
          }
        } else if (info.kind === "table") {
          errors.push(
            makeError(
              "VTL006",
              idxStmt.line,
              idxStmt.column,
              `"${idxStmt.name}" is a table — tables are immutable and can't be assigned to.`,
            ),
          );
        }
        const idxType = inferType(idxStmt.index, scope);
        if (idxType !== "unknown" && idxType !== "number") {
          errors.push(
            makeError("VTL008", idxStmt.index.line, idxStmt.index.column, `An array index must be a number, got a ${idxType}.`),
          );
        }
        if (info) {
          const litIdx = asLiteralNumber(idxStmt.index);
          if (litIdx !== null && (litIdx < 0 || litIdx >= info.length)) {
            errors.push(
              makeError(
                "VTL017",
                idxStmt.index.line,
                idxStmt.index.column,
                `Index ${litIdx} is out of range for "${idxStmt.name}" (length ${info.length}).`,
              ),
            );
          }
        }
        const valType = inferType(idxStmt.expr, scope);
        if (valType !== "unknown" && valType !== "number") {
          errors.push(
            makeError("VTL008", idxStmt.expr.line, idxStmt.expr.column, `An array element must be a number, got a ${valType}.`),
          );
        }
        return;
      }
      case "for": {
        const forStmt = stmt as ForStmt;
        checkLoopBound(forStmt.from, scope);
        checkLoopBound(forStmt.to, scope);
        if (loopNestDepth >= MAX_LOOP_NEST_DEPTH) {
          errors.push(
            makeError(
              "VTL015",
              forStmt.line,
              forStmt.column,
              `Loops can nest at most ${MAX_LOOP_NEST_DEPTH} deep.`,
            ),
          );
        }
        const fromR = resolveLoopBound(forStmt.from, arrayLengths, maxSensorCount);
        const toR = resolveLoopBound(forStmt.to, arrayLengths, maxSensorCount);
        if (fromR.ok && toR.ok) {
          const iterations = Math.max(0, toR.value - fromR.value + 1);
          if (iterations > MAX_LOOP_ITERATIONS) {
            errors.push(
              makeError(
                "VTL015",
                forStmt.line,
                forStmt.column,
                `This loop would run ${iterations} times; the limit is ${MAX_LOOP_ITERATIONS}.`,
              ),
            );
          }
        }
        const child = scope.child();
        child.declare(forStmt.varName, "number", { immutable: true });
        loopNestDepth++;
        insideLoopDepth++;
        for (const s of forStmt.body) checkStatement(s, child);
        insideLoopDepth--;
        loopNestDepth--;
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
      default: {
        const _exhaustive: never = stmt;
        return _exhaustive;
      }
    }
  }

  for (const event of program.events) {
    const scope = globalScope.child();
    for (const stmt of event.body) checkStatement(stmt, scope);
  }

  return errors;
}
