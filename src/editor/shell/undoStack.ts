/**
 * Generic snapshot-based undo/redo command stack (v0.2.0 §14.3.3/§14.4.2:
 * 50 entries deep, one entry per user gesture — e.g. one drag stroke, not
 * one per cell). Pure and framework-agnostic so it's easy to unit test and
 * reusable by both the line and maze editors.
 */
export interface UndoStack<T> {
  push(snapshot: T): void;
  undo(): T | undefined;
  redo(): T | undefined;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(initial: T): void;
}

export function createUndoStack<T>(initial: T, maxEntries = 50): UndoStack<T> {
  let past: T[] = [];
  let present: T = initial;
  let future: T[] = [];

  return {
    push(snapshot: T) {
      past.push(present);
      if (past.length > maxEntries) past.shift();
      present = snapshot;
      future = [];
    },
    undo() {
      if (past.length === 0) return undefined;
      future.unshift(present);
      present = past.pop() as T;
      return present;
    },
    redo() {
      if (future.length === 0) return undefined;
      past.push(present);
      present = future.shift() as T;
      return present;
    },
    canUndo() {
      return past.length > 0;
    },
    canRedo() {
      return future.length > 0;
    },
    clear(initial_: T) {
      past = [];
      present = initial_;
      future = [];
    },
  };
}
