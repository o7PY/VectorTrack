/**
 * Static line-track validation (MapMaker.md, LF00x). Pure functions over an
 * already-decoded paint grid, so they run identically in the editor's
 * debounced live check and (eventually) inside a headless validation worker.
 *
 * Kept deliberately small: only rules that flag a genuinely broken or
 * fragile track are here. Earlier drafts also had a raster "junction/branch"
 * heuristic and a "two nearby-but-unconnected runs" heuristic — both were
 * pattern-matching on the painted grid rather than checking a real
 * property, produced warnings a casual map author couldn't act on
 * confidently, and were dropped rather than kept as noise. A canvas-edge
 * margin warning was dropped too, now that the canvas is resizable and
 * zoomable — see MapMaker.md "Known simplifications".
 */
import { boundaryCells, connectedComponents, estimateLapLengthMm, nearestDistanceMm, UnionFind } from '../line/paint';
import type { PaintGridBits } from '../line/paint';

export type LineIssueSeverity = 'error' | 'warning' | 'info';

export interface LineValidationIssue {
  code: string;
  severity: LineIssueSeverity;
  message: string;
  cells?: { row: number; col: number }[];
}

export interface LineValidationInput {
  cols: number;
  rows: number;
  cellSizeMm: number;
  bits: Uint8Array;
  start: { xMm: number; yMm: number; headingDeg: number } | null;
  maxGapMm: number;
}

function toCells(cols: number, indices: number[]): { row: number; col: number }[] {
  return indices.map((i) => ({ row: Math.floor(i / cols), col: i % cols }));
}

export function validateLineStatic(input: LineValidationInput): LineValidationIssue[] {
  const { cols, rows, cellSizeMm, bits, start, maxGapMm } = input;
  const issues: LineValidationIssue[] = [];
  const grid: PaintGridBits = { cols, rows, bits };

  const paintedCount = bits.reduce((n, b) => n + b, 0);
  if (paintedCount === 0) {
    issues.push({ code: 'LF001', severity: 'error', message: 'The canvas is empty — paint a track before saving.' });
    return issues;
  }

  if (!start) {
    issues.push({ code: 'LF002', severity: 'error', message: 'No start marker has been placed.' });
  } else {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(start.xMm / cellSizeMm)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(start.yMm / cellSizeMm)));
    if (bits[r * cols + c] === 0) {
      issues.push({ code: 'LF002', severity: 'error', message: 'The start marker is not on the painted track.' });
    }
  }

  const { components } = connectedComponents(grid);
  const boundaries = components.map((comp) => boundaryCells(grid, comp.cells));

  if (components.length > 1) {
    const uf = new UnionFind(components.length);
    const gaps: { a: number; b: number; distMm: number }[] = [];
    for (let i = 0; i < components.length; i++) {
      for (let j = i + 1; j < components.length; j++) {
        const distMm = nearestDistanceMm(cols, cellSizeMm, boundaries[i], boundaries[j]);
        gaps.push({ a: i, b: j, distMm });
        if (distMm <= maxGapMm) uf.union(i, j);
      }
    }

    if (uf.groupCount() > 1) {
      const unresolved = gaps.filter((g) => uf.find(g.a) !== uf.find(g.b));
      const worst = unresolved.reduce((min, g) => (g.distMm < min.distMm ? g : min), unresolved[0]);
      issues.push({
        code: 'LF003',
        severity: 'error',
        message: `The track is not a single connected loop — two pieces are ${worst.distMm.toFixed(0)}mm apart (gaps wider than ${maxGapMm}mm won't bridge).`,
        cells: toCells(cols, [components[worst.a].cells[0], components[worst.b].cells[0]]),
      });
    }

    // Downgraded from 'error': if the union-find above already merged every
    // piece, the track is still one loop — this is just a heads-up that part
    // of it is a genuine gap (e.g. an intentional dashed section), not a
    // reason to block Save.
    const bridged = gaps.filter((g) => g.distMm > 0 && g.distMm <= maxGapMm);
    if (bridged.length > 0) {
      const worstBridged = bridged.reduce((max, g) => (g.distMm > max.distMm ? g : max), bridged[0]);
      issues.push({
        code: 'LF004',
        severity: 'warning',
        message: `The track has a ${worstBridged.distMm.toFixed(0)}mm gap (within the ${maxGapMm}mm allowed) — check it's intentional, e.g. a dashed section.`,
        cells: toCells(cols, [components[worstBridged.a].cells[0], components[worstBridged.b].cells[0]]),
      });
    }
  }

  const lapLengthMm = estimateLapLengthMm(cols, rows, cellSizeMm, bits);
  if (lapLengthMm < 1500) {
    issues.push({
      code: 'LF005',
      severity: 'warning',
      message: `Estimated lap length (~${Math.round(lapLengthMm)}mm) is short — under 1500mm the robot may not have time to react.`,
    });
  }

  return issues;
}
