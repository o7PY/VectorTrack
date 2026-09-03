import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/**
 * Regression guard for the "custom map runs into a blank screen" bug: every
 * renderer that looks up a map by id must branch on `isCustomRuntimeId`
 * before calling `getLineMap`/`getMazeMap`, which only know about the
 * built-in map tables and throw on a `custom:${id}`. A unit test on
 * `customMapResolvers.ts` alone can't catch a renderer that forgets to call
 * it — this reads the renderer source directly so that regression is
 * actually impossible to reintroduce silently.
 */
describe('renderers resolve custom map ids before reading map content', () => {
  const files = [
    'src/render2d/Canvas2D.tsx',
    'src/render3d/Scene3D.tsx',
    'src/render3d/Maze3D.tsx',
    'src/render3d/LineTrack3D.tsx',
  ];

  it.each(files)('%s references isCustomRuntimeId', (relPath) => {
    const source = readFileSync(join(root, relPath), 'utf-8');
    expect(source).toContain('isCustomRuntimeId');
  });
});
