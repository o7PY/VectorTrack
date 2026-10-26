---
name: vectortrack-algorithm-author
description: Write custom line-follower and maze-solver robot control programs in VTL ("VectorTrack Language") for the VectorTrack robotics simulator. Use this skill whenever the user asks to write, generate, or tune a line-following or maze-solving algorithm for VectorTrack — including requests like "write a PID line follower," "make a maze robot that hugs the right wall," or "generate a .vectortrack-algorithm.json file" — and produce a program the user can import directly into VectorTrack's algorithm editor.
license: Free to copy, modify, and redistribute.
---

# VectorTrack algorithm author (VTL)

VectorTrack is a browser-based simulator for line-following and maze-solving robots. Users write
their own robot control logic in **VTL** ("VectorTrack Language"), a small, deliberately
constrained language designed to be introspectable and impossible to hang. This document is the
complete, authoritative spec for VTL — anything not described here does not exist in the
language. It's written for any AI model, not just Claude.

**VTL has no unbounded loops** — every loop's iteration count is known when the program compiles
— **and no user-defined functions or recursion.** This is deliberate, not a missing feature: it
keeps every program's per-tick cost statically bounded, keeps execution deterministic, and means
there is never an infinite-loop or timeout case to handle. A bounded `for` loop exists (see
"Loops" below) but its bound must be a literal, `len(...)`, or `sensor_count()` — never something
computed at runtime — precisely so the compiler can check the cost *before* the program ever runs,
turning what would otherwise be a mid-run hang into a compile error with a line number. Maze-solving
logic in particular still has to be expressed differently than you'd write it in Python or C — see
"The maze motion layer" below before assuming you need a graph-search loop.

## Worked examples first

Seven complete, runnable programs. Pattern-match from these before reading the formal grammar
below. Six are loop-free — that's correct, most programs should be. The seventh (last) is the one
exception, and it exists to show what arrays and loops are actually for.

### 1. PID line follower

```
param Kp = 0.45 range 0..2
param Ki = 0.00 range 0..0.5
param Kd = 0.12 range 0..1
param base = 250 range 50..800

state integral = 0

on tick:
  let e = line_error()
  set integral = clamp(integral + e * dt(), -1, 1)
  steer(base, Kp * e + Ki * integral + Kd * deriv(e, 0.12))
```

`deriv(e, tau)` is a builtin low-pass-filtered derivative — don't hand-roll the filter yourself
(see "Builtins" below for why). `steer(base, correction)` is sugar over `drive()` that applies the
internal error-to-wheel-speed scaling for you. If you want to see what a PID actually computes
term-by-term, unrolled, here's the same controller written out explicitly — equivalent to the
version above tick-for-tick, just longer:

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

### 7. Sugeno fuzzy line follower

This is what `state x[N]` (fixed-size arrays), `table` (immutable constant lists), and bounded
`for` loops are actually for. A 5×5 fuzzy rule base needs somewhere to put per-rule membership
values and per-rule output weights — expressing this without indexed storage means ~45 lines of
unrolled, near-identical arithmetic that's easy to transpose an index in. This is the *only*
example here that uses a loop; examples 1–6 above are loop-free on purpose, and that's still the
right default for most programs.

```
# 5x5 Sugeno fuzzy controller.
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
```

Note `for i in 0..4` runs 5 times (0, 1, 2, 3, 4) — ranges are **inclusive at both ends**, unlike
Python's `range()`. See "Loops" below.

---

## Grammar

The complete language. Anything not listed here does not exist — no dynamically-sized or growable
arrays, no 2D arrays, no objects, no ternary expressions, no string concatenation operator, nothing
beyond what's below.

