import type { Transform } from '../../render2d/transform';
import { toWorld } from '../../render2d/transform';

/**
 * A user zoom/pan layered on top of a container's fit-to-content `Transform`
 * (computeTransform.ts), so resizing the container (which recomputes the fit
 * transform) doesn't need to know anything about zoom/pan state, and vice
 * versa. Pure and DOM-free so the zoom-toward-cursor math is unit-testable
 * without a canvas.
 */
export interface CanvasView {
  /** Multiplier on top of the fit-to-container scale. 1 = fit, clamped to [MIN_ZOOM, MAX_ZOOM]. */
  zoom: number;
  /** Additional screen-space pixel offset, on top of the fit transform's own offset. */
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

export function initialCanvasView(): CanvasView {
  return { zoom: 1, panX: 0, panY: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Composes the container's fit transform with the current zoom/pan into one screen transform. */
export function effectiveTransform(fit: Transform, view: CanvasView): Transform {
  return {
    scale: fit.scale * view.zoom,
    offsetX: fit.offsetX * view.zoom + view.panX,
    offsetY: fit.offsetY * view.zoom + view.panY,
  };
}

/** Zooms by `factor` (e.g. 1.1 to zoom in, 1/1.1 to zoom out) while keeping the world point under (sx, sy) fixed on screen. */
export function zoomTowardPoint(fit: Transform, view: CanvasView, sx: number, sy: number, factor: number): CanvasView {
  const newZoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  if (newZoom === view.zoom) return view;
  const [wx, wy] = toWorld(effectiveTransform(fit, view), sx, sy);
  return {
    zoom: newZoom,
    panX: sx - fit.offsetX * newZoom - wx * fit.scale * newZoom,
    panY: sy - fit.offsetY * newZoom - wy * fit.scale * newZoom,
  };
}

export function panBy(view: CanvasView, dxScreen: number, dyScreen: number): CanvasView {
  return { ...view, panX: view.panX + dxScreen, panY: view.panY + dyScreen };
}

export function resetCanvasView(): CanvasView {
  return initialCanvasView();
}
