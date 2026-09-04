// Maze-mode-only builtins — internal-docs/Algorithms.md §1.7 "Maze mode" + §1.6's `mark_walls()`.

import type { BuiltinSig } from "./shared";

export const MAZE_BUILTINS: BuiltinSig[] = [
  { name: "range", arity: 1, returns: "number" },
  { name: "can_move", arity: 1, returns: "bool" },
  { name: "move_to", arity: 1, returns: "none" },
  { name: "at_goal", arity: 0, returns: "bool" },
  { name: "visited", arity: 1, returns: "bool" },
  { name: "cell_row", arity: 0, returns: "number" },
  { name: "cell_col", arity: 0, returns: "number" },
  { name: "heading", arity: 0, returns: "number" },
  { name: "distance_to_goal", arity: 1, returns: "number" },
  { name: "unexplored_count", arity: 0, returns: "number" },
  { name: "finish", arity: 0, returns: "none" },
  { name: "mark_walls", arity: 0, returns: "none" },
];

// Direction words usable as bare identifiers in maze mode, each a string equal to its own
// name — see Algorithms.md §1.7's note above the worked examples in §1.8.
export const MAZE_DIRECTION_CONSTANTS = ["forward", "back", "left", "right", "front"] as const;
