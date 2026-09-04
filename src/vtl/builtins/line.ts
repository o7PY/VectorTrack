// Line-mode-only builtins — internal-docs/Algorithms.md §1.7 "Line mode".

import type { BuiltinSig } from "./shared";

export const LINE_BUILTINS: BuiltinSig[] = [
  { name: "sensor", arity: 1, returns: "number" },
  { name: "sensor_count", arity: 0, returns: "number" },
  { name: "sensor_x", arity: 1, returns: "number" },
  { name: "sensor_y", arity: 1, returns: "number" },
  { name: "line_error", arity: 0, returns: "number" },
  { name: "line_error_mm", arity: 0, returns: "number" },
  { name: "line_lost", arity: 0, returns: "bool" },
  { name: "drive", arity: 2, returns: "none" },
];
