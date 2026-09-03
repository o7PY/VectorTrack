/** Shared world-mm -> canvas-pixel transform, used by the simulator's 2D canvas and the map editor canvases so the two don't drift (v0.2.0 §9). */
export interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function computeTransform(canvasW: number, canvasH: number, worldW: number, worldH: number, pad = 24): Transform {
  const scale = Math.min((canvasW - pad * 2) / worldW, (canvasH - pad * 2) / worldH);
  const offsetX = (canvasW - worldW * scale) / 2;
  const offsetY = (canvasH - worldH * scale) / 2;
  return { scale, offsetX, offsetY };
}

export function toScreen(t: Transform, x: number, y: number): [number, number] {
  return [t.offsetX + x * t.scale, t.offsetY + y * t.scale];
}

export function toWorld(t: Transform, sx: number, sy: number): [number, number] {
  return [(sx - t.offsetX) / t.scale, (sy - t.offsetY) / t.scale];
}
