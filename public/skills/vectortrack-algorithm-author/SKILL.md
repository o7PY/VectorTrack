---
name: vectortrack-algorithm-author
description: Write custom line-follower and maze-solver robot control programs in VTL ("VectorTrack Language") for the VectorTrack robotics simulator. Use this skill whenever the user asks to write, generate, or tune a line-following or maze-solving algorithm for VectorTrack — including requests like "write a PID line follower," "make a maze robot that hugs the right wall," or "generate a .vectortrack-algorithm.json file" — and produce a program the user can import directly into VectorTrack's algorithm editor.
license: Free to copy, modify, and redistribute.
---

# VectorTrack algorithm author (VTL)

VectorTrack is a browser-based simulator for line-following and maze-solving robots. Users write
their own robot control logic in **VTL** ("VectorTrack Language"), a small, deliberately
loop-free language designed to be introspectable and impossible to hang. This document is the
complete, authoritative spec for VTL — anything not described here does not exist in the
language. It's written for any AI model, not just Claude.

VTL has **no loops, no user-defined functions, and no recursion**. This is deliberate, not a
missing feature: it bounds every program's per-tick cost by its source length, keeps execution
deterministic, and means there is never an infinite-loop or timeout case to handle. Maze-solving
logic in particular has to be expressed differently than you'd write it in Python or C — see
"The maze motion layer" below before assuming you need a graph-search loop.

## Worked examples first

Six complete, runnable programs. Pattern-match from these before reading the formal grammar below.

### 1. PID line follower

```
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
```

### 2. Bang-bang line follower

The simplest working line follower: full turn away from the line, no proportional term.

```
param turn = 220 range 50..800
param straight = 160 range 50..800

on tick:
  let e = line_error()
  if e > 0.05:
    drive(-turn * 0.3, turn)
  elif e < -0.05:
    drive(turn, -turn * 0.3)
  else:
    drive(straight, straight)
```

### 3. PD-only line follower

Drops the integral term — simpler to tune than full PID, still corrects for lag via the
derivative term.

```
param Kp = 0.5 range 0..2
param Kd = 0.15 range 0..1
param base = 250 range 50..800

state lastError = 0
state lastD = 0

on tick:
  let e = line_error()
  let raw = (e - lastError) / dt()
  let d = lastD + (raw - lastD) * (dt() / (0.12 + dt()))
  set lastD = d
  set lastError = e
  let corr = Kp * e * 340 + Kd * d * 20
  drive(base - corr, base + corr)
```

### 4. Adaptive-speed line follower

Slows down on sharp corners (large error or large derivative) and speeds up on straights, by
computing `base` per tick instead of taking it as a fixed param.

```
param Kp = 0.5 range 0..2
param Kd = 0.15 range 0..1
param maxSpeed = 350 range 50..800
param minSpeed = 120 range 50..800

state lastError = 0
state lastD = 0

on tick:
  let e = line_error()
  let raw = (e - lastError) / dt()
  let d = lastD + (raw - lastD) * (dt() / (0.12 + dt()))
  set lastD = d
  set lastError = e
  let sharpness = clamp(abs(e) + abs(d) * 0.5, 0, 1)
  let base = maxSpeed - (maxSpeed - minSpeed) * sharpness
  let corr = Kp * e * 340 + Kd * d * 20
  drive(base - corr, base + corr)
```

### 5. Left-hand wall follower (maze)

```
on junction:
  if can_move(left):
    move_to(left)
  elif can_move(forward):
    move_to(forward)
  elif can_move(right):
    move_to(right)
  else:
    move_to(back)
```

### 6. Greedy flood fill (maze)

Picks whichever open neighbor has the shortest known distance to the goal, using the built-in
BFS over discovered walls (`distance_to_goal`) rather than implementing a search itself.

```
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
```

This is single-phase (decides greedily at every junction, no separate explore-then-run phases),
so it can revisit cells and isn't guaranteed optimal — that's an intentional simplification, not
a bug, and a fine starting point to improve on.

---

## Grammar

The complete language. Anything not listed here does not exist — no arrays, no objects, no
ternary expressions, no string concatenation operator, nothing beyond what's below.

