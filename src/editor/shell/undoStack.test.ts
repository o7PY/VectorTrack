import { describe, expect, it } from 'vitest';
import { createUndoStack } from './undoStack';

describe('createUndoStack', () => {
  it('starts with no undo/redo available', () => {
    const stack = createUndoStack(0);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
  });

  it('undo returns the previous snapshot and redo returns it forward again', () => {
    const stack = createUndoStack(0);
    stack.push(1);
    stack.push(2);
    expect(stack.undo()).toBe(1);
    expect(stack.canRedo()).toBe(true);
    expect(stack.redo()).toBe(2);
    expect(stack.canRedo()).toBe(false);
  });

  it('pushing after an undo discards the redo branch', () => {
    const stack = createUndoStack(0);
    stack.push(1);
    stack.push(2);
    stack.undo();
    stack.push(3);
    expect(stack.canRedo()).toBe(false);
    expect(stack.undo()).toBe(1);
  });

  it('undo/redo on an empty stack is a no-op returning undefined', () => {
    const stack = createUndoStack('start');
    expect(stack.undo()).toBeUndefined();
    expect(stack.redo()).toBeUndefined();
  });

  it('caps history at maxEntries', () => {
    const stack = createUndoStack(0, 3);
    for (let i = 1; i <= 5; i++) stack.push(i);
    // present is 5; past capped to [2,3,4] (oldest entries 0,1 dropped)
    expect(stack.undo()).toBe(4);
    expect(stack.undo()).toBe(3);
    expect(stack.undo()).toBe(2);
    expect(stack.undo()).toBeUndefined();
  });

  it('clear resets both stacks and sets a fresh present', () => {
    const stack = createUndoStack(0);
    stack.push(1);
    stack.push(2);
    stack.undo();
    stack.clear(99);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
  });
});
