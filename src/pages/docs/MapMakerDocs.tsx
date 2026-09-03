import { CodeBlock, SectionHeading, Shot, SubSection, Table } from './DocsShared';

export function MapMakerDocs() {
  return (
    <>
      <SectionHeading id="map-maker" eyebrow="v0.2.0" title="Map Maker" />
      <p className="pt-4 text-[15px] leading-relaxed text-neutral-300">
        A custom map editor, reachable from the homepage nav or the simulator's header, for both maze and
        line-follower tracks. Custom maps are stored entirely in the browser and are fully runnable in the
        simulator — same playback, telemetry, best-times, and completion tracking as a built-in map. Both editors
        have a <strong className="text-neutral-100">Save</strong> button and a{' '}
        <strong className="text-neutral-100">Save &amp; Simulate</strong> button next to it — the latter saves the
        current draft (subject to the same error-severity block as a plain save) and jumps straight into the
        simulator with that map selected, skipping the trip back through the map list.
      </p>

      <SubSection id="map-maker-list" title="My Maps">
        <p>
          <code>/editor</code> opens with two shortcuts, <strong className="text-neutral-100">+ New Maze</strong>{' '}
          and <strong className="text-neutral-100">+ New Line Track</strong>, that go straight into the new-map
          size picker for that mode. Below them, a <strong className="text-neutral-100">Maze Maps</strong> /{' '}
          <strong className="text-neutral-100">Line Tracks</strong> tab switcher lists every custom map saved to{' '}
          <code>localStorage</code> for that mode, most-recently-updated first. Each row can be opened for editing
          (<strong className="text-neutral-100">Edit</strong>), duplicated (fresh id, "copy" suffix), exported as
          a single <code>.vectortrack.json</code> file, or deleted (an inline confirm step, not a native browser
          dialog). "Export all" downloads every map in one file; a 50-map soft cap surfaces as a real error
          message rather than silently failing.
        </p>
        <Shot src="/VectorTrack/screenshots/docs/map-maker-list.jpg" alt="My Maps list" caption="The My Maps list — open, duplicate, export, or delete any saved map." />
      </SubSection>

      <SubSection id="map-maker-maze-editor" title="Maze editor">
        <p>
          Starting a brand-new maze first asks you to pick a grid size (8×8 up to 20×20) — you can always zoom in
          afterward for precise editing, and a close button on the picker backs out without creating anything.{' '}
          <code>/editor/maze/:id</code>{' '}
          then renders a post-and-wall lattice on a canvas, using the exact same world-mm ⇄ screen-px transform as
          the simulator's 2D view, so the two can never visually drift apart. Scroll to zoom toward the cursor
          (up to 8×), drag with the middle mouse button to pan, or use the floating zoom controls. Three
          icon-labeled placement modes: <strong className="text-neutral-100">Walls</strong> (click or drag-paint
          segments — the border is always closed and locked), <strong className="text-neutral-100">Start</strong>{' '}
          (click a cell, cycle its facing), and <strong className="text-neutral-100">Goal</strong> (click a cell,
          toggle between a 1×1 and 2×2 footprint).
        </p>
        <CodeBlock
          title="src/editor/maze/interaction.ts"
          code={`// The first toggle in a drag decides add-vs-remove for the rest of the
// drag, so dragging across a mixed row of open/closed walls doesn't flicker.
export function startDragMode(grid: MazeWallGrid, hit: SegmentHit): DragMode {
  return getSegmentWall(grid, hit) ? 'remove' : 'add';
}`}
        />
        <p>
          Shortcuts: fill every wall, clear the interior back to one empty room, or generate a fresh random maze
          (the same seeded perfect-maze generator plus random-loop carving the built-in maps use). Undo/redo is a
          50-entry snapshot stack — one entry per <em>gesture</em> (a whole drag stroke, or one placement click),
          not one per wall touched, so undoing a drag takes one press.
        </p>
        <Shot src="/VectorTrack/screenshots/docs/map-maker-maze-editor.jpg" alt="Maze editor canvas" caption="Painting walls — the red ring flags the start cell sitting inside the goal region." />
      </SubSection>

      <SubSection id="map-maker-line-editor" title="Line editor">
        <p>
          A brand-new line track starts with the same size-and-resolution picker as the maze editor — canvas size
          from Small (80×50) up to Large (140×90) cells, and cell resolution from Fine (10 mm) up to Coarse
          (30 mm), so you can start at a much finer paint resolution than before. <code>/editor/line/:id</code> then renders a
          paint grid on a canvas — a white floor with a black line, matching what a real reflectance sensor sees —
          using the same world-mm ⇄ screen-px transform as the maze editor and the simulator's 2D view, with the
          same scroll-to-zoom (up to 8×) and pan behavior. A brand-new track starts as a valid oval ring, not a
          blank canvas, so it validates cleanly the instant it's created. Six icon-labeled tools:{' '}
          <strong className="text-neutral-100">Pencil</strong> and{' '}
          <strong className="text-neutral-100">Eraser</strong> (paint or clear cells on drag),{' '}
          <strong className="text-neutral-100">Line</strong> (Bresenham-rasterized straight segment),{' '}
          <strong className="text-neutral-100">Rectangle</strong> and{' '}
          <strong className="text-neutral-100">Ellipse</strong> (outline only — a filled shape is never valid
          track), and <strong className="text-neutral-100">Start</strong> (click to place, a button rotates
          heading in 45° steps). Brush width is 1, 2, or 3 cells, shown with their mm equivalent for the chosen
          resolution.
        </p>
        <p>
          Line, Rectangle, and Ellipse preview live as you drag, without touching the underlying grid until you
          release — so you can freely adjust a shape's size before committing it. Undo/redo is the same
          50-entry-per-gesture stack as the maze editor.
        </p>
        <Shot src="/VectorTrack/screenshots/docs/map-maker-line-editor.jpg" alt="Line editor canvas" caption="Painting a track — brush width and tool selection live in the sidebar." />
      </SubSection>

      <SubSection id="map-maker-validation" title="Validation">
        <p>
          300ms after the last change, the draft is checked against the robot picked in "Validate for" — the
          shorter-sighted maze robot (Sprint) or line robot by default, depending on which editor is open. Both
          rule sets are deliberately small: a rule only exists if it's cheap to compute, easy for a casual author
          to act on, and correlates with a real problem — several earlier raster-pattern-matching heuristics (a
          junction detector, a "two nearby but unconnected stretches" check, a canvas-edge-margin warning, an
          "open 3×3 area" check) were tried and then removed outright, rather than kept as unactionable noise.
          Maze static graph/geometry rules run first:
        </p>
        <Table
          headers={['Code', 'Severity', 'Checks']}
          rows={[
            ['MZ001', 'error', 'Start cell sits inside the goal region.'],
            ['MZ002', 'error', 'Goal is unreachable from start.'],
            ['MZ003', 'warning', 'Start or goal cell fully enclosed by four walls (redundant with MZ002 whenever it actually blocks the goal).'],
            ['MZ004', 'warning', 'A region of 4+ cells is unreachable from start.'],
            ['MZ005', 'info', 'No loops — a perfect maze, exactly one route to the goal.'],
          ]}
        />
        <p>Then physical rules, comparing corridor width and sensor range against the selected robot's real dimensions:</p>
        <CodeBlock
          title="src/editor/validation/mazeRules.ts"
          code={`const corridorWidthMm = cellSizeMm - wallThicknessMm;
const turnClearanceMm = corridorWidthMm - robot.chassisWidthMm;

if (corridorWidthMm <= robot.chassisWidthMm)      → MZP01 error: robot cannot physically enter
else if (turnClearanceMm < 20)                    → MZP02 warning: cannot turn around in a dead end
else if (turnClearanceMm < 60)                    → MZP03 warning: tight, expect wall clips

if (robot.sensorRangeMm < cellSizeMm)             → MZP04 warning: can't see the far wall of its own cell`}
        />
        <p>Line-track rules run against the painted grid's connectivity and geometry:</p>
        <Table
          headers={['Code', 'Severity', 'Checks']}
          rows={[
            ['LF001', 'error', 'Canvas is empty — no painted cells.'],
            ['LF002', 'error', 'No start marker placed, or it sits on an unpainted cell.'],
            ['LF003', 'error', 'Track has a piece disconnected beyond a bridgeable gap (nearest-boundary distance further than the gap threshold).'],
            ['LF004', 'warning', 'A gap exists but is within the bridgeable threshold — worth confirming it’s intentional (e.g. a dashed section).'],
            ['LF005', 'warning', 'Estimated lap length under 1500 mm — very short laps make lap detection fragile.'],
          ]}
        />
        <p>
          Only <code>MZ001</code>/<code>MZ002</code>/<code>MZP01</code> (maze) and{' '}
          <code>LF001</code>/<code>LF002</code>/<code>LF003</code> (line) block Save — every other rule is a
          quality/difficulty signal on a map that's still genuinely runnable.
        </p>
        <Shot src="/VectorTrack/screenshots/docs/map-maker-validation.jpg" alt="Validation panel" caption="Live validation panel — save is blocked while an error-severity issue is present." />
      </SubSection>

      <SubSection id="map-maker-import-export" title="Import / export">
        <p>
          Export writes a versioned JSON envelope (<code>{'{ format, formatVersion, map }'}</code> or{' '}
          <code>{'{ format, formatVersion, maps }'}</code> for "export all"); import rejects a file whose{' '}
          <code>formatVersion</code> doesn't match, rather than silently misreading it. Imported maps always get a
          freshly generated id and, if their name collides with one already saved, a suffix like{' '}
          <code>"Name (2)"</code> — importing can never silently overwrite an existing map. Files can be dropped
          directly onto the My Maps page or picked via a file input.
        </p>
      </SubSection>

      <SubSection id="map-maker-simulator" title="Running custom maps">
        <p>
          Every saved map — maze or line — shows up in the simulator's own map picker under a "My Maps" dropdown,
          right beside the built-in track picker. Both pickers show a thumbnail of the map next to its name and
          open a scrollable list on click, so having dozens of maps never grows the sidebar. A{' '}
          <strong className="text-neutral-100">+ New</strong> link below "My Maps" jumps straight into the size
          picker for the simulator's current mode, so you can start a new track without leaving the simulator.
          Selecting a map runs it exactly like a built-in one: same playback controls, telemetry, PID/algorithm
          tuning, best-times, and completion tracking. Editing a map and returning to the simulator always
          reflects the latest saved version — nothing is cached from before the edit.
        </p>
        <Shot src="/VectorTrack/screenshots/docs/map-maker-simulator.jpg" alt="My Maps in the simulator" caption='A custom map running in the simulator, listed under "My Maps".' />
      </SubSection>

      <SubSection id="map-maker-ai-generation" title="AI map generation">
        <p>
          Every custom map is plain JSON, which means an AI model can write one directly from a description of the
          track or maze you want.{' '}
          <a
            href="/VectorTrack/skills/vectortrack-map-generator/SKILL.md"
            download
            className="text-sky-400 hover:underline"
          >
            Download the map-generator reference (SKILL.md)
          </a>{' '}
          and hand it to your AI model of choice — it documents the full <code>.vectortrack.json</code> schema,
          the bit-packing format, coordinate conventions, and every validation rule, with worked examples for both
          modes.
        </p>
        <p>
          <strong className="text-neutral-100">In Claude:</strong> save the file as{' '}
          <code>SKILL.md</code> inside a folder named <code>vectortrack-map-generator</code> in your Claude Skills
          directory (or upload it as a project file in claude.ai). Once installed, ask Claude for a maze or line
          track in plain language — "a 12×12 maze with a long dead-end corridor" or "an oval track with two tight
          hairpins" — and it can generate a ready-to-import <code>.vectortrack.json</code> file.
        </p>
        <p>
          <strong className="text-neutral-100">In any other AI model:</strong> attach or paste the same file as
          context before asking for a map — the schema and rules inside are model-agnostic. Either way, import the
          resulting file from <code>/editor</code> (My Maps → import) the same as any other{' '}
          <code>.vectortrack.json</code> file.
        </p>
      </SubSection>
    </>
  );
}