```
program     := ( paramDecl | stateDecl | eventBlock )*

paramDecl   := "param" IDENT "=" NUMBER "range" NUMBER ".." NUMBER
             | "param" IDENT "=" STRING "options" STRING ( "," STRING )*

stateDecl   := "state" IDENT "=" ( NUMBER | STRING | "none" )

eventBlock  := "on" EVENT ":" NEWLINE INDENT statement+ DEDENT

statement   := letStmt | setStmt | ifStmt | callStmt
letStmt     := "let" IDENT "=" expr
setStmt     := "set" IDENT "=" expr
ifStmt      := "if" expr ":" block ( "elif" expr ":" block )* ( "else" ":" block )?
callStmt    := IDENT "(" args? ")"

expr        := orExpr
orExpr      := andExpr ( "or" andExpr )*
andExpr     := notExpr ( "and" notExpr )*
notExpr     := "not" notExpr | comparison
comparison  := sum ( ( "<" | ">" | "<=" | ">=" | "==" | "!=" ) sum )?
sum         := product ( ( "+" | "-" ) product )*
product     := unary ( ( "*" | "/" | "%" ) unary )*
unary       := "-" unary | primary
primary     := NUMBER | STRING | IDENT | call | "(" expr ")"
call        := IDENT "(" args? ")"
```

- Indentation is Python-like (blocks are defined by indent/dedent, not braces). Tabs are
  normalized to 4 spaces before parsing, so either is fine, but be consistent within a block.
- Comments start with `#` and run to end of line. Blank lines are insignificant.
- Types are `number`, `string`, `bool`, and `none`. No implicit coercion between them.
- `EVENT` is one of `start`, `tick`, `junction` (see "Events" below — which are legal depends on
  mode).
- Division by zero, or any operation producing `NaN`/`Infinity`, is a runtime error that halts the
  run with a clear message — it does not silently propagate as `NaN`.

### Declarations

- **`param`** declares a live-tunable value, automatically surfaced in the simulator's parameter
  panel — numeric params as a slider + numeric input, string params (`options`) as a dropdown.
  Changing a param's value applies on the very next tick, with no reset.
- **`state`** declares a value that persists across ticks within a run, and resets to its declared
  initial value on Reset. This is the *only* mutable storage that survives past a single block.
- **`let`** bindings are block-scoped and die at the end of the block they're declared in — use
  `state` for anything that needs to survive to the next tick or event.
- **`set`** may target a `state` name, or a `let` name already bound in an *enclosing* scope (both
  are mutable in place). Assigning to a `param`, or to any name that isn't declared, is a compile
  error. Example 6 above relies on this: `best` is a `let`, reassigned via `set` inside the `if`
  blocks that follow its declaration.

### Events

| Event | Modes | Fires |
|---|---|---|
| `on start` | both | Once, before the first tick. Good for initializing `state` from a `param`. |
| `on tick` | both | Every simulation tick (120 Hz). In line mode, this is where all control happens. In maze mode it's *optional* — see below. |
| `on junction` | maze | Once per arrival at a cell where a decision is needed. |

A line program needs at least one `on tick` block. A maze program needs at least one of `on tick`
/ `on junction`. Statements run in strict source order — there is no implicit scheduling or
event queue beyond "this event just fired, run its block once, top to bottom."

### The maze motion layer

Do not try to implement cell-to-cell driving, a wall-knowledge grid, or a graph search yourself —
**it's already built in**, and your program's job in maze mode is only to answer one question at
each junction: *where next?*

- `move_to(dir)` hands control to the built-in motion layer, which physically drives to the
  adjacent cell in that direction and then fires the next `on junction` once it arrives. The
  target cell is fixed the instant `move_to` is called — it does not re-evaluate mid-drive.
- `on tick` in maze mode is optional; if present, it can adjust steering *within* the current leg,
  but it never changes which cell is being driven to.
- Wall knowledge from the rangefinders is recorded automatically after every tick. You don't need
  to call anything to make `can_move`/`visited`/`distance_to_goal` see a wall you just detected —
  `mark_walls()` exists only if you need that recording to happen immediately instead of waiting
  for the tick to end (a no-op if it already happened this tick).
