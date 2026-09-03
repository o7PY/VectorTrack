/**
 * Turns a coarse hand-painted line-editor grid into the same kind of binary
 * 1mm/px bitmap the sim's reflectance sensor expects. Pure functions only
 * (no canvas/DOM) so this runs identically on the main thread and inside the
 * headless validation Web Worker.
 *
 * Pipeline: nearest-neighbor upsample the paint grid to 1mm/px -> Gaussian
 * blur (softens the blocky cell edges into a smooth line) -> threshold back
 * to binary. The blur+threshold round trip is what turns a staircase of
 * square cells into a track with reasonably smooth curves and corners.
 */
export interface LinePaintGrid {
  cols: number;
  rows: number;
  cellSizeMm: number;
  bits: Uint8Array; // length cols*rows, 0 = floor, 1 = line, row-major
}

export interface Bitmap1mm {
  width: number;
  height: number;
  data: Uint8Array; // 0 or 1, row-major
}

export function upsampleNearestNeighbor(grid: LinePaintGrid): Bitmap1mm {
  const width = Math.round(grid.cols * grid.cellSizeMm);
  const height = Math.round(grid.rows * grid.cellSizeMm);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const gridRow = Math.min(grid.rows - 1, Math.floor(y / grid.cellSizeMm));
    for (let x = 0; x < width; x++) {
      const gridCol = Math.min(grid.cols - 1, Math.floor(x / grid.cellSizeMm));
      data[y * width + x] = grid.bits[gridRow * grid.cols + gridCol];
    }
  }
  return { width, height, data };
}

/**
 * Three box-blur passes, each with an O(1)-per-pixel sliding-window sum,
 * approximate a true Gaussian blur (the standard "fast almost-Gaussian
 * blur" construction) in O(width*height) total work — independent of the
 * blur radius. The naive weighted convolution this replaced was
 * O(width*height*radius): fine for a small hand-drawn track, but a multi-
 * second stall on the largest map size (140x90 cells at 30mm), since the
 * radius scales with sigma while the direct convolution's cost scales with
 * it too.
 */
function boxRadiiForGauss(sigmaMm: number, passes: number): number[] {
  const wIdeal = Math.sqrt((12 * sigmaMm * sigmaMm) / passes + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl -= 1;
  const wu = wl + 2;
  const mIdeal = (12 * sigmaMm * sigmaMm - passes * wl * wl - 4 * passes * wl - 3 * passes) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const radii: number[] = [];
  for (let i = 0; i < passes; i++) radii.push(Math.max(0, ((i < m ? wl : wu) - 1) / 2));
  return radii;
}

function boxBlurHorizontal(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius === 0) return src;
  const out = new Float32Array(width * height);
  const window = radius * 2 + 1;
  const extLength = width + radius * 2;
  const prefix = new Float32Array(extLength + 1);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let acc = 0;
    for (let i = 0; i < extLength; i++) {
      const sx = Math.min(width - 1, Math.max(0, i - radius));
      acc += src[rowOffset + sx];
      prefix[i + 1] = acc;
    }
    for (let x = 0; x < width; x++) {
      out[rowOffset + x] = (prefix[x + window] - prefix[x]) / window;
    }
  }
  return out;
}

function boxBlurVertical(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius === 0) return src;
  const out = new Float32Array(width * height);
  const window = radius * 2 + 1;
  const extLength = height + radius * 2;
  const prefix = new Float32Array(extLength + 1);
  for (let x = 0; x < width; x++) {
    let acc = 0;
    for (let i = 0; i < extLength; i++) {
      const sy = Math.min(height - 1, Math.max(0, i - radius));
      acc += src[sy * width + x];
      prefix[i + 1] = acc;
    }
    for (let y = 0; y < height; y++) {
      out[y * width + x] = (prefix[y + window] - prefix[y]) / window;
    }
  }
  return out;
}

/** Separable blur over a 0/1 bitmap, returning 0..1 intensities. See `boxRadiiForGauss` for the algorithm. */
export function gaussianBlur(bitmap: Bitmap1mm, sigmaMm: number): Float32Array {
  const { width, height, data } = bitmap;
  let current: Float32Array = Float32Array.from(data);
  for (const radius of boxRadiiForGauss(sigmaMm, 3)) {
    current = boxBlurHorizontal(current, width, height, radius);
    current = boxBlurVertical(current, width, height, radius);
  }
  return current;
}

export function thresholdBinary(intensities: Float32Array, width: number, height: number, threshold = 0.5): Bitmap1mm {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < intensities.length; i++) data[i] = intensities[i] >= threshold ? 1 : 0;
  return { width, height, data };
}

/** Full pipeline: paint grid -> 1mm upsample -> Gaussian blur (default sigma 6mm, per v0.2.0 spec) -> threshold. */
export function smoothLinePaintGrid(grid: LinePaintGrid, sigmaMm = 6): Bitmap1mm {
  const upsampled = upsampleNearestNeighbor(grid);
  const blurred = gaussianBlur(upsampled, sigmaMm);
  return thresholdBinary(blurred, upsampled.width, upsampled.height, 0.5);
}
