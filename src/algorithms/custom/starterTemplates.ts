/**
 * "+ New" starter templates for the /algorithms page (Algorithms.md §5.3). The PID, left-hand
 * wall-follower, and greedy-flood-fill sources are copied byte-for-byte from Algorithms.md §1.8 —
 * the same fixtures used by the equivalence tests in sim/algorithms/vtl*Equivalence.test.ts —
 * everything else here (bang-bang, proportional, right-hand wall-follower, blank) is new but
 * follows the same builtins and constants (e.g. ERROR_GAIN_SCALE=340) as their native counterparts.
 */
import type { VtlMode } from '../../vtl/types';

export interface StarterTemplate {
  id: string;
  name: string;
  mode: VtlMode;
  source: string;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'bang-bang',
    name: 'Bang-Bang',
    mode: 'line',
    source: `param turn = 220 range 50..800
param straight = 160 range 50..800

on tick:
  let e = line_error()
  if e > 0.05:
    drive(-turn * 0.3, turn)
  elif e < -0.05:
    drive(turn, -turn * 0.3)
  else:
    drive(straight, straight)
`,
  },
  {
    id: 'proportional',
    name: 'Proportional (P)',
    mode: 'line',
    source: `param Kp = 0.45 range 0..2
param base = 250 range 50..800

on tick:
  let e = line_error()
  let corr = Kp * e * 340
  drive(base - corr, base + corr)
`,
  },
  {
    id: 'pid',
    name: 'PID',
    mode: 'line',
    source: `param Kp = 0.45 range 0..2
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
`,
  },
  {
    id: 'wall-follower-left',
    name: 'Wall Follower (Left)',
    mode: 'maze',
    source: `on junction:
  if can_move(left):
    move_to(left)
  elif can_move(forward):
    move_to(forward)
  elif can_move(right):
    move_to(right)
  else:
    move_to(back)
`,
  },
  {
    id: 'wall-follower-right',
    name: 'Wall Follower (Right)',
    mode: 'maze',
    source: `on junction:
  if can_move(right):
    move_to(right)
  elif can_move(forward):
    move_to(forward)
  elif can_move(left):
    move_to(left)
  else:
    move_to(back)
`,
  },
  {
    id: 'flood-fill',
    name: 'Greedy Flood Fill',
    mode: 'maze',
    source: `on junction:
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
`,
  },
  {
    id: 'blank-line',
    name: 'Blank',
    mode: 'line',
    source: `on tick:
  drive(0, 0)
`,
  },
  {
    id: 'blank-maze',
    name: 'Blank',
    mode: 'maze',
    source: `on junction:
  move_to(forward)
`,
  },
];

export function starterTemplatesForMode(mode: VtlMode): StarterTemplate[] {
  return STARTER_TEMPLATES.filter((t) => t.mode === mode);
}
