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
  | BinaryExpr;

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

export type Statement = LetStmt | SetStmt | IfStmt | CallStmt;

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

export interface StateDecl extends SourcePos {
  kind: "state";
  name: string;
  valueKind: "number" | "string" | "none";
  value: number | string | null;
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
