import { describe, expect, it } from 'vitest';
import type { Transform } from '../../render2d/transform';
import { toScreen, toWorld } from '../../render2d/transform';
import { MAX_ZOOM, MIN_ZOOM, effectiveTransform, initialCanvasView, panBy, resetCanvasView, zoomTowardPoint } from './canvasView';

const fit: Transform = { scale: 2, offsetX: 10, offsetY: 20 };

describe('effectiveTransform', () => {
  it('at the initial view, matches the fit transform exactly', () => {
    const view = initialCanvasView();
    expect(effectiveTransform(fit, view)).toEqual(fit);
  });
});

describe('zoomTowardPoint', () => {
  it('keeps the world point under the cursor fixed on screen after zooming in', () => {
    const view = initialCanvasView();
    const [sx, sy] = [123, 77];
    const [wx, wy] = toWorld(effectiveTransform(fit, view), sx, sy);

    const zoomed = zoomTowardPoint(fit, view, sx, sy, 1.5);
    const [wx2, wy2] = toWorld(effectiveTransform(fit, zoomed), sx, sy);
    expect(wx2).toBeCloseTo(wx, 6);
    expect(wy2).toBeCloseTo(wy, 6);

    const [sx2, sy2] = toScreen(effectiveTransform(fit, zoomed), wx, wy);
    expect(sx2).toBeCloseTo(sx, 6);
    expect(sy2).toBeCloseTo(sy, 6);
  });

  it('increases zoom by the given factor', () => {
    const view = initialCanvasView();
    const zoomed = zoomTowardPoint(fit, view, 0, 0, 2);
    expect(zoomed.zoom).toBeCloseTo(2, 6);
  });

  it('clamps zoom to MAX_ZOOM', () => {
    let view = initialCanvasView();
    for (let i = 0; i < 20; i++) view = zoomTowardPoint(fit, view, 50, 50, 2);
    expect(view.zoom).toBe(MAX_ZOOM);
  });

  it('clamps zoom to MIN_ZOOM (never zooms out past the fit transform)', () => {
    let view = initialCanvasView();
    view = zoomTowardPoint(fit, view, 50, 50, 3);
    for (let i = 0; i < 20; i++) view = zoomTowardPoint(fit, view, 50, 50, 0.5);
    expect(view.zoom).toBe(MIN_ZOOM);
  });

  it('returns the same view reference when already clamped and zooming further in that direction', () => {
    let view = initialCanvasView();
    view = zoomTowardPoint(fit, view, 50, 50, 0.1);
    expect(view.zoom).toBe(MIN_ZOOM);
    const again = zoomTowardPoint(fit, view, 50, 50, 0.1);
    expect(again).toBe(view);
  });
});

describe('panBy', () => {
  it('adds the screen-space delta to panX/panY without touching zoom', () => {
    const view = { zoom: 2, panX: 5, panY: -3 };
    const panned = panBy(view, 10, 20);
    expect(panned).toEqual({ zoom: 2, panX: 15, panY: 17 });
  });
});

describe('resetCanvasView', () => {
  it('returns the initial view', () => {
    expect(resetCanvasView()).toEqual(initialCanvasView());
  });
});
