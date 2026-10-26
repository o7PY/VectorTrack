// Compile-time safety caps, shared by analyzer.ts, compile.ts, and interpreter.ts so there is one
// source of truth — internal-docs/Algorithms.md §1.10, amended by v0.3.1.md §C.3.
export const MAX_SOURCE_BYTES = 16 * 1024;
export const MAX_EXPR_DEPTH = 32;
export const MAX_STATES = 64;
export const MAX_PARAMS = 32;
export const MAX_ARRAY_LENGTH = 64;
export const MAX_TABLE_LENGTH = 256;
export const MAX_LOOP_ITERATIONS = 64;
export const MAX_LOOP_NEST_DEPTH = 3;
// 4096 was sized for a language where nothing could iterate. Raised for bounded `for` loops
// (v0.3.1.md §C.3) — still microseconds per tick.
export const DEFAULT_NODE_BUDGET = 16384;
