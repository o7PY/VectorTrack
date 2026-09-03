import * as THREE from 'three';
import type { LineBitmap } from '../sim/sensors/reflectance';

/** White floor, black line — the same convention a real reflectance sensor sees. */
export function buildLineTexture(bitmap: LineBitmap): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(bitmap.width, bitmap.height);
  for (let i = 0; i < bitmap.width * bitmap.height; i++) {
    const v = 255 - bitmap.data[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