- Calling `move_to` more than once in the same `on junction`, or calling it from `on tick`, is a
  runtime error (`VTL013`) — it doesn't queue moves or silently take the last one.

---

## Things VTL does not have

Be explicit about this rather than improvising — none of the following exist in VTL, and using
them will fail to compile:

- No loops (`for`, `while`, or otherwise) of any kind.
- No user-defined functions and no recursion.
- No arrays, lists, dicts, objects, or any other collection type.
- No `def`, no `class`, no `import`, no modules.
- No string concatenation operator and no string formatting/interpolation — `log()`'s first
  argument is a plain label string, not a template.
- No ternary/conditional expression (`a if cond else b`) — use `if`/`elif`/`else` statements.
- No `random()` — VTL programs are deterministic by design; see "Determinism" below.
- No comments other than `#`.

If you find yourself wanting a loop to search over neighbors or iterate sensors, look for a
builtin that already does it (`distance_to_goal`, `unexplored_count`) or restructure the logic to
be computed directly per tick/junction — see the flood-fill example above, which replaces "loop
over all directions and pick the best" with four sequential `if` comparisons instead.

---

## Builtins

### Shared (both modes)

| Builtin | Returns | Notes |
|---|---|---|
| `dt()` | number | Seconds per tick. |
| `time()` | number | Elapsed simulation seconds. |
| `abs(x)` | number | |
| `min(a, b)` | number | |
| `max(a, b)` | number | |
| `clamp(x, lo, hi)` | number | |
| `sign(x)` | number | |
| `sqrt(x)` | number | |
| `sin(x)` | number | Argument in degrees. |
| `cos(x)` | number | Argument in degrees. |
| `atan2(y, x)` | number | Returns degrees, matching `headingDeg`/`heading()`. |
| `log(label, value)` | none | Sends `value` to the simulator's telemetry log strip under `label`. Max 8 distinct labels per program. |

### Line mode only

| Builtin | Returns | Notes |
|---|---|---|
| `sensor(i)` | number | Reflectance of sensor `i`: `0.0` = white floor, `1.0` = black line. |
| `sensor_count()` | number | How many reflectance sensors this robot/layout has. |
| `sensor_x(i)` | number | Lateral offset of sensor `i` in millimeters. Positive = the robot's right. |
| `sensor_y(i)` | number | Forward offset of sensor `i` in millimeters, from the robot's wheel axis. Positive = ahead of the axis. |
| `line_error()` | number | Normalized weighted-average lateral error, range `[-1, 1]`. Positive means the line is to the robot's right. |
| `line_error_mm()` | number | The same error in physical millimeters instead of normalized. |
| `line_lost()` | bool | `true` while every sensor reads below the white/black threshold (no line detected at all). |
| `drive(left, right)` | none | Sets wheel speeds in mm/s, clamped to the robot's max wheel speed. This is the only way to move the robot in line mode. |

### Maze mode only

| Builtin | Returns | Notes |
|---|---|---|
| `range(dir)` | number | Rangefinder distance in mm. `dir` is `front`, `left`, or `right`. |
| `can_move(dir)` | bool | Whether the wall in `dir` (`forward`/`left`/`right`/`back`, robot-relative) is known open. |
| `move_to(dir)` | none | Drives to the adjacent cell in that direction; ends the current `on junction`. |
| `at_goal()` | bool | Whether the robot is currently in the goal region. |
| `visited(dir)` | bool | Whether the neighbor cell in that direction has been entered before. |
| `cell_row()` | number | Current cell's row. |
| `cell_col()` | number | Current cell's column. |
| `heading()` | number | Current heading in degrees. |
| `distance_to_goal(dir)` | number | BFS distance from the neighbor cell in `dir` to the nearest goal cell, computed over *currently known* walls only. Returns a large sentinel value if that neighbor can't reach the goal with what's known so far. |
| `unexplored_count()` | number | How many cells haven't been visited yet. |
| `finish()` | none | Declares the run complete. The simulator still independently checks the robot is actually in the goal region. |
| `mark_walls()` | none | Records wall knowledge from the rangefinders immediately, instead of waiting for automatic end-of-tick recording. Usually unnecessary — see "The maze motion layer" above. |

