import { describe, expect, it } from 'vitest';
import { findBlindGaps, validateSensorLayout } from './sensorRules';
import type { SensorValidationInput } from './sensorRules';
import type { SensorPlacement } from '../../sim/sensors/placement';

const CHASSIS: { chassisWidthMm: number; wheelBase: number } = { chassisWidthMm: 100, wheelBase: 90 };

function reflectanceRow(lateralMm: number[], forwardMm = 60): SensorPlacement[] {
  return lateralMm.map((lateral, i) => ({ id: `s${i}`, type: 'reflectance', forwardMm, lateralMm: lateral, headingDeg: 0, spotRadiusMm: 4 }));
}

function baseInput(sensors: SensorPlacement[], trackWidthMm = 20): SensorValidationInput {
  return { mode: 'line', sensors, trackWidthMm, ...CHASSIS };
}

describe('validateSensorLayout', () => {
  it('SP001: zero reflectance sensors in line mode is an error and short-circuits', () => {
    const issues = validateSensorLayout(baseInput([]));
    expect(issues.map((i) => i.code)).toEqual(['SP001']);
    expect(issues[0].severity).toBe('error');
  });

  it('SP001: zero rangefinders in maze mode is an error', () => {
    const issues = validateSensorLayout({ mode: 'maze', sensors: [], trackWidthMm: 0, ...CHASSIS });
    expect(issues.map((i) => i.code)).toEqual(['SP001']);
  });

  it('SP002: two sensors within 1mm of each other', () => {
    const sensors = reflectanceRow([-10, -10.5, 10]);
    const issues = validateSensorLayout(baseInput(sensors));
    const sp002 = issues.filter((i) => i.code === 'SP002');
    expect(sp002).toHaveLength(1);
    expect(sp002[0].severity).toBe('error');
    expect(sp002[0].sensorIds).toEqual(['s0', 's1']);
  });

  it('SP003: adjacent spacing wider than the line width flags a blind gap', () => {
    const sensors = reflectanceRow([-30, 0, 30]); // 30mm gaps, 20mm line
    const issues = validateSensorLayout(baseInput(sensors, 20));
    expect(issues.filter((i) => i.code === 'SP003')).toHaveLength(2);
  });

  it('SP003: no blind gap when spacing stays within the line width', () => {
    const sensors = reflectanceRow([-10, 0, 10]); // 10mm gaps, 20mm line
    const issues = validateSensorLayout(baseInput(sensors, 20));
    expect(issues.filter((i) => i.code === 'SP003')).toHaveLength(0);
  });

  it('findBlindGaps reports the midpoint and gap size directly, for canvas rendering', () => {
    const sensors = reflectanceRow([-30, 0, 30]);
    const gaps = findBlindGaps(sensors, 20);
    expect(gaps).toEqual([
      { aId: 's0', bId: 's1', midLateralMm: -15, gapMm: 30 },
      { aId: 's1', bId: 's2', midLateralMm: 15, gapMm: 30 },
    ]);
  });

  it('SP004: total span narrower than the line width', () => {
    const sensors = reflectanceRow([-5, 0, 5]); // 10mm span, 20mm line
    const issues = validateSensorLayout(baseInput(sensors, 20));
    expect(issues.some((i) => i.code === 'SP004')).toBe(true);
  });

  it('SP004: no warning when span exceeds the line width', () => {
    const sensors = reflectanceRow([-25, 0, 25]); // 50mm span, 20mm line
    const issues = validateSensorLayout(baseInput(sensors, 20));
    expect(issues.some((i) => i.code === 'SP004')).toBe(false);
  });

  it('SP005: a sensor outside the chassis footprint is flagged but non-fatal', () => {
    const sensors = reflectanceRow([-200, 0, 200]);
    const issues = validateSensorLayout(baseInput(sensors));
    const sp005 = issues.filter((i) => i.code === 'SP005');
    expect(sp005).toHaveLength(2);
    expect(sp005.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('SP006: adjacent spacing under 6mm crosstalks', () => {
    const sensors = reflectanceRow([-3, 0, 3]);
    const issues = validateSensorLayout(baseInput(sensors, 1));
    expect(issues.filter((i) => i.code === 'SP006')).toHaveLength(2);
  });

  it('SP007: zero forward offset is flagged as info, non-blocking', () => {
    const sensors = reflectanceRow([-10, 0, 10], 0);
    const issues = validateSensorLayout(baseInput(sensors, 5));
    const sp007 = issues.filter((i) => i.code === 'SP007');
    expect(sp007).toHaveLength(1);
    expect(sp007[0].severity).toBe('info');
  });

  it('SP007: does not fire when sensors have a forward offset', () => {
    const sensors = reflectanceRow([-10, 0, 10], 60);
    const issues = validateSensorLayout(baseInput(sensors, 5));
    expect(issues.some((i) => i.code === 'SP007')).toBe(false);
  });

  it('a well-formed default-shaped layout (lf-scout geometry) has no issues', () => {
    const sensors = reflectanceRow([-25, 0, 25], 60);
    const issues = validateSensorLayout(baseInput(sensors, 40));
    expect(issues).toEqual([]);
  });
});
