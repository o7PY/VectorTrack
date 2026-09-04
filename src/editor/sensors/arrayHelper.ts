/**
 * "N sensors, span S mm, forward offset F mm" generator — internal-docs/Algorithms.md §2.2, the
 * sensor editor's array helper, "expected to be how ~90% of layouts get made."
 */
import type { SensorLayoutPreset } from '../../robots/layouts';
import type { SensorPlacement } from '../../sim/sensors/placement';
import { DEFAULT_SPOT_RADIUS_MM, orderSensorsLeftToRight } from '../../sim/sensors/placement';

/**
 * An evenly spaced row of reflectance sensors, `spanMm` between the outermost two. A single sensor
 * sits on the centerline (span is undefined for N=1).
 */
export function generateSensorArray(count: number, spanMm: number, forwardMm: number, spotRadiusMm: number = DEFAULT_SPOT_RADIUS_MM): SensorPlacement[] {
  const mid = (count - 1) / 2;
  const spacing = count > 1 ? spanMm / (count - 1) : 0;
  const sensors: SensorPlacement[] = [];
  for (let i = 0; i < count; i++) {
    sensors.push({
      id: `s${i}`,
      type: 'reflectance',
      forwardMm,
      lateralMm: (i - mid) * spacing,
      headingDeg: 0,
      spotRadiusMm,
    });
  }
  return orderSensorsLeftToRight(sensors);
}

/** Alternates forward offset by `staggerMm` between adjacent sensors — trades lateral resolution for two effective sample rows. */
export function generateStaggeredSensorArray(
  count: number,
  spanMm: number,
  forwardMm: number,
  staggerMm: number,
  spotRadiusMm: number = DEFAULT_SPOT_RADIUS_MM,
): SensorPlacement[] {
  return generateSensorArray(count, spanMm, forwardMm, spotRadiusMm).map((s, i) => ({
    ...s,
    forwardMm: forwardMm + (i % 2 === 0 ? -staggerMm / 2 : staggerMm / 2),
  }));
}

// Array-helper presets (Algorithms.md §2.2's "3-sensor, 5-sensor, 8-sensor arrays, a staggered
// two-row array" list). Not tied to any specific robot's chassis — a starting point for a custom
// layout, editable afterward like anything else.
export const SENSOR_ARRAY_PRESETS: SensorLayoutPreset[] = [
  { id: 'preset-3', name: '3-sensor array', mode: 'line', sensors: generateSensorArray(3, 50, 60) },
  { id: 'preset-5', name: '5-sensor array', mode: 'line', sensors: generateSensorArray(5, 60, 55) },
  { id: 'preset-8', name: '8-sensor array', mode: 'line', sensors: generateSensorArray(8, 70, 50) },
  { id: 'preset-staggered', name: 'Staggered two-row', mode: 'line', sensors: generateStaggeredSensorArray(5, 60, 55, 12) },
];