```
program     := ( paramDecl | stateDecl | tableDecl | eventBlock )*

paramDecl   := "param" IDENT "=" NUMBER "range" NUMBER ".." NUMBER
             | "param" IDENT "=" STRING "options" STRING ( "," STRING )*

stateDecl   := "state" IDENT "=" ( NUMBER | STRING | "none" )
             | "state" IDENT "[" NUMBER "]" "=" NUMBER          # fixed-size array

tableDecl   := "table" IDENT "=" "[" NUMBER ( "," NUMBER )* "]"  # immutable constants

eventBlock  := "on" EVENT ":" NEWLINE INDENT statement+ DEDENT

statement   := letStmt | setStmt | ifStmt | callStmt | forStmt
letStmt     := "let" IDENT "=" expr
setStmt     := "set" IDENT "=" expr
             | "set" IDENT "[" expr "]" "=" expr                 # indexed assignment
ifStmt      := "if" expr ":" block ( "elif" expr ":" block )* ( "else" ":" block )?
callStmt    := IDENT "(" args? ")"
forStmt     := "for" IDENT "in" bound ".." bound ":" block
bound       := NUMBER | "len" "(" IDENT ")" | "sensor_count" "(" ")"

expr        := orExpr
orExpr      := andExpr ( "or" andExpr )*
andExpr     := notExpr ( "and" notExpr )*
notExpr     := "not" notExpr | comparison
comparison  := sum ( ( "<" | ">" | "<=" | ">=" | "==" | "!=" ) sum )?
sum         := product ( ( "+" | "-" ) product )*
product     := unary ( ( "*" | "/" | "%" ) unary )*
unary       := "-" unary | primary
primary     := NUMBER | STRING | IDENT | indexExpr | call | "(" expr ")"
indexExpr   := IDENT "[" expr "]"
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
  are mutable in place). Assigning to a `param`, to a `table` element, to a loop variable, or to
  any name that isn't declared, is a compile error. Example 6 above relies on `set` targeting a
  `let`: `best` is a `let`, reassigned via `set` inside the `if` blocks that follow its declaration.

### Loops and arrays

- **`state name[N] = fillValue`** declares a fixed-size array of `N` numbers, each starting at
  `fillValue` (a plain non-negative number literal — no expressions, no negative fill values, and
  `N` must be a literal too, from 1 to 64). Read an element with `name[i]`, write one with
  `set name[i] = v`. Using `name` bare, with no subscript (outside `len(name)`), is a compile
  error — an array is never a value on its own.
- **`table name = [v1, v2, ...]`** declares an immutable list of number constants (negative
  literals are fine here, just not as an array's fill value). It can never be modified — `set` on
  a table element is a compile error. A table literal can span multiple lines, as long as the
  brackets stay open, which is how the Sugeno example's 5×5 rule table is laid out one row per
  line. Length must be a literal from 1 to 256.
- **`len(name)`** returns the declared element count of an array or table. It's not a general
  builtin: its one argument must actually name an array or table.
- **`for i in a..b:`** runs its body once for each integer from `a` to `b`, **inclusive at both
  ends** — `for i in 0..4` runs 5 times (0, 1, 2, 3, 4), not 4. This is the single most likely
  mistake when converting from Python, where `range(5)` is exclusive of `5`; a Python
  `for i in range(5)` becomes `for i in 0..4` in VTL, **not** `for i in 0..5`.
  - `a` and `b` must each be a literal number, `len(someArrayOrTable)`, or `sensor_count()` —
    never a `param`, never anything computed. This is what lets the compiler check a loop's total
    cost before the program runs.
  - `i` itself is immutable inside the loop body — `set i = ...` is a compile error, same as
    assigning to a `param`.
  - Loops may nest at most 3 deep, and a single loop's resolved iteration count is capped at 64 —
    a loop that would run too many times, or nest too deep, is a compile error naming the actual
    numbers. The total cost of nested loops (and everything else in the event block) is also
    checked against the overall per-tick node budget (see "Determinism" below).
  - There is still no `while`, no `break`, no `continue`, and no early `return` — a `for` loop
    always runs its full resolved range.

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
them will fail to compile. This list got *more* specific when bounded loops were added, not less
— a bounded `for` is not permission to reach for the rest of this list:

- No `while`, in any form.
- No `for` with a bound that isn't a literal number, `len(...)`, or `sensor_count()` — nothing
  computed, no `param`.
- No `break`, no `continue`, no early `return`. A `for` loop always runs its full resolved range.
- No dynamically-sized or growable arrays — `state x[N]` requires a literal `N`, fixed forever.
- No string arrays, no nested arrays, no 2D arrays, no dicts, no objects. A 2D table is a flat
  `table`/array indexed as `t[row * cols + col]` (see example 7's `rules[i * 5 + j]`).
  Non-negative fill values only for `state x[N] = fillValue`.
- No user-defined functions, no recursion, no imports. No `def`, no `class`, no modules.
- No string concatenation operator and no string formatting/interpolation — `log()`'s first
  argument is a plain label string, not a template.
- No ternary/conditional expression (`a if cond else b`) — use `if`/`elif`/`else` statements.
- No `random()` — VTL programs are deterministic by design; see "Determinism" below.
- No comments other than `#`.

If you find yourself wanting a loop to search over neighbors or iterate sensors, look for a
builtin that already does it (`distance_to_goal`, `unexplored_count`) or restructure the logic to
be computed directly per tick/junction — see the flood-fill example above, which replaces "loop
over all directions and pick the best" with four sequential `if` comparisons instead. Reach for an
actual `for` loop only when you need indexed storage across more elements than it's reasonable to
name individually — a membership array, a rule table — which is what example 7 is for.

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
| `len(name)` | number | Declared element count of an array or `table`. Its one argument must actually name an array or table — not a general builtin. |

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
| `deriv(e, tau)` | number | Low-pass-filtered derivative of `e`, time constant `tau`, pre-scaled to be directly addable to `line_error()`-scale terms (see example 1). Stateful per call site — a second `deriv()` call at a different line/column gets its own independent filter. Compile error (`VTL013`) if called inside a `for` body. |
| `steer(base, correction)` | none | Sugar over `drive()`: applies the internal error-to-wheel-speed scaling and drives with it, so you never hand-multiply calibration constants like `340`/`20` yourself. |

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

