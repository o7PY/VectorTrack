---
name: vectortrack-map-generator
description: Generate maze and line-follower map files for the VectorTrack robotics simulator. Use this skill whenever the user asks to design, create, or generate a maze, a line-following track, or a ".vectortrack.json" map — including requests like "make me a maze with a spiral corridor" or "design a figure-eight line track" — and produce a JSON file the user can import directly into VectorTrack's Map Maker.
license: Free to copy, modify, and redistribute.
---

# VectorTrack map generator

VectorTrack is a browser-based simulator for line-following and maze-solving robots. This skill
describes the exact JSON file format its Map Maker can import, so you can generate a complete,
valid map from a natural-language description and hand the user a file they can drop straight into
the app (Map Maker → **Import**, or dragged onto the My Maps page).

This document is written for any AI model, not just Claude — the file format, coordinate systems,
and validation rules below are the complete, authoritative spec. If you have code execution
available, use it: the bit-packing step in particular is mechanical and error-prone to do by hand.

## Output contract

Always produce a single JSON file (not JSON embedded in prose) named `<slug>.vectortrack.json`,
containing one of these two envelopes:

```json
{ "format": "vectortrack-map", "formatVersion": 1, "map": { ... } }
```

`map` is either a **maze map** or a **line map**, described below. `id`, `createdAt`, and
`updatedAt` can be any syntactically valid values — VectorTrack assigns a fresh id and timestamps
on import, so these are never trusted from the file. Still include them (any UUID-shaped string for
`id`, any ISO-8601 string for the timestamps) so the file parses.

Every map (both modes) shares these fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Any unique string, e.g. `"custom-<slug>"`. Replaced on import. |
| `name` | string | 1–48 characters. |
| `mode` | `"maze"` \| `"line"` | Selects which shape below applies. |
| `createdAt`, `updatedAt` | string | ISO-8601 timestamp, e.g. `"2026-01-01T00:00:00.000Z"`. |
| `validationRobotId` | string | `"mz-probe"` or `"mz-sprint"` for a maze; `"lf-scout"` or `"lf-ranger"` for a line track. |
| `lastValidation` | `null` | Always `null` in a generated file. |

## Bit-packing (used by both modes)

Wall grids and paint grids are stored as **base64-encoded, bit-packed, row-major bit arrays**, least
-significant-bit first within each byte. To encode an array of 0/1 values `bits` of length `n`:

```
bytes = ceil(n / 8) zero bytes
for i in 0..n-1:
  if bits[i]: bytes[i >> 3] |= (1 << (i & 7))
result = base64(bytes)
```

