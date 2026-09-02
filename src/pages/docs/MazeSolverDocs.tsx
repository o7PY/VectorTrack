import { CodeBlock, SectionHeading, Shot, SubSection, Table } from './DocsShared';

export function MazeSolverDocs() {
  return (
    <>
      <SectionHeading id="maze-solver" eyebrow="Mode" title="Maze Solver" />

      <SubSection id="maze-algorithm" title="Algorithm">
        <p>
          Three rangefinders — front, left, right — mounted at the robot's origin raycast against the maze's wall
          segments and report distance, capped at the robot's sensor range:
        </p>
        <CodeBlock
          title="src/sim/sensors/rangefinder.ts"
          code={`export function sampleMazeSensors(x, y, theta, sensorRange, segments): MazeSensorReading {
  return {
    front: raycast(x, y, theta,               sensorRange, segments),
    left:  raycast(x, y, theta - Math.PI / 2,  sensorRange, segments),
    right: raycast(x, y, theta + Math.PI / 2,  sensorRange, segments),
  };
}`}
        />
        <p>
          <strong className="text-neutral-100">Wall Follower</strong> — one choice parameter, <code>hand</code>{' '}
          (left or right). At each cell it prefers turning toward its hand side if that wall is open, else
          straight, else the opposite side, else a U-turn — the classic hug-one-wall rule. It's simple and usually
          works, but a map with a loop defeats it completely: hugging a ring's outer face forever avoids ever
          crossing an interior doorway.
        </p>
        <CodeBlock
          title="src/sim/algorithms/wallFollower.ts"
          code={`const sideOpen     = (hand === 'right' ? sensors.right : sensors.left) > wallThreshold;
const frontOpen    = sensors.front > wallThreshold;
const oppositeOpen = (hand === 'right' ? sensors.left : sensors.right) > wallThreshold;

if (sideOpen)          next = sideDir;
else if (frontOpen)    next = heading;
else if (oppositeOpen) next = hand === 'right' ? left(heading) : right(heading);
else                    next = back(heading); // dead end`}
        />
        <p>
          <strong className="text-neutral-100">Flood Fill</strong> — no tunable parameters. Three phases:{' '}
          <em>explore</em> to the goal (treating undiscovered edges as optimistically open, so the flood lures the
          robot toward unmapped territory), <em>return</em> to start (now treating unknown edges as walls, so
          replanning only ever retraces confirmed-open edges), then <em>run</em> the precomputed shortest path for
          the timed result. A BFS flood from the target cell gives every reachable cell's distance in one pass:
        </p>
        <CodeBlock
          title="src/sim/algorithms/floodFill.ts"
          code={`function computeFlood(target: Cell, assumeOpen: boolean): number[][] {
  const dist = grid.fill(Infinity);
  dist[target.row][target.col] = 0;
  const queue = [target];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    for (const dir of ALL_DIRS) {
      if (hasWall(cur, dir, assumeOpen)) continue;
      const n = neighborCell(cur, dir);
      if (dist[n] > dist[cur] + 1) { dist[n] = dist[cur] + 1; queue.push(n); }
    }
  }
  return dist;
}`}
        />
        <p>
          Global knowledge is what lets flood fill solve a map that has a loop in it — it isn't fooled by "the
          other way around" looking shorter, because it commits to a path only once the whole reachable region
          near the goal has been mapped.
        </p>
        <Shot src="/VectorTrack/screenshots/docs/maze-algorithm.jpg" alt="Wall Follower algorithm panel" caption="Algorithm panel, Wall Follower selected — Hand is its one choice parameter." />
      </SubSection>

      <SubSection id="maze-robot" title="Robot">
        <p>Two chassis trading sensor range for speed:</p>
        <Table
          headers={['Robot', 'Sensor range', 'Wheelbase', 'Max speed', 'Character']}
          rows={[
            ['Probe', '250 mm', '80 mm', '300 mm/s', 'Standard.'],
            ['Sprint', '150 mm', '60 mm', '600 mm/s', 'Faster but shorter-sighted.'],
          ]}
        />
        <Shot src="/VectorTrack/screenshots/docs/maze-robot.jpg" alt="Robot selection panel, maze mode" caption="Robot panel — sensor range is what actually differentiates these two in a maze." />
      </SubSection>

      <SubSection id="maze-map" title="Map">
        <p>Five grid mazes (12×12 or 16×16 cells), each built to exercise a specific case:</p>
        <Table
          headers={['Map', 'Description']}
          rows={[
            ['First Steps', 'Sparse walls, wall-follower solves easily.'],
            ['Spiral', 'Single long spiral path to center.'],
            ['Island', 'A perimeter ring with one interior doorway — hand-on-wall following circles it forever; flood fill\'s global knowledge finds the doorway.'],
            ['Classic 16', 'Micromouse-style, goal at the center 2×2.'],
            ['Dense Grid', 'Many junctions and dead ends.'],
          ]}
        />
        <p>
          Mazes are generated as a grid of per-cell wall booleans (N/E/S/W), either from a randomized perfect-maze
          generator or, for "Island", constructed directly: a closed ring plus a 6×6 sub-maze reachable through
          exactly one doorway. Goals sit on the far side of the map from start wherever the spec doesn't pin an
          exact location.
        </p>
        <div className="flex flex-wrap gap-4">
          <Shot src="/VectorTrack/screenshots/docs/maze-map-list.jpg" alt="Maze map list" caption="The five mazes, with wall-density thumbnails." />
          <Shot src="/VectorTrack/screenshots/docs/maze-map-canvas.jpg" alt="2D maze view" caption="First Steps in the 2D debug view — start (green), robot, goal (orange)." />
        </div>
      </SubSection>

      <SubSection id="maze-utility" title="Utility">
        <p>
          <strong className="text-neutral-100">Toolbar</strong> — the same transport controls, speed multiplier,
          and 2D/3D/camera-preset toggles as line-follower mode; in 3D the maze renders as extruded walls on a
          floor grid rather than a track plane.
        </p>
        <Shot src="/VectorTrack/screenshots/docs/maze-toolbar.jpg" alt="Playback toolbar, maze mode" caption="Same playback bar, maze mode — 3D view with the Isometric camera." />
        <p>
          <strong className="text-neutral-100">Telemetry</strong> — sim time, wheel speeds, front/left/right sensor
          distances, current cell, cells visited, and a human-readable algorithm phase. Flood fill's phase reads
          "Exploring" → "Returning to start" → "Running shortest path", with an inline note during the return/run
          phases — without it, deliberately backtracking to start after touching the goal once reads as a bug
          instead of the designed behavior.
        </p>
        <Shot src="/VectorTrack/screenshots/docs/maze-telemetry.jpg" alt="Telemetry panel, maze mode" caption="Telemetry strip: rangefinder distances, current cell, visited count, phase." />
      </SubSection>
    </>
  );
}