VTL has no unbounded loops, no recursion, no user functions, and **no randomness builtin**
(deliberately omitted). Every builtin is a pure function of the robot's current
sensors/state/params. Two runs of the same program on the same map with the same params produce
byte-identical trajectories — if you need a program to behave differently across runs, that has to
come from a `param` the user changes, not from anything inside the language.

What actually makes VTL hang-proof is a runtime per-tick node budget, not the absence of loops —
that budget is checked at compile time too, wherever a loop's cost is knowable statically, so a bad
loop bound is a compile error naming a line rather than a mid-run halt.

Caps that no reasonable program will approach, enforced at compile time (`VTL014`/`VTL015` on
overflow): 16 KB source, expression nesting depth 32, 64 `state` declarations, 32 `param`
declarations, array length 64, `table` length 256, 64 iterations per loop, loop nesting depth 3,
16384 evaluated expression nodes per tick.

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
| `VTL006` | name | `set` targeting something that isn't a `state` or an enclosing `let` — most commonly trying to `set` a `param`, a `table` element (immutable), or a loop variable (immutable). |
| `VTL007` | arity | Wrong number of arguments to a builtin call. |
| `VTL008` | type | Type mismatch — e.g. arithmetic on a string, or passing a string where a number is expected. |
| `VTL009` | decl | Duplicate `param`/`state` name, a `param range`/`options` that's invalid (e.g. `lo >= hi`), an invalid array length, or an empty/oversized `table`. |
| `VTL010` | structure | A required event block is missing for the mode (no `on tick` in a line program; no `on tick`/`on junction` in a maze program). |
| `VTL011` | runtime | Division by zero, or a result that's `NaN`/`Infinity`. Halts the run, names the line. |
| `VTL012` | runtime | `sensor(i)`/`sensor_x(i)`/`sensor_y(i)` called with an index outside the actual sensor count. |
| `VTL013` | runtime | `move_to` called twice in the same `on junction` (or from `on tick`), or `deriv()` called inside a `for` body. |
| `VTL014` | limit | Program exceeds the source-size, expression-depth, declaration-count, or per-tick node-count cap. |
| `VTL015` | structure | Invalid `for` loop: the bound isn't a literal/`len(...)`/`sensor_count()`, the resolved iteration count is too high, or nesting is too deep. Names which and the actual value. |
| `VTL016` | name/type | Array/scalar misuse: indexing something that isn't an array/table, or using an array/table bare with no subscript. Names what the identifier actually is. |
| `VTL017` | name/runtime | Array/table index out of range. Names the index and the declared length. Fires at compile time when the index is a literal, otherwise at runtime. |

If you get one of these while iterating on a generated program, fix it and re-check rather than
guessing — every one of these is deterministic and reproducible from the source alone.

---

## Converting an existing program to VTL

The general pattern: replace the outer loop with `on tick`/`on junction` (VTL supplies the loop
for you — every event block already runs once per tick or once per junction), replace local
loop-scoped variables with `let`, and replace anything that needs to persist across iterations
with `state`. An *inner* loop that iterates a fixed, small number of times (over sensor indices,
over an array) converts to VTL's own bounded `for` — see "Loops and arrays" above — but watch the
range: **a Python `for i in range(n)` becomes `for i in 0..n-1` in VTL, not `for i in 0..n`.**
Python's `range(n)` is exclusive of `n`; VTL's `a..b` is inclusive of `b`. This is the single most
likely mistake when converting a loop, and it produces a program that still compiles and runs —
just with one element silently skipped or double-counted, not a visible error.

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

1. It only uses constructs from the grammar above — no `while`, no functions, no growable/2D
   arrays, or anything else listed under "Things VTL does not have."
2. Every `param`/`state` name is declared before use, and every `set` targets a `state` or an
   enclosing `let` — never a `param`, never a `table` element, never a loop variable.
3. Every `for` loop's bound is a literal, `len(...)`, or `sensor_count()` — and if you converted it
   from a `range(n)`, double-check it's `0..n-1`, not `0..n`.
4. A line program has an `on tick` block; a maze program has `on tick` and/or `on junction`.
5. Every builtin call uses the right mode's builtins, with the right number of arguments.
6. Direction words (`forward`/`back`/`left`/`right`/`front`) are used bare, not quoted as strings,
   and only where a maze builtin expects a direction.
7. If you have code execution available, actually run the program through a VTL interpreter (or
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