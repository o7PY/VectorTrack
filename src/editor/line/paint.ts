/**
 * Pure paint-grid logic for the line editor (v0.2.0 §14.3): brush stamping,
 * shape rasterization (line/rect/ellipse), and the connectivity analysis
 * shared by the live canvas and LF00x validation. No DOM/canvas — kept
 * testable and reusable by the (future) headless validation worker.
 */

export interface PaintGridBits {
  cols: number;
  rows: number;
  bits: Uint8Array; // row-major, 0/1
}

export function createEmptyPaintBits(cols: number, rows: number): Uint8Array {
  return new Uint8Array(cols * rows);
}

function inBounds(grid: PaintGridBits, r: number, c: number): boolean {
  return r >= 0 && r < grid.rows && c >= 0 && c < grid.cols;
}

/** Paints (or erases) a square/centered brush stamp at (r,c). width 1 = single cell, 2 = 2x2 block toward +row/+col, 3 = 3x3 centered. */
export function stampBrush(grid: PaintGridBits, r: number, c: number, widthCells: number, value: 0 | 1): void {
  const half = Math.floor((widthCells - 1) / 2);
  for (let dr = -half; dr < widthCells - half; dr++) {
    for (let dc = -half; dc < widthCells - half; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (inBounds(grid, rr, cc)) grid.bits[rr * grid.cols + cc] = value;
    }
  }
}

/**
 * Bresenham line between two cells, stamping the brush at every step (one
 * gesture = one call). When a step would move diagonally, an extra bridging
 * cell is stamped so the painted path stays 4-connected — plain Bresenham
 * only guarantees 8-connectivity, which would make connectedComponents() see
 * a single diagonal stroke as several disconnected pieces.
 */
export function paintLine(grid: PaintGridBits, r0: number, c0: number, r1: number, c1: number, widthCells: number, value: 0 | 1): void {
  let x0 = c0;
  let y0 = r0;
  const dx = Math.abs(c1 - c0);
  const dy = -Math.abs(r1 - r0);
  const sx = c0 < c1 ? 1 : -1;
  const sy = r0 < r1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    stampBrush(grid, y0, x0, widthCells, value);
    if (x0 === c1 && y0 === r1) break;
    const e2 = 2 * err;
    const prevY = y0;
    let movedX = false;
    let movedY = false;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
      movedX = true;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
      movedY = true;
    }
    if (movedX && movedY) stampBrush(grid, prevY, x0, widthCells, value);
  }
}

/** Outline-only (unfilled) rectangle between two corner cells. */
export function paintRectOutline(grid: PaintGridBits, r0: number, c0: number, r1: number, c1: number, widthCells: number, value: 0 | 1): void {
  const top = Math.min(r0, r1);
  const bottom = Math.max(r0, r1);
  const left = Math.min(c0, c1);
  const right = Math.max(c0, c1);
  paintLine(grid, top, left, top, right, widthCells, value);
  paintLine(grid, bottom, left, bottom, right, widthCells, value);
  paintLine(grid, top, left, bottom, left, widthCells, value);
  paintLine(grid, top, right, bottom, right, widthCells, value);
}

/** Outline-only (unfilled) ellipse inscribed in the bounding box of two corner cells. */
export function paintEllipseOutline(grid: PaintGridBits, r0: number, c0: number, r1: number, c1: number, widthCells: number, value: 0 | 1): void {
  const cx = (r0 + r1) / 2;
  const cy = (c0 + c1) / 2;
  const a = Math.max(0.5, Math.abs(r1 - r0) / 2);
  const b = Math.max(0.5, Math.abs(c1 - c0) / 2);
  const steps = Math.max(24, Math.round(Math.PI * (a + b)));
  let prevR = Math.round(cx + a * Math.cos(0));
  let prevC = Math.round(cy + b * Math.sin(0));
  for (let i = 1; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const r = Math.round(cx + a * Math.cos(theta));
    const c = Math.round(cy + b * Math.sin(theta));
    paintLine(grid, prevR, prevC, r, c, widthCells, value);
    prevR = r;
    prevC = c;
  }
}

export interface Component {
  id: number;
  cells: number[]; // flat indices
}

/** 4-connected flood fill over painted cells. Returns a componentId per flat index (-1 if unpainted) and the list of components. */
export function connectedComponents(grid: PaintGridBits): { componentOf: Int32Array; components: Component[] } {
  const { cols, rows, bits } = grid;
  const componentOf = new Int32Array(cols * rows).fill(-1);
  const components: Component[] = [];
  for (let start = 0; start < bits.length; start++) {
    if (bits[start] === 0 || componentOf[start] !== -1) continue;
    const id = components.length;
    const cells: number[] = [];
    const queue = [start];
    componentOf[start] = id;
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      cells.push(cur);
      const r = Math.floor(cur / cols);
      const c = cur % cols;
      const neighbors = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ];
      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const ni = nr * cols + nc;
        if (bits[ni] === 0 || componentOf[ni] !== -1) continue;
        componentOf[ni] = id;
        queue.push(ni);
      }
    }
    components.push({ id, cells });
  }
  return { componentOf, components };
}

/** Cells that have at least one 4-neighbor outside the painted set (or grid edge) — the only cells that can be the closest point to another component. */
export function boundaryCells(grid: PaintGridBits, cells: number[]): number[] {
  const { cols, rows, bits } = grid;
  const out: number[] = [];
  for (const idx of cells) {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const neighbors = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ];
    let isBoundary = false;
    for (const [nr, nc] of neighbors) {
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || bits[nr * cols + nc] === 0) {
        isBoundary = true;
        break;
      }
    }
    if (isBoundary) out.push(idx);
  }
  return out;
}

export function cellCenterMm(cols: number, cellSizeMm: number, idx: number): { x: number; y: number } {
  const r = Math.floor(idx / cols);
  const c = idx % cols;
  return { x: (c + 0.5) * cellSizeMm, y: (r + 0.5) * cellSizeMm };
}

/** Minimum center-to-center distance (mm) between two sets of boundary cells, minus one cell size to approximate edge-to-edge rather than center-to-center. */
export function nearestDistanceMm(cols: number, cellSizeMm: number, a: number[], b: number[]): number {
  let best = Infinity;
  for (const ia of a) {
    const pa = cellCenterMm(cols, cellSizeMm, ia);
    for (const ib of b) {
      const pb = cellCenterMm(cols, cellSizeMm, ib);
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (d < best) best = d;
    }
  }
  return Math.max(0, best - cellSizeMm);
}

/** Bounding-box perimeter of all painted cells, as a cheap proxy for centerline lap length (real skeleton path length is out of scope — see SPEC "Known simplifications"). */
export function estimateLapLengthMm(cols: number, rows: number, cellSizeMm: number, bits: Uint8Array): number {
  let minR = rows;
  let maxR = -1;
  let minC = cols;
  let maxC = -1;
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i]) continue;
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  if (maxR < 0) return 0;
  const widthMm = (maxC - minC + 1) * cellSizeMm;
  const heightMm = (maxR - minR + 1) * cellSizeMm;
  return 2 * (widthMm + heightMm);
}

/** Simple union-find, used to merge raw components into bridgeable groups (gap <= maxGapMm). */
export class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
  groupCount(): number {
    return new Set(this.parent.map((_, i) => this.find(i))).size;
  }
}
