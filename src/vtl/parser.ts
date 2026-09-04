// VTL recursive-descent parser — internal-docs/Algorithms.md §1.3 grammar, exactly.

import type { Token, TokenType } from "./lexer";
import { tokenize } from "./lexer";
import { makeError } from "./errors";
import type {
  BinaryOp,
  CallStmt,
  EventBlock,
  Expr,
  IfBranch,
  IfStmt,
  LetStmt,
  ParamDecl,
  Program,
  SetStmt,
  StateDecl,
  Statement,
  UnaryOp,
  VtlError,
  VtlEventName,
} from "./types";

class ParseAbort extends Error {
  vtlError: VtlError;
  constructor(vtlError: VtlError) {
    super(vtlError.message);
    this.vtlError = vtlError;
  }
}

const EVENT_NAMES: VtlEventName[] = ["start", "tick", "junction"];
// Exported so display-only tooling (editor/algorithm/highlight.ts) can classify identifiers as
// keywords without duplicating this list and risking drift from the grammar.
export const KEYWORDS = new Set([
  "param",
  "state",
  "on",
  "let",
  "set",
  "if",
  "elif",
  "else",
  "and",
  "or",
  "not",
  "none",
  "range",
  "options",
]);

class Parser {
  private pos = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  private isType(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private isName(value: string): boolean {
    const t = this.peek();
    return t.type === "NAME" && t.value === value;
  }

  private isOp(value: string): boolean {
    const t = this.peek();
    return t.type === "OP" && t.value === value;
  }

  private fail(message: string, token: Token = this.peek()): never {
    throw new ParseAbort(makeError("VTL001", token.line, token.column, message));
  }

  private expectType(type: TokenType, what: string): Token {
    if (!this.isType(type)) {
      this.fail(`Expected ${what}, found "${this.peek().value || this.peek().type}".`);
    }
    return this.advance();
  }

  private expectName(value: string): Token {
    if (!this.isName(value)) {
      this.fail(`Expected "${value}", found "${this.peek().value || this.peek().type}".`);
    }
    return this.advance();
  }

  private expectOp(value: string): Token {
    if (!this.isOp(value)) {
      this.fail(`Expected "${value}", found "${this.peek().value || this.peek().type}".`);
    }
    return this.advance();
  }

  parseProgram(): Program {
    const params: ParamDecl[] = [];
    const states: StateDecl[] = [];
    const events: EventBlock[] = [];

    while (!this.isType("EOF")) {
      if (this.isName("param")) {
        params.push(this.parseParamDecl());
        this.expectType("NEWLINE", "end of line");
      } else if (this.isName("state")) {
        states.push(this.parseStateDecl());
        this.expectType("NEWLINE", "end of line");
      } else if (this.isName("on")) {
        events.push(this.parseEventBlock());
      } else {
        this.fail(`Unexpected "${this.peek().value || this.peek().type}" at the top level.`);
      }
    }

    return { params, states, events };
  }

  private parseParamDecl(): ParamDecl {
    const start = this.expectName("param");
    const name = this.expectType("NAME", "a parameter name").value;
    this.expectOp("=");
    if (this.isType("NUMBER")) {
      const value = this.advance().numberValue as number;
      this.expectName("range");
      const lo = this.expectType("NUMBER", "a range lower bound").numberValue as number;
      this.expectOp("..");
      const hi = this.expectType("NUMBER", "a range upper bound").numberValue as number;
      return {
        kind: "param",
        valueKind: "number",
        name,
        value,
        range: [lo, hi],
        line: start.line,
        column: start.column,
      };
    }
    if (this.isType("STRING")) {
      const value = this.advance().value;
      this.expectName("options");
      const options = [this.expectType("STRING", "a string option").value];
      while (this.isOp(",")) {
        this.advance();
        options.push(this.expectType("STRING", "a string option").value);
      }
      return {
        kind: "param",
        valueKind: "string",
        name,
        value,
        options,
        line: start.line,
        column: start.column,
      };
    }
    this.fail("A param needs a number (with a range) or a string (with options).");
  }

  private parseStateDecl(): StateDecl {
    const start = this.expectName("state");
    const name = this.expectType("NAME", "a state name").value;
    this.expectOp("=");
    if (this.isType("NUMBER")) {
      const value = this.advance().numberValue as number;
      return { kind: "state", name, valueKind: "number", value, line: start.line, column: start.column };
    }
    if (this.isType("STRING")) {
      const value = this.advance().value;
      return { kind: "state", name, valueKind: "string", value, line: start.line, column: start.column };
    }
    if (this.isName("none")) {
      this.advance();
      return { kind: "state", name, valueKind: "none", value: null, line: start.line, column: start.column };
    }
    this.fail("A state's initial value must be a number, a string, or none.");
  }

  private parseEventBlock(): EventBlock {
    const start = this.expectName("on");
    const eventToken = this.expectType("NAME", "an event name (start, tick, or junction)");
    if (!EVENT_NAMES.includes(eventToken.value as VtlEventName)) {
      throw new ParseAbort(
        makeError(
          "VTL001",
          eventToken.line,
          eventToken.column,
          `"${eventToken.value}" isn't an event. Use start, tick, or junction.`,
        ),
      );
    }
    this.expectOp(":");
    const body = this.parseBlock();
    return { kind: "event", event: eventToken.value as VtlEventName, body, line: start.line, column: start.column };
  }

  private parseBlock(): Statement[] {
    this.expectType("NEWLINE", "end of line");
    this.expectType("INDENT", "an indented block");
    const statements: Statement[] = [];
    while (!this.isType("DEDENT") && !this.isType("EOF")) {
      statements.push(this.parseStatement());
    }
    this.expectType("DEDENT", "a dedent closing the block");
    return statements;
  }

  private parseStatement(): Statement {
    if (this.isName("let")) return this.parseLetStmt();
    if (this.isName("set")) return this.parseSetStmt();
    if (this.isName("if")) return this.parseIfStmt();
    if (this.isType("NAME") && !KEYWORDS.has(this.peek().value)) return this.parseCallStmt();
    this.fail(`Unexpected "${this.peek().value || this.peek().type}" — expected a statement.`);
  }

  private parseLetStmt(): LetStmt {
    const start = this.expectName("let");
    const name = this.expectType("NAME", "a variable name").value;
    this.expectOp("=");
    const expr = this.parseExpr();
    this.expectType("NEWLINE", "end of line");
    return { kind: "let", name, expr, line: start.line, column: start.column };
  }

  private parseSetStmt(): SetStmt {
    const start = this.expectName("set");
    const name = this.expectType("NAME", "a state name").value;
    this.expectOp("=");
    const expr = this.parseExpr();
    this.expectType("NEWLINE", "end of line");
    return { kind: "set", name, expr, line: start.line, column: start.column };
  }

  private parseIfStmt(): IfStmt {
    const start = this.expectName("if");
    const cond = this.parseExpr();
    this.expectOp(":");
    const body = this.parseBlock();
    const branches: IfBranch[] = [{ cond, body }];
    while (this.isName("elif")) {
      this.advance();
      const c = this.parseExpr();
      this.expectOp(":");
      const b = this.parseBlock();
      branches.push({ cond: c, body: b });
    }
    let elseBody: Statement[] | null = null;
    if (this.isName("else")) {
      this.advance();
      this.expectOp(":");
      elseBody = this.parseBlock();
    }
    return { kind: "if", branches, elseBody, line: start.line, column: start.column };
  }

  private parseCallStmt(): CallStmt {
    const nameToken = this.expectType("NAME", "a function call");
    this.expectOp("(");
    const args = this.parseArgs();
    this.expectOp(")");
    this.expectType("NEWLINE", "end of line");
    return { kind: "callStmt", name: nameToken.value, args, line: nameToken.line, column: nameToken.column };
  }

  private parseArgs(): Expr[] {
    if (this.isOp(")")) return [];
    const args = [this.parseExpr()];
    while (this.isOp(",")) {
      this.advance();
      args.push(this.parseExpr());
    }
    return args;
  }

  parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isName("or")) {
      const t = this.advance();
      const right = this.parseAnd();
      left = { kind: "binary", op: "or", left, right, line: t.line, column: t.column };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.isName("and")) {
      const t = this.advance();
      const right = this.parseNot();
      left = { kind: "binary", op: "and", left, right, line: t.line, column: t.column };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.isName("not")) {
      const t = this.advance();
      const expr = this.parseNot();
      return { kind: "unary", op: "not" as UnaryOp, expr, line: t.line, column: t.column };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    const left = this.parseSum();
    const cmpOps = ["<", ">", "<=", ">=", "==", "!="];
    if (this.isType("OP") && cmpOps.includes(this.peek().value)) {
      const t = this.advance();
      const right = this.parseSum();
      return { kind: "binary", op: t.value as BinaryOp, left, right, line: t.line, column: t.column };
    }
    return left;
  }

