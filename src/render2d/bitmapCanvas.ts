import type { LineBitmap } from '../sim/sensors/reflectance';

/** White floor, black line — rendered as a raster image since a custom track has no vector centerline. */
export function bitmapToImageBitmapCanvas(bitmap: LineBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(bitmap.width, bitmap.height);
  for (let i = 0; i < bitmap.width * bitmap.height; i++) {
    const v = 255 - bitmap.data[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
