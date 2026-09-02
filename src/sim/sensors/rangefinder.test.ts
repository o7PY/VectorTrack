import { describe, expect, it } from 'vitest';
import { distanceToNearestWall, raycast, sampleMazeSensors } from './rangefinder';
import type { WallSegment } from './rangefinder';

describe('raycast', () => {
  it('hits a wall directly ahead at the expected distance', () => {
    const segments: WallSegment[] = [{ x1: 100, y1: -50, x2: 100, y2: 50 }];
    const dist = raycast(0, 0, 0, 1000, segments);
    expect(dist).toBeCloseTo(100, 6);
  });

  it('returns maxRange when nothing is in the way', () => {
    const segments: WallSegment[] = [{ x1: -100, y1: -50, x2: -100, y2: 50 }]; // behind the ray
    const dist = raycast(0, 0, 0, 250, segments);
    expect(dist).toBe(250);
  });

  it('ignores segments behind the ray origin', () => {
    const segments: WallSegment[] = [{ x1: -10, y1: -50, x2: -10, y2: 50 }];
    const dist = raycast(0, 0, 0, 250, segments);
    expect(dist).toBe(250);
  });

  it('picks the nearest of multiple intersecting segments', () => {
    const segments: WallSegment[] = [
      { x1: 200, y1: -50, x2: 200, y2: 50 },
      { x1: 80, y1: -50, x2: 80, y2: 50 },
    ];
    const dist = raycast(0, 0, 0, 1000, segments);
    expect(dist).toBeCloseTo(80, 6);
  });

  it('handles a diagonal ray', () => {
    const segments: WallSegment[] = [{ x1: 0, y1: 100, x2: 200, y2: 100 }];
    const dist = raycast(0, 0, Math.PI / 4, 1000, segments);
    expect(dist).toBeCloseTo(100 * Math.SQRT2, 4);
  });
});

describe('sampleMazeSensors', () => {
  it('reports front/left/right relative to heading', () => {
    // A box: walls at x=100 (front, facing +x), y=-100 (right, since right = theta - 90deg), y=100 (left)
    const segments: WallSegment[] = [
      { x1: 100, y1: -200, x2: 100, y2: 200 }, // front wall
      { x1: -200, y1: 100, x2: 200, y2: 100 }, // "north" wall -> left of a robot facing +x
      { x1: -200, y1: -100, x2: 200, y2: -100 }, // "south" wall -> right of a robot facing +x
    ];
    const reading = sampleMazeSensors(0, 0, 0, 500, segments);
    expect(reading.front).toBeCloseTo(100, 6);
    expect(reading.left).toBeCloseTo(100, 6);
    expect(reading.right).toBeCloseTo(100, 6);
  });
});

describe('distanceToNearestWall', () => {
  it('measures perpendicular distance to the closest segment', () => {
    const segments: WallSegment[] = [{ x1: 0, y1: 50, x2: 100, y2: 50 }];
    expect(distanceToNearestWall(20, 0, segments)).toBeCloseTo(50, 6);
  });

  it('measures distance to the nearest endpoint when off the segment', () => {
    const segments: WallSegment[] = [{ x1: 0, y1: 0, x2: 100, y2: 0 }];
    expect(distanceToNearestWall(150, 0, segments)).toBeCloseTo(50, 6);
  });
});