  private parseSum(): Expr {
    let left = this.parseProduct();
    while (this.isType("OP") && (this.peek().value === "+" || this.peek().value === "-")) {
      const t = this.advance();
      const right = this.parseProduct();
      left = { kind: "binary", op: t.value as BinaryOp, left, right, line: t.line, column: t.column };
    }
    return left;
  }

  private parseProduct(): Expr {
    let left = this.parseUnary();
    while (this.isType("OP") && ["*", "/", "%"].includes(this.peek().value)) {
      const t = this.advance();
      const right = this.parseUnary();
      left = { kind: "binary", op: t.value as BinaryOp, left, right, line: t.line, column: t.column };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.isOp("-")) {
      const t = this.advance();
      const expr = this.parseUnary();
      return { kind: "unary", op: "-" as UnaryOp, expr, line: t.line, column: t.column };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.type === "NUMBER") {
      this.advance();
      return { kind: "number", value: t.numberValue as number, line: t.line, column: t.column };
    }
    if (t.type === "STRING") {
      this.advance();
      return { kind: "string", value: t.value, line: t.line, column: t.column };
    }
    if (t.type === "NAME") {
      this.advance();
      if (this.isOp("(")) {
        this.advance();
        const args = this.parseArgs();
        this.expectOp(")");
        return { kind: "call", name: t.value, args, line: t.line, column: t.column };
      }
      return { kind: "ident", name: t.value, line: t.line, column: t.column };
    }
    if (t.type === "OP" && t.value === "(") {
      this.advance();
      const expr = this.parseExpr();
      this.expectOp(")");
      return expr;
    }
    this.fail(`Expected an expression, found "${t.value || t.type}".`);
  }
}

export function parse(source: string): { program: Program | null; errors: VtlError[] } {
  const { tokens, errors: lexErrors } = tokenize(source);
  if (lexErrors.length > 0) {
    return { program: null, errors: lexErrors };
  }
  try {
    const program = new Parser(tokens).parseProgram();
    return { program, errors: [] };
  } catch (e) {
    if (e instanceof ParseAbort) {
      return { program: null, errors: [e.vtlError] };
    }
    throw e;
  }
}
