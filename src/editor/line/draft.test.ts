import { describe, expect, it } from 'vitest';
import { validateLineStatic } from '../validation/lineRules';
import { createDefaultLineDraft, customMapToLineDraft, lineDraftToCustomMap } from './draft';

describe('line draft <-> CustomLineMap round trip', () => {
  it('round-trips a default draft byte-for-byte through the storage encoding', () => {
    const draft = createDefaultLineDraft('custom-1');
    const stored = lineDraftToCustomMap(draft);
    const restored = customMapToLineDraft(stored);

    expect(restored.cols).toBe(draft.cols);
    expect(restored.rows).toBe(draft.rows);
    expect(restored.cellSizeMm).toBe(draft.cellSizeMm);
    expect(restored.start).toEqual(draft.start);
    expect(Array.from(restored.bits)).toEqual(Array.from(draft.bits));
  });

  it('the storage envelope round-trips through JSON (as it would via localStorage)', () => {
    const draft = createDefaultLineDraft('custom-2');
    const stored = lineDraftToCustomMap(draft);
    const json = JSON.parse(JSON.stringify(stored));
    const restored = customMapToLineDraft(json);
    expect(Array.from(restored.bits)).toEqual(Array.from(draft.bits));
  });

  it('a brand-new default draft has no blocking (error) validation issues, so Save works immediately', () => {
    const draft = createDefaultLineDraft('custom-fresh');
    const issues = validateLineStatic({
      cols: draft.cols,
      rows: draft.rows,
      cellSizeMm: draft.cellSizeMm,
      bits: draft.bits,
      start: draft.start,
      maxGapMm: 80,
    });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});
