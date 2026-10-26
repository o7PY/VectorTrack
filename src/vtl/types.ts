// VTL ("VectorTrack Language") — AST and compile-result types.
// Grammar source of truth: internal-docs/Algorithms.md §1.3.

export type VtlMode = "line" | "maze";

export type VtlValueKind = "number" | "string" | "bool" | "none";

export interface SourcePos {
  line: number;
  column: number;
}

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "<"
  | ">"
  | "<="
  | ">="
  | "=="
  | "!="
  | "and"
  | "or";

export type UnaryOp = "-" | "not";

export type Expr =
  | NumberLit
  | StringLit
  | Identifier
  | CallExpr
  | UnaryExpr
  | BinaryExpr
  | IndexExpr;

export interface NumberLit extends SourcePos {
  kind: "number";
  value: number;
}

export interface StringLit extends SourcePos {
  kind: "string";
  value: string;
}

export interface Identifier extends SourcePos {
  kind: "ident";
  name: string;
}

export interface CallExpr extends SourcePos {
  kind: "call";
  name: string;
  args: Expr[];
}

export interface UnaryExpr extends SourcePos {
  kind: "unary";
  op: UnaryOp;
  expr: Expr;
}

export interface BinaryExpr extends SourcePos {
  kind: "binary";
  op: BinaryOp;
  left: Expr;
  right: Expr;
}

// `mu[i]` — reading one element of an array or table. Always infers type "number" (arrays hold
// numbers only), so to the analyzer it's indistinguishable from any other number expression.
// v0.3.1.md §D.
export interface IndexExpr extends SourcePos {
  kind: "index";
  name: string;
  index: Expr;
}

export type Statement = LetStmt | SetStmt | IfStmt | CallStmt | ForStmt | IndexedSetStmt;

export interface LetStmt extends SourcePos {
  kind: "let";
  name: string;
  expr: Expr;
}

export interface SetStmt extends SourcePos {
  kind: "set";
  name: string;
  expr: Expr;
}

// `set mu[i] = v` — writing one element of an array (never a table; tables are immutable).
export interface IndexedSetStmt extends SourcePos {
  kind: "indexedSet";
  name: string;
  index: Expr;
  expr: Expr;
}

// `for i in from..to:` — `from`/`to` are ordinary expressions; the analyzer statically resolves
// them to one of {literal, len(...), sensor_count()} (optionally minus a literal) and rejects
// anything else as VTL015. The loop variable is a fresh, immutable, block-scoped binding.
// v0.3.1.md §C.1/§C.2.
export interface ForStmt extends SourcePos {
  kind: "for";
  varName: string;
  from: Expr;
  to: Expr;
  body: Statement[];
}

export interface IfBranch {
  cond: Expr;
  body: Statement[];
}

export interface IfStmt extends SourcePos {
  kind: "if";
  branches: IfBranch[];
  elseBody: Statement[] | null;
}

export interface CallStmt extends SourcePos {
  kind: "callStmt";
  name: string;
  args: Expr[];
}

export interface ParamDeclNumber extends SourcePos {
  kind: "param";
  valueKind: "number";
  name: string;
  value: number;
  range: [number, number];
}

export interface ParamDeclString extends SourcePos {
  kind: "param";
  valueKind: "string";
  name: string;
  value: string;
  options: string[];
}

export type ParamDecl = ParamDeclNumber | ParamDeclString;

// `length: null` is an ordinary scalar state. `length: N` is `state name[N] = value` — an array of
// N numbers, each initialized to `value`. Arrays hold numbers only (v0.3.1.md §C.2), so `valueKind`
// is always "number" when `length` isn't null.
export interface StateDecl extends SourcePos {
  kind: "state";
  name: string;
  valueKind: "number" | "string" | "none";
  value: number | string | null;
  length: number | null;
}

// `table t = [...]` — an immutable, compile-time-only array of number literals. Lives on
// `Program`, not `VtlRunState`: it never changes at runtime, so it costs no per-run storage.
// v0.3.1.md §C/§G.
export interface TableDecl extends SourcePos {
  kind: "table";
  name: string;
  values: number[];
}

export type VtlEventName = "start" | "tick" | "junction";

export interface EventBlock extends SourcePos {
  kind: "event";
  event: VtlEventName;
  body: Statement[];
}

export interface Program {
  params: ParamDecl[];
  states: StateDecl[];
  tables: TableDecl[];
  events: EventBlock[];
}

export interface VtlError {
  code: string;
  message: string;
  line: number;
  column: number;
}

export type CompileResult =
  | { ok: true; program: Program }
  | { ok: false; errors: VtlError[] };
