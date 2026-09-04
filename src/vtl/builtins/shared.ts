// Builtins available in both line and maze mode — internal-docs/Algorithms.md §1.7 "Shared".

import type { VtlValueKind } from "../types";

export interface BuiltinSig {
  name: string;
  arity: number;
  returns: VtlValueKind;
}

export const SHARED_BUILTINS: BuiltinSig[] = [
  { name: "dt", arity: 0, returns: "number" },
  { name: "time", arity: 0, returns: "number" },
  { name: "abs", arity: 1, returns: "number" },
  { name: "min", arity: 2, returns: "number" },
  { name: "max", arity: 2, returns: "number" },
  { name: "clamp", arity: 3, returns: "number" },
  { name: "sign", arity: 1, returns: "number" },
  { name: "sqrt", arity: 1, returns: "number" },
  { name: "sin", arity: 1, returns: "number" },
  { name: "cos", arity: 1, returns: "number" },
  { name: "atan2", arity: 2, returns: "number" },
  { name: "log", arity: 2, returns: "none" },
];
