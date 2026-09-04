import { describe, expect, it } from 'vitest';
import { compile } from './compile';

const PID_PROGRAM = `
param Kp = 0.45 range 0..2
param Ki = 0.00 range 0..0.5
param Kd = 0.12 range 0..1
param base = 250 range 50..800

state integral = 0
state lastError = 0
state lastD = 0

on tick:
  let e = line_error()
  set integral = clamp(integral + e * dt(), -1, 1)
  let raw = (e - lastError) / dt()
  let d = lastD + (raw - lastD) * (dt() / (0.12 + dt()))
  set lastD = d
  set lastError = e
  let corr = Kp * e * 340 + Ki * integral * 340 + Kd * d * 20
  drive(base - corr, base + corr)
`;

const WALL_FOLLOWER_PROGRAM = `
on junction:
  if can_move(left):
    move_to(left)
  elif can_move(forward):
    move_to(forward)
  elif can_move(right):
    move_to(right)
  else:
    move_to(back)
`;

const FLOOD_FILL_PROGRAM = `
on junction:
  if at_goal():
    finish()
  let best = "forward"
  if distance_to_goal(left) < distance_to_goal(best):
    set best = "left"
  if distance_to_goal(right) < distance_to_goal(best):
    set best = "right"
  if distance_to_goal(back) < distance_to_goal(best):
    set best = "back"
  move_to(best)
`;

describe('compile — worked examples (Algorithms.md §1.8)', () => {
  it('compiles the PID line follower', () => {
    const result = compile(PID_PROGRAM, 'line');
    expect(result.ok).toBe(true);
  });

  it('compiles the left-hand wall follower', () => {
    const result = compile(WALL_FOLLOWER_PROGRAM, 'maze');
    expect(result.ok).toBe(true);
  });

  it('compiles the greedy flood fill', () => {
    const result = compile(FLOOD_FILL_PROGRAM, 'maze');
    expect(result.ok).toBe(true);
  });
});

function firstErrorCode(source: string, mode: 'line' | 'maze' = 'line'): string | undefined {
  const result = compile(source, mode);
  if (result.ok) return undefined;
  return result.errors[0]?.code;
}

describe('compile — VTL001-VTL014 error codes', () => {
  it('VTL001: syntax error', () => {
    expect(firstErrorCode('on tick:\n  let e = \n')).toBe('VTL001');
  });

  it('VTL002: indentation error (dedent to a column matching no enclosing block)', () => {
    const source = 'on tick:\n  if e:\n    let a = 1\n   let b = 2\n';
    expect(firstErrorCode(source)).toBe('VTL002');
  });

  it('VTL003: unknown identifier', () => {
    const source = 'on tick:\n  let e = notDefined\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL003');
  });

  it('VTL004: unknown function', () => {
    const source = 'on tick:\n  totallyMadeUp(1, 2)\n';
    expect(firstErrorCode(source)).toBe('VTL004');
  });

  it('VTL005: builtin from the other mode', () => {
    const source = 'on tick:\n  move_to(left)\n';
    expect(firstErrorCode(source, 'line')).toBe('VTL005');
  });

  it('VTL006: set targeting something that is not a state or let', () => {
    const source = 'param Kp = 1 range 0..2\non tick:\n  set Kp = 2\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL006');
  });

  it('VTL007: wrong argument count', () => {
    const source = 'on tick:\n  drive(1)\n';
    expect(firstErrorCode(source)).toBe('VTL007');
  });

  it('VTL008: type mismatch (arithmetic on a string)', () => {
    const source = 'on tick:\n  let e = "hello" + 1\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL008');
  });

  it('VTL009: duplicate param/state name', () => {
    const source = 'param Kp = 1 range 0..2\nstate Kp = 0\non tick:\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL009');
  });

  it('VTL009: invalid param range (lo >= hi)', () => {
    const source = 'param Kp = 1 range 2..1\non tick:\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL009');
  });

  it('VTL010: required event block missing (line mode needs on tick)', () => {
    const source = 'on start:\n  let e = 1\n';
    expect(firstErrorCode(source, 'line')).toBe('VTL010');
  });

  it('VTL010: maze-only event used in line mode', () => {
    const source = 'on tick:\n  drive(0, 0)\non junction:\n  move_to(left)\n';
    expect(firstErrorCode(source, 'line')).toBe('VTL010');
  });

  it('VTL014: source exceeds the 16 KB cap', () => {
    const huge = 'on tick:\n' + '  let e = 1\n'.repeat(3000);
    expect(firstErrorCode(huge)).toBe('VTL014');
  });

  it('VTL014: expression nesting exceeds the depth cap', () => {
    let expr = '1';
    for (let i = 0; i < 40; i++) expr = `(${expr} + 1)`;
    const source = `on tick:\n  let e = ${expr}\n  drive(0, 0)\n`;
    expect(firstErrorCode(source)).toBe('VTL014');
  });
});

describe('compile — mode-scoped builtins', () => {
  it('rejects a line builtin from maze mode', () => {
    const source = 'on junction:\n  let e = line_error()\n  move_to(left)\n';
    expect(firstErrorCode(source, 'maze')).toBe('VTL005');
  });

  it('accepts direction words as bare identifiers in maze mode', () => {
    const source = 'on junction:\n  if can_move(front):\n    move_to(forward)\n  else:\n    move_to(back)\n';
    expect(compile(source, 'maze').ok).toBe(true);
  });

  it('let-then-set is allowed (flood fill relies on this)', () => {
    const source = 'on junction:\n  let best = "forward"\n  set best = "left"\n  move_to(best)\n';
    expect(compile(source, 'maze').ok).toBe(true);
  });
});