**Five direction words are predefined constants in maze mode**: `forward`, `back`, `left`,
`right`, `front` — each is simply the string equal to its own name (e.g. the bare word `forward`
*is* the string `"forward"`). They're plain identifiers, not special syntax — pass them directly
as arguments, exactly as every worked example above does:

```
if can_move(left):
  move_to(left)
```

`front` is only used with `range()`; the other four are used with `can_move`/`move_to`/
`distance_to_goal`/`visited`.

---

## Sensor model and coordinates

- **`+lateralMm` is the robot's right, `-lateralMm` is the robot's left.** `sensor(0)` is always
  the leftmost sensor — sensors are ordered by `lateralMm` ascending, regardless of how they were
  added in the editor.
- `sensor_x(i)` returns that same lateral offset in millimeters, so `sensor_x(i) < 0` means sensor
  `i` sits left of center. `sensor_y(i)` returns the forward offset in millimeters from the wheel
  axis — together `(sensor_x(i), sensor_y(i))` is that sensor's `(x, y)` position in the robot's
  own frame, whatever the current layout actually is (built-in default or a saved custom one).
  Neither changes if you edit the layout later — a program that reads them always sees the
  geometry that's actually active when it runs.
- `line_error()`'s sign follows the same convention: **positive means the line is to the robot's
  right** (the robot needs to turn right to re-center). Every worked example above assumes this —
  in `drive(base - corr, base + corr)`, a positive `corr` slows the left wheel and speeds the
  right wheel, turning the robot right toward the line.
- A program written against a small sensor array (e.g. 3 sensors) doesn't need to change to run
  on a wider array — `line_error()`/`line_error_mm()` are computed from whatever sensors exist,
  and most programs should read those rather than calling `sensor(i)` for individual sensors
  unless they specifically need per-sensor detail.
- World coordinates use `0°` = `+x` (east), with angles increasing clockwise on screen — this
  only matters if you're reasoning about `heading()`/`atan2()` results directly; the sensor/error
  builtins above already account for it.

---

## Determinism

VTL has no loops, no recursion, no user functions, and **no randomness builtin** (deliberately
omitted). Every builtin is a pure function of the robot's current sensors/state/params. Two runs
of the same program on the same map with the same params produce byte-identical trajectories —
if you need a program to behave differently across runs, that has to come from a `param` the user
changes, not from anything inside the language.

Caps that no reasonable program will approach, enforced at compile time (`VTL014` on overflow):
16 KB source, expression nesting depth 32, 64 `state` declarations, 32 `param` declarations, 4096
evaluated expression nodes per tick.

---

## Error codes

Every error names the line, the column, and what *is* available (near-name suggestions for
typos) — treat a compile error as something to read and fix, not a black box.

| Code | Kind | Fires when |
|---|---|---|
| `VTL001` | parse | Syntax error. Names the unexpected token and what was expected instead. |
| `VTL002` | parse | Indentation error. Names the expected vs. actual column. |
| `VTL003` | name | Unknown identifier — not a declared `param`/`state`/`let`, not a builtin, not a direction constant. Lists near-matches, then what's in scope. |
| `VTL004` | name | Called something that isn't a function. Lists the builtins available in the current mode. |
| `VTL005` | mode | Called a builtin from the *other* mode (e.g. `move_to` in a line program). Names which mode it belongs to. |
| `VTL006` | name | `set` targeting something that isn't a `state` (or an enclosing `let`) — most commonly, trying to `set` a `param`. |
| `VTL007` | arity | Wrong number of arguments to a builtin call. |
| `VTL008` | type | Type mismatch — e.g. arithmetic on a string, or passing a string where a number is expected. |
| `VTL009` | decl | Duplicate `param`/`state` name, or a `param range`/`options` that's invalid (e.g. `lo >= hi`). |
| `VTL010` | structure | A required event block is missing for the mode (no `on tick` in a line program; no `on tick`/`on junction` in a maze program). |
| `VTL011` | runtime | Division by zero, or a result that's `NaN`/`Infinity`. Halts the run, names the line. |
| `VTL012` | runtime | `sensor(i)`/`sensor_x(i)`/`sensor_y(i)` called with an index outside the actual sensor count. |
| `VTL013` | runtime | `move_to` called twice in the same `on junction`, or called from `on tick`. |
| `VTL014` | limit | Program exceeds the source-size, expression-depth, declaration-count, or per-tick node-count cap. |

