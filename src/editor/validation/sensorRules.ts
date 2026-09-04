/**
 * Static sensor-layout validation (internal-docs/Algorithms.md §2.3, SP00x). Pure functions over a
 * `SensorPlacement[]`, mirroring `lineRules.ts`'s shape so the editor's live-check debounce and any
 * future headless validation worker can reuse it identically.
 */
import type { SensorPlacement } from '../../sim/sensors/placement';

export type SensorIssueSeverity = 'error' | 'warning' | 'info';

export interface SensorValidationIssue {
  code: string;
  severity: SensorIssueSeverity;
  message: string;
  sensorIds?: string[];
}

export interface SensorValidationInput {
  mode: 'line' | 'maze';
  sensors: SensorPlacement[];
  trackWidthMm: number; // line mode only — used by SP003/SP004
  chassisWidthMm: number;
  wheelBase: number;
}

// A blind gap between two adjacent reflectance sensors wide enough for the line to fall through
// unread — rendered directly on the live preview per §2.2/§2.3's "not just described" requirement.
export interface BlindGap {
  aId: string;
  bId: string;
  midLateralMm: number;
  gapMm: number;
}

const SAME_POSITION_TOLERANCE_MM = 1;
const CROSSTALK_SPACING_MM = 6;

function reflectanceLeftToRight(sensors: SensorPlacement[]): SensorPlacement[] {
  return sensors.filter((s) => s.type === 'reflectance').sort((a, b) => a.lateralMm - b.lateralMm);
}

/** Adjacent-reflectance-sensor gaps wider than the line width — the line can fall entirely between two sensors and read as lost (SP003). */
export function findBlindGaps(sensors: SensorPlacement[], trackWidthMm: number): BlindGap[] {
  const row = reflectanceLeftToRight(sensors);
  const gaps: BlindGap[] = [];
  for (let i = 0; i < row.length - 1; i++) {
    const a = row[i];
    const b = row[i + 1];
    const gapMm = b.lateralMm - a.lateralMm;
    if (gapMm > trackWidthMm) {
      gaps.push({ aId: a.id, bId: b.id, midLateralMm: (a.lateralMm + b.lateralMm) / 2, gapMm });
    }
  }
  return gaps;
}

/** A sensor's body-frame footprint bound, matching how `Canvas2D.tsx` draws the chassis body (radius `wheelBase*0.55`, nose at `*1.8`) with headroom for a forward-mounted sensor arm (SP005). */
function isInsideChassisFootprint(s: SensorPlacement, chassisWidthMm: number, wheelBase: number): boolean {
  const halfWidth = chassisWidthMm / 2;
  const rearBoundMm = -wheelBase * 0.75;
  const frontBoundMm = wheelBase * 1.5;
  return Math.abs(s.lateralMm) <= halfWidth && s.forwardMm >= rearBoundMm && s.forwardMm <= frontBoundMm;
}

export function validateSensorLayout(input: SensorValidationInput): SensorValidationIssue[] {
  const { mode, sensors, trackWidthMm, chassisWidthMm, wheelBase } = input;
  const issues: SensorValidationIssue[] = [];

  const requiredType = mode === 'line' ? 'reflectance' : 'rangefinder';
  const relevant = sensors.filter((s) => s.type === requiredType);
  if (relevant.length === 0) {
    issues.push({
      code: 'SP001',
      severity: 'error',
      message: mode === 'line' ? 'No reflectance sensors — a line-follower needs at least one.' : 'No rangefinders — a maze-solver needs at least one.',
    });
    return issues;
  }

  for (let i = 0; i < sensors.length; i++) {
    for (let j = i + 1; j < sensors.length; j++) {
      const a = sensors[i];
      const b = sensors[j];
      const distMm = Math.hypot(a.forwardMm - b.forwardMm, a.lateralMm - b.lateralMm);
      if (distMm < SAME_POSITION_TOLERANCE_MM) {
        issues.push({
          code: 'SP002',
          severity: 'error',
          message: `Sensors "${a.id}" and "${b.id}" occupy the same position (within ${SAME_POSITION_TOLERANCE_MM}mm).`,
          sensorIds: [a.id, b.id],
        });
      }
    }
  }

  if (mode === 'line') {
    const row = reflectanceLeftToRight(sensors);

    const blindGaps = findBlindGaps(sensors, trackWidthMm);
    for (const gap of blindGaps) {
      issues.push({
        code: 'SP003',
        severity: 'warning',
        message: `Sensors "${gap.aId}" and "${gap.bId}" are ${gap.gapMm.toFixed(0)}mm apart — wider than the ${trackWidthMm}mm line, so it can fall between them unread.`,
        sensorIds: [gap.aId, gap.bId],
      });
    }

    if (row.length >= 2) {
      const spanMm = row[row.length - 1].lateralMm - row[0].lateralMm;
      if (spanMm < trackWidthMm) {
        issues.push({
          code: 'SP004',
          severity: 'warning',
          message: `The sensor array spans only ${spanMm.toFixed(0)}mm, narrower than the ${trackWidthMm}mm line — every sensor saturates together with no error signal to steer on.`,
        });
      }
    }

    for (let i = 0; i < row.length - 1; i++) {
      const spacingMm = row[i + 1].lateralMm - row[i].lateralMm;
      if (spacingMm < CROSSTALK_SPACING_MM) {
        issues.push({
          code: 'SP006',
          severity: 'warning',
          message: `Sensors "${row[i].id}" and "${row[i + 1].id}" are only ${spacingMm.toFixed(1)}mm apart — under ${CROSSTALK_SPACING_MM}mm, real IR sensors would crosstalk.`,
          sensorIds: [row[i].id, row[i + 1].id],
        });
      }
    }

    if (row.length > 0 && row.every((s) => Math.abs(s.forwardMm) < SAME_POSITION_TOLERANCE_MM)) {
      issues.push({
        code: 'SP007',
        severity: 'info',
        message: 'Forward offset is 0 — sensors sit on the wheel axis with no lead time, which will oscillate.',
      });
    }
  }

  for (const s of sensors) {
    if (!isInsideChassisFootprint(s, chassisWidthMm, wheelBase)) {
      issues.push({
        code: 'SP005',
        severity: 'warning',
        message: `Sensor "${s.id}" sits outside the chassis footprint — legal, but fragile.`,
        sensorIds: [s.id],
      });
    }
  }

  return issues;
}
