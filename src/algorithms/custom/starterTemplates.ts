/**
 * "+ New" starter templates for the /algorithms page (Algorithms.md §5.3). The wall-follower and
 * greedy-flood-fill sources are copied byte-for-byte from Algorithms.md §1.8, and "PID (explicit)"
 * from the pre-v0.3.1 §1.8 PID — the same fixtures used by the equivalence tests in
 * sim/algorithms/vtl*Equivalence.test.ts. "PID" is the short `steer`/`deriv` rewrite from
 * v0.3.1.md §F, verified algebraically and by simulation to match "PID (explicit)" tick-for-tick
 * (sim/algorithms/vtlPidEquivalence.test.ts). "Fuzzy (Sugeno)" is v0.3.1.md §J's worked example,
 * verified headlessly against lf-oval before being added here (PLAN.md Phase Q). Everything else
 * (bang-bang, proportional, right-hand wall-follower, blank) is new but follows the same builtins
 * and constants (e.g. ERROR_GAIN_SCALE=340) as their native counterparts.
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

on tick:
  let e = line_error()
  set integral = clamp(integral + e * dt(), -1, 1)
  steer(base, Kp * e + Ki * integral + Kd * deriv(e, 0.12))
`,
  },
  {
    id: 'pid-explicit',
    name: 'PID (explicit)',
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
    id: 'fuzzy-sugeno',
    name: 'Fuzzy (Sugeno)',
    mode: 'line',
    source: `# 5x5 Sugeno fuzzy controller.
# Membership: 5 triangular sets over error and over its derivative.
# Rules: one output singleton per (error, derivative) pair.

param base = 240 range 50..800
param dScale = 0.5 range 0.1..3
param outScale = 0.5 range 0.1..2

# Rows = error (NL NS ZE PS PL), cols = derivative (NL NS ZE PS PL).
table rules = [-2, -2, -2, -1,  0,
               -2, -2, -1,  0,  1,
               -2, -1,  0,  1,  2,
               -1,  0,  1,  2,  2,
                0,  1,  2,  2,  2]

state muE[5] = 0
state muD[5] = 0

on tick:
  let e = clamp(line_error(), -1, 1)
  let dn = clamp(deriv(e, 0.12) * dScale, -1, 1)

  # Triangular membership, centers at -1, -0.5, 0, 0.5, 1, half-width 0.5.
  for i in 0..4:
    let c = -1 + i * 0.5
    set muE[i] = max(0, 1 - abs(e - c) / 0.5)
    set muD[i] = max(0, 1 - abs(dn - c) / 0.5)

  # Weighted average over all 25 rules; rule strength = min of the two memberships.
  let num = 0
  let den = 0
  for i in 0..4:
    for j in 0..4:
      let w = min(muE[i], muD[j])
      set num = num + w * rules[i * 5 + j]
      set den = den + w

  let corr = 0
  if den > 0:
    set corr = (num / den) * outScale
  steer(base, corr)
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