If you get one of these while iterating on a generated program, fix it and re-check rather than
guessing — every one of these is deterministic and reproducible from the source alone.

---

## Converting an existing program to VTL

The general pattern: replace the outer loop with `on tick`/`on junction` (VTL supplies the loop
for you — every event block already runs once per tick or once per junction), replace local
loop-scoped variables with `let`, and replace anything that needs to persist across iterations
with `state`.

### From Python

A typical Python proportional line follower:

```python
Kp = 0.45
base_speed = 250

def loop():
    error = read_line_error()          # -1..1, positive = line is to the right
    correction = Kp * error * 340      # 340 scales the normalized error to a wheel-speed delta
    left_speed = base_speed - correction
    right_speed = base_speed + correction
    set_motor_speeds(left_speed, right_speed)
```

Becomes:

```
param Kp = 0.45 range 0..2
param base = 250 range 50..800

on tick:
  let e = line_error()
  let corr = Kp * e * 340
  drive(base - corr, base + corr)
```

`Kp` and `base_speed` become `param`s (so they show up as live sliders instead of hardcoded
constants) — this is almost always the right move for any tunable gain or speed in a converted
program, even if the original code hardcoded it.

### From Arduino/C++

A typical Arduino wall-follower `loop()`:

```cpp
void loop() {
  if (canMoveLeft()) {
    moveTo(LEFT);
  } else if (canMoveForward()) {
    moveTo(FORWARD);
  } else if (canMoveRight()) {
    moveTo(RIGHT);
  } else {
    moveTo(BACK);
  }
}
```

Becomes exactly worked example 5 above:

```
on junction:
  if can_move(left):
    move_to(left)
  elif can_move(forward):
    move_to(forward)
  elif can_move(right):
    move_to(right)
  else:
    move_to(back)
```

Note the Arduino version's `loop()` runs continuously and re-checks every tick, but VTL's
`on junction` already only fires once per decision point (the built-in motion layer handles the
actual driving) — don't wrap this in `on tick` or try to re-check every tick, that isn't how the
maze motion layer works (see above).

---

## Before handing a program over

1. It only uses constructs from the grammar above — no loops, functions, arrays, or anything
   listed under "Things VTL does not have."
2. Every `param`/`state` name is declared before use, and every `set` targets a `state` (or an
   enclosing `let`) — never a `param`.
3. A line program has an `on tick` block; a maze program has `on tick` and/or `on junction`.
4. Every builtin call uses the right mode's builtins, with the right number of arguments.
5. Direction words (`forward`/`back`/`left`/`right`/`front`) are used bare, not quoted as strings,
   and only where a maze builtin expects a direction.
6. If you have code execution available, actually run the program through a VTL interpreter (or
   at least parse it) before handing it over, rather than eyeballing it — this document is
   detailed but VTL's exact error behavior is still easiest to get right by testing.

---

## Output format

