import { describe, expect, it } from 'vitest';
import { paintEllipseOutline, paintLine, stampBrush } from '../line/paint';
import type { PaintGridBits } from '../line/paint';
import { validateLineStatic } from './lineRules';
import type { LineValidationInput } from './lineRules';

const COLS = 26;
const ROWS = 18;
const CELL_MM = 20;

function emptyGrid(): PaintGridBits {
  return { cols: COLS, rows: ROWS, bits: new Uint8Array(COLS * ROWS) };
}

function ovalTrackGrid(): PaintGridBits {
  const grid = emptyGrid();
  paintEllipseOutline(grid, 3, 3, ROWS - 4, COLS - 4, 2, 1);
  return grid;
}

function baseInput(grid: PaintGridBits, start: LineValidationInput['start']): LineValidationInput {
  return { cols: grid.cols, rows: grid.rows, cellSizeMm: CELL_MM, bits: grid.bits, start, maxGapMm: 80 };
}

describe('validateLineStatic', () => {
  it('LF001: an empty canvas is flagged and short-circuits (no other codes)', () => {
    const issues = validateLineStatic(baseInput(emptyGrid(), null));
    expect(issues.map((i) => i.code)).toEqual(['LF001']);
    expect(issues[0].severity).toBe('error');
  });

  it('LF002: no start marker placed', () => {
    const grid = ovalTrackGrid();
    const issues = validateLineStatic(baseInput(grid, null));
    expect(issues.find((i) => i.code === 'LF002')?.severity).toBe('error');
  });

  it('LF002: start marker placed off the painted track', () => {
    const grid = ovalTrackGrid();
    // Dead center of the oval — clearly inside the ring, not on it.
    const issues = validateLineStatic(baseInput(grid, { xMm: (COLS / 2) * CELL_MM, yMm: (ROWS / 2) * CELL_MM, headingDeg: 0 }));
    expect(issues.find((i) => i.code === 'LF002')?.severity).toBe('error');
  });

  it('a start marker on the track produces no LF002', () => {
    const grid = ovalTrackGrid();
    // bottom-center of the oval is on the ring
    const start = { xMm: (COLS / 2) * CELL_MM, yMm: (ROWS - 4) * CELL_MM, headingDeg: 0 };
    const issues = validateLineStatic(baseInput(grid, start));
    expect(issues.find((i) => i.code === 'LF002')).toBeUndefined();
  });

  it('LF003: two disconnected blobs farther apart than maxGapMm block save', () => {
    const grid = emptyGrid();
    stampBrush(grid, 2, 2, 2, 1);
    stampBrush(grid, 15, 22, 2, 1);
    const issues = validateLineStatic(baseInput(grid, null));
    expect(issues.find((i) => i.code === 'LF003')?.severity).toBe('error');
  });

  it('LF003 does not fire, and LF004 warns, when two pieces are within maxGapMm', () => {
    const grid = emptyGrid();
    paintLine(grid, 5, 2, 5, 8, 1, 1);
    paintLine(grid, 5, 11, 5, 18, 1, 1); // ~2 cells = 40mm gap, under the 80mm default
    const issues = validateLineStatic(baseInput(grid, null));
    expect(issues.find((i) => i.code === 'LF003')).toBeUndefined();
    expect(issues.find((i) => i.code === 'LF004')?.severity).toBe('warning');
  });

  it('a fully connected oval loop has no LF004 gap warning', () => {
    const grid = ovalTrackGrid();
    const issues = validateLineStatic(baseInput(grid, null));
    expect(issues.find((i) => i.code === 'LF004')).toBeUndefined();
  });

  it('LF005: a short track is flagged (warning)', () => {
    const grid = emptyGrid();
    stampBrush(grid, 5, 5, 2, 1);
    const issues = validateLineStatic(baseInput(grid, null));
    expect(issues.find((i) => i.code === 'LF005')?.severity).toBe('warning');
  });

  it('a track with a long enough lap has no LF005 short-lap warning', () => {
    const grid = emptyGrid();
    paintLine(grid, 1, 2, 1, 24, 1, 1);
    paintLine(grid, 16, 2, 16, 24, 1, 1);
    paintLine(grid, 1, 2, 16, 2, 1, 1);
    paintLine(grid, 1, 24, 16, 24, 1, 1);
    const issues = validateLineStatic(baseInput(grid, null));
    expect(issues.find((i) => i.code === 'LF005')).toBeUndefined();
  });

  it('only LF001/LF002/LF003 are error severity — everything else is a warning', () => {
    const grid = emptyGrid();
    stampBrush(grid, 2, 2, 2, 1);
    stampBrush(grid, 15, 22, 2, 1);
    const issues = validateLineStatic(baseInput(grid, null));
    for (const issue of issues) {
      if (['LF001', 'LF002', 'LF003'].includes(issue.code)) expect(issue.severity).toBe('error');
      else expect(issue.severity).toBe('warning');
    }
  });
});
