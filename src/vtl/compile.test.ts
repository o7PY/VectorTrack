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

describe('compile — arrays and tables (v0.3.1.md §D/§G)', () => {
  it('declares an array, reads and writes an element, and reads its length', () => {
    const source = [
      'state buf[5] = 0',
      'on tick:',
      '  set buf[0] = 3',
      '  let x = buf[0]',
      '  let n = len(buf)',
      '  drive(x, n)',
      '',
    ].join('\n');
    expect(compile(source, 'line').ok).toBe(true);
  });

  it('declares a table with negative literals and reads an element', () => {
    const source = [
      'table t = [-2, -1, 0, 1, 2]',
      'on tick:',
      '  let x = t[0]',
      '  drive(x, len(t))',
      '',
    ].join('\n');
    expect(compile(source, 'line').ok).toBe(true);
  });

  it('allows a table literal to wrap across multiple lines (bracket-depth NEWLINE suppression)', () => {
    const source = [
      'table rules = [-2, -2, -2, -1,  0,',
      '               -2, -2, -1,  0,  1,',
      '               -2, -1,  0,  1,  2,',
      '               -1,  0,  1,  2,  2,',
      '                0,  1,  2,  2,  2]',
      'on tick:',
      '  drive(rules[0], len(rules))',
      '',
    ].join('\n');
    const result = compile(source, 'line');
    expect(result.ok).toBe(true);
  });

  it('VTL009: array length out of range', () => {
    const source = 'state buf[0] = 0\non tick:\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL009');
  });

  it('VTL009: table with zero values', () => {
    const source = 'table t = []\non tick:\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL001');
  });

  it('VTL016: bare reference to an array', () => {
    const source = 'state buf[5] = 0\non tick:\n  let x = buf\n  drive(x, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL016');
  });

  it('VTL016: indexing a scalar state', () => {
    const source = 'state x = 0\non tick:\n  let y = x[0]\n  drive(y, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL016');
  });

  it('VTL016: assigning to a whole array', () => {
    const source = 'state buf[5] = 0\non tick:\n  set buf = 1\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL016');
  });

  it('VTL006: assigning to a table element (tables are immutable)', () => {
    const source = 'table t = [1, 2, 3]\non tick:\n  set t[0] = 9\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL006');
  });

  it('VTL017: compile-time out-of-range literal index', () => {
    const source = 'state buf[5] = 0\non tick:\n  let x = buf[10]\n  drive(x, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL017');
  });

  it('VTL016: len() on a scalar', () => {
    const source = 'state x = 0\non tick:\n  let n = len(x)\n  drive(n, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL016');
  });
});

describe('compile — for loops (v0.3.1.md §C)', () => {
  it('compiles a simple bounded loop summing into an array', () => {
    const source = [
      'state buf[5] = 0',
      'on tick:',
      '  for i in 0..4:',
      '    set buf[i] = i',
      '  drive(buf[4], 0)',
      '',
    ].join('\n');
    expect(compile(source, 'line').ok).toBe(true);
  });

  it('accepts len(name) and sensor_count() as loop bounds', () => {
    const source = [
      'state buf[5] = 0',
      'on tick:',
      '  for i in 0..len(buf)-1:',
      '    set buf[i] = 0',
      '  for j in 0..sensor_count()-1:',
      '    let s = sensor(j)',
      '  drive(0, 0)',
      '',
    ].join('\n');
    expect(compile(source, 'line').ok).toBe(true);
  });

  it('VTL006: reassigning a loop variable', () => {
    const source = 'on tick:\n  for i in 0..3:\n    set i = 9\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL006');
  });

  it('VTL015: loop bound is not statically resolvable', () => {
    const source = 'param n = 5 range 1..10\non tick:\n  for i in 0..n:\n    let x = i\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL015');
  });

  it('VTL015: loop would run more iterations than the cap allows', () => {
    const source = 'on tick:\n  for i in 0..1000:\n    let x = i\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL015');
  });

  it('VTL015: loops nested past the max depth', () => {
    const source = [
      'on tick:',
      '  for a in 0..1:',
      '    for b in 0..1:',
      '      for c in 0..1:',
      '        for d in 0..1:',
      '          let x = d',
      '  drive(0, 0)',
      '',
    ].join('\n');
    expect(firstErrorCode(source)).toBe('VTL015');
  });

  it('VTL013: deriv() can\'t be called from inside a loop', () => {
    const source = 'on tick:\n  for i in 0..3:\n    let d = deriv(1, 0.12)\n  drive(0, 0)\n';
    expect(firstErrorCode(source)).toBe('VTL013');
  });

  it('VTL014: a loop whose body exceeds the per-tick node budget names the loop', () => {
    const source = [
      'state buf[64] = 0',
      'on tick:',
      '  for i in 0..63:',
      '    for j in 0..63:',
      '      let a = (((1 + 1) + (1 + 1)) + ((1 + 1) + (1 + 1)))',
      '      let b = (((1 + 1) + (1 + 1)) + ((1 + 1) + (1 + 1)))',
      '  drive(0, 0)',
      '',
    ].join('\n');
    const result = compile(source, 'line');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe('VTL014');
      expect(result.errors[0].message).toMatch(/loop at line 3/);
    }
  });
});

describe('compile — deriv/steer builtins (v0.3.1.md §F)', () => {
  it('compiles a PID rewritten with steer/deriv', () => {
    const source = [
      'param Kp = 0.45 range 0..2',
      'param Ki = 0.00 range 0..0.5',
      'param Kd = 0.12 range 0..1',
      'param base = 250 range 50..800',
      'state integral = 0',
      'on tick:',
      '  let e = line_error()',
      '  set integral = clamp(integral + e * dt(), -1, 1)',
      '  steer(base, Kp * e + Ki * integral + Kd * deriv(e, 0.12))',
      '',
    ].join('\n');
    expect(compile(source, 'line').ok).toBe(true);
  });

  it('rejects deriv/steer in maze mode', () => {
    const source = 'on junction:\n  let d = deriv(1, 0.1)\n  move_to(left)\n';
    expect(firstErrorCode(source, 'maze')).toBe('VTL005');
  });
});