**Default: hand back the VTL program as a plain fenced code block, nothing else.** Do not produce
a `.vectortrack-algorithm.json` file unless the user explicitly asks for a file, an import file,
or something to import directly (e.g. "give me a file I can import," "make it a
.vectortrack-algorithm.json," "I want to import this"). Absent that, plain source text is the
complete deliverable — the user pastes it into VectorTrack's algorithm editor themselves.

## Import file format

When the user does ask for an importable file, produce a JSON file named
`<slug>.vectortrack-algorithm.json`:

```json
{
  "format": "vectortrack-algorithm",
  "formatVersion": 1,
  "algorithm": {
    "id": "any-unique-string",
    "name": "My Algorithm",
    "mode": "line",
    "source": "param Kp = 0.45 range 0..2\nparam base = 250 range 50..800\n\non tick:\n  let e = line_error()\n  let corr = Kp * e * 340\n  drive(base - corr, base + corr)\n",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "lastCompile": null
  }
}
```

- `mode` is `"line"` or `"maze"`, matching what the program actually uses.
- `source` is the complete VTL program text, `\n`-separated (standard JSON string escaping).
- `id`, `createdAt`, `updatedAt`, and `lastCompile` can be any syntactically valid values —
  VectorTrack assigns a fresh id and timestamps on import (and re-derives `lastCompile` itself by
  actually compiling the source), so these are never trusted from the file.
- For multiple algorithms in one file, use `"algorithms": [ { ... }, { ... } ]` instead of the
  single `"algorithm"` key.
- VectorTrack **compiles every algorithm before accepting the import** — a file whose `source`
  doesn't compile is rejected outright, so always verify compilation (see "Before handing a
  program over" above) rather than relying on import-time validation to catch mistakes.

### Bundling a sensor layout

An import file can optionally carry a custom sensor layout alongside the algorithm, so the
geometry the program was written against travels with the code instead of depending on whatever
layout happens to be selected at import time:

```json
{
  "format": "vectortrack-algorithm",
  "formatVersion": 1,
  "algorithm": { "...": "as above" },
  "sensorLayout": {
    "id": "any-unique-string",
    "name": "5-sensor wide array",
    "mode": "line",
    "basedOnRobotId": "lf-scout",
    "sensors": [
      { "id": "s0", "type": "reflectance", "forwardMm": 60, "lateralMm": -50, "headingDeg": 0, "spotRadiusMm": 6 },
      { "id": "s1", "type": "reflectance", "forwardMm": 60, "lateralMm": -25, "headingDeg": 0, "spotRadiusMm": 6 },
      { "id": "s2", "type": "reflectance", "forwardMm": 60, "lateralMm": 0, "headingDeg": 0, "spotRadiusMm": 6 },
      { "id": "s3", "type": "reflectance", "forwardMm": 60, "lateralMm": 25, "headingDeg": 0, "spotRadiusMm": 6 },
      { "id": "s4", "type": "reflectance", "forwardMm": 60, "lateralMm": 50, "headingDeg": 0, "spotRadiusMm": 6 }
    ],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

- Use `"sensorLayouts": [ { ... }, { ... } ]` alongside `"algorithms"` for a multi-algorithm file,
  the same singular/plural pairing as `algorithm`/`algorithms`.
- `sensors[].forwardMm`/`lateralMm` are exactly what `sensor_y(i)`/`sensor_x(i)` return at runtime
  (millimeters, robot-frame, `+lateralMm` = right, `+forwardMm` = ahead of the wheel axis) — see
  "Sensor model and coordinates" below. `headingDeg` only matters for `type: "rangefinder"`
  (maze-mode rangefinders); reflectance sensors leave it `0`.
- `mode` must match the algorithm's own `mode`. `basedOnRobotId` should name a real built-in robot
  id (e.g. `lf-scout`, `lf-ranger`) — it supplies the chassis geometry (wheelbase, max speed) the
  layout is drawn against; it does not need to be the same robot the user currently has selected.
- `id`, `createdAt`, and `updatedAt` are never trusted from the file, same as the algorithm's own —
  VectorTrack assigns fresh ones on import. A layout with a name that collides with an
  already-saved one is imported as a new layout with a disambiguating suffix, never overwritten.
- Importing a bundled layout does not select it automatically — the user picks it from the
  "Sensors" editor's Presets dropdown after importing (or from the sensor-layout row in the robot
  sidebar).
- Only produce a `sensorLayout`/`sensorLayouts` field when the user's algorithm actually depends on
  a non-default sensor arrangement (a custom sensor count/spacing, not just the robot's own
  built-in default) — most algorithms don't need one, and an unnecessary bundled layout is more for
  the user to review before trusting the import.

## Using this file

**In Claude** (Claude.ai, Claude Code, or the Claude Agent SDK): save this file as `SKILL.md`
inside a folder named `vectortrack-algorithm-author`, then place that folder wherever Claude
loads Skills from (the Skills section of Claude.ai settings, or a project's `.claude/skills/`
directory). Claude then writes VectorTrack algorithms automatically whenever you ask for one.

**In any other AI model**: paste this entire file into the conversation (or attach it, for models
that accept file uploads) before asking for an algorithm — for example, "Using the attached spec,
write a VectorTrack maze solver that prefers the right wall." Any model capable of following a
detailed language spec can produce a working VTL program this way.