To decode a base64 string back into `n` bits, reverse the same process (this is exactly what
VectorTrack's own `base64ToBits`/`bitsToBase64` do). Any correct implementation of this exact
algorithm — in Python, JavaScript, or by hand for very small grids — produces a string VectorTrack
will import.

---

## Maze maps (`"mode": "maze"`)

A maze is a rectangular grid of cells (`rows` × `cols`) bounded by walls. The robot starts in one
cell and must reach a goal region.

| Field | Type | Notes |
|---|---|---|
| `rows`, `cols` | integer | Practical range 6–24. The built-in size presets are 8×8 to 20×20; other sizes work fine. |
| `cellSizeMm` | integer | Millimeters per cell, edge to edge. Practical range 100–260mm — see the physical rules below for what's actually navigable by a given robot. |
| `wallThicknessMm` | integer | Wall thickness in mm, subtracted from `cellSizeMm` to get corridor width. `12` is the standard value used by every built-in maze. |
| `hWalls` | string (base64 bits) | Horizontal wall segments, `(rows + 1) × cols` bits. Bit `r * cols + c` is the wall between cell `(r-1, c)` and cell `(r, c)`; `r = 0` is the top border, `r = rows` is the bottom border. |
| `vWalls` | string (base64 bits) | Vertical wall segments, `rows × (cols + 1)` bits. Bit `r * (cols + 1) + c` is the wall between cell `(r, c-1)` and cell `(r, c)`; `c = 0` is the left border, `c = cols` is the right border. |
| `start` | `{ row, col, headingDeg }` | Cell indices, 0-based, `row 0` at the top. `headingDeg` is required for the schema and shown as a rotatable arrow in the editor, but every maze run begins with the robot facing `+x` (θ = 0°) regardless of this value — it doesn't change simulator behavior, so any value is safe. |
| `goal` | `{ row, col, width, height }` | Top-left cell of the goal region; `width`/`height` are each `1` or `2` (a 1×1 or 2×2 goal footprint). |

**Every border edge must have a wall** (`hWalls` rows `0` and `rows`, `vWalls` columns `0` and
`cols`, all `1`) — an open border lets the robot leave the maze entirely.

### Maze rules

The goal must be reachable from the start through open (non-walled) edges — a maze with the goal
sealed off is rejected outright. Beyond that, aim for these to keep the maze genuinely solvable and
enjoyable:

| Rule | Trigger | Severity |
|---|---|---|
| Start-in-goal | The start cell sits inside the goal region. | Blocks import |
| Unreachable goal | No open path from start to any goal cell. | Blocks import |
| Robot too wide | `cellSizeMm - wallThicknessMm <= chassisWidthMm` of the target robot. | Blocks import |
| Enclosed cell | Start or a goal cell is walled on all four sides. | Discouraged |
| Isolated region | 4+ cells form a pocket unreachable from start. | Discouraged |
| Tight turning | `cellSizeMm - wallThicknessMm - chassisWidthMm < 20mm`. | Discouraged — robot can't turn around in a dead end |
| Cramped corridors | That same clearance is under 60mm. | Worth avoiding — expect wall clips |
| Short sensor range | The target robot's sensor range is less than `cellSizeMm`. | Worth avoiding — degrades junction detection |

Reference robot geometry: **Probe** (`mz-probe`) has a 90mm chassis and 250mm sensor range; **Sprint**
(`mz-sprint`) has a 70mm chassis and 150mm sensor range. At the standard `cellSizeMm: 180,
wallThicknessMm: 12`, corridor width is 168mm — comfortable for both robots.

A maze with no loops (exactly one path from start to goal — a "perfect maze") is completely valid;
add loops only if the user wants multiple routes.

---

## Line maps (`"mode": "line"`)

A line track is a painted path on a grid, rendered as a black line on a white floor. The robot
follows the line with reflectance sensors.

| Field | Type | Notes |
|---|---|---|
| `rows`, `cols` | integer | Practical range 40–150. The built-in size presets run from 80×50 to 140×90. |
| `cellSizeMm` | integer | Millimeters per grid cell (paint resolution, not line width). Practical range 10–30mm — finer values (10mm) allow smoother curves. |
| `bits` | string (base64 bits) | Paint grid, row-major, `cols × rows` bits. Bit `row * cols + col` is `1` if that cell is part of the track (painted black), `0` if it's empty floor (white). |
| `start` | `{ xMm, yMm, headingDeg }` | **Real-world millimeters**, not cell indices — `xMm = (col + 0.5) * cellSizeMm` for a point centered in a cell. Must land on a painted cell. |

### Coordinates and heading

`x` increases rightward, `y` increases downward (standard screen/canvas convention — this matches
how the map looks when you picture it top-down with row 0 at the top). `headingDeg` is a standard
trigonometric angle in degrees: `0°` points along `+x` (right/east), `90°` points along `+y`
(down/south on the page), `180°` is left/west, `270°` is up/north. Set it to the direction the track
runs at the start point (its local tangent), so the robot begins driving along the line rather than
across it.

### Building the track

Paint a **closed loop, one line-width wide** (2–3 cells is typical) using basic raster shapes —
lines, rectangle outlines, ellipse outlines, or freehand cell-by-cell painting. A filled shape is
never a valid track; only its outline is. The simplest correct track is a rounded rectangle or oval
ring, several cells in from the canvas edge, with the start point placed on the loop and its heading
matching the loop's direction at that point.

### Line rules

| Rule | Trigger | Severity |
|---|---|---|
| Empty canvas | No painted cells at all. | Blocks import |
| Missing/misplaced start | No start point, or it's not on a painted cell. | Blocks import |
| Disconnected track | Two painted pieces further apart than ~200mm (not bridgeable). | Blocks import |
| Small gap | A gap under ~200mm — usually fine (e.g. a deliberate dashed section), but confirm it's intentional. | Worth a note |
| Short lap | Estimated lap length under 1500mm. | Worth avoiding — short laps make lap detection unreliable |

Reference robot geometry: **Scout** (`lf-scout`) is the forgiving beginner robot; **Ranger**
(`lf-ranger`) is faster and less tolerant of sharp corners — prefer smoother, wider curves for tracks
aimed at Ranger.

---

## Worked example: a small maze

A 3×3 maze, 200mm cells, start at bottom-left facing into the maze, goal at top-right, with one
extra loop carved in:

```json
{
  "format": "vectortrack-map",
  "formatVersion": 1,
  "map": {
    "id": "custom-example-maze",
    "name": "Example Maze",
    "mode": "maze",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "validationRobotId": "mz-sprint",
    "lastValidation": null,
    "rows": 3,
    "cols": 3,
    "cellSizeMm": 200,
    "wallThicknessMm": 12,
    "hWalls": "<base64 of the 12-bit horizontal wall array — compute with the algorithm above>",
    "vWalls": "<base64 of the 12-bit vertical wall array — compute with the algorithm above>",
    "start": { "row": 2, "col": 0, "headingDeg": 270 },
    "goal": { "row": 0, "col": 2, "width": 1, "height": 1 }
  }
}
```

Work out `hWalls`/`vWalls` by first drawing the maze as a grid on paper (or in code) — decide which
of the 24 possible wall segments (12 horizontal + 12 vertical, for a 3×3 grid) are present, lay them
out as a 0/1 array in the exact bit order from the tables above, then run the bit-packing algorithm.
Always leave every border segment (the outermost ring) set to `1`.

## Verifying your output before handing it over

1. The envelope has `format: "vectortrack-map"` and `formatVersion: 1`.
2. Every required field for the mode is present with the right type.
3. `hWalls`/`vWalls` (maze) or `bits` (line) are valid base64 and decode to exactly the expected bit
   length — `(rows+1)*cols`, `rows*(cols+1)`, and `cols*rows` respectively.
4. The maze border is fully walled, and the goal is reachable from the start.
5. The line track is a single closed loop with no filled interior, and the start point sits on a
   painted cell.

## Using this file

**In Claude** (Claude.ai, Claude Code, or the Claude Agent SDK): save this file as `SKILL.md` inside
a folder named `vectortrack-map-generator`, then place that folder wherever Claude loads Skills from
(the Skills section of Claude.ai settings, or a project's `.claude/skills/` directory). Claude then
generates VectorTrack maps automatically whenever you ask for one.

**In any other AI model**: paste this entire file into the conversation (or attach it, for models
that accept file uploads) before asking for a map — for example, "Using the attached spec, generate
a VectorTrack line track shaped like a figure eight." Any model capable of following a detailed
format spec and, ideally, running code for the bit-packing step can produce a working file this way.
