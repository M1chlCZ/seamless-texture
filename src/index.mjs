/**
 * materialRepeat joins the opposite edges of a square RGB texture through
 * low-error seams. It never mirrors, rotates, or blends pixels: every output
 * pixel comes from the source. The size must be a multiple of eight and at
 * least 32.
 */
export function materialRepeat(pixels, size = 512) {
  const overlap = size / 8;
  if (!Number.isInteger(overlap) || overlap < 4 || pixels.length !== size * size * 3) {
    throw new Error("expected a square RGB texture with a size that is a multiple of eight and at least 32");
  }
  const period = size - overlap;
  function join(source, width, height, vertical) {
    const length = vertical ? height : width;
    const sourceAt = (step, cross, far) => vertical
      ? (step * width + cross + (far ? period : 0)) * 3
      : ((cross + (far ? period : 0)) * width + step) * 3;
    const costs = new Float64Array(length * overlap).fill(Infinity);
    const parents = new Int32Array(length * overlap);
    for (let step = 0; step < length; step++) for (let cross = 1; cross < overlap - 1; cross++) {
      const a = sourceAt(step, cross, false), b = sourceAt(step, cross, true);
      let error = 0;
      for (let c = 0; c < 3; c++) error += (source[a + c] - source[b + c]) ** 2;
      let best = cross;
      if (step) for (let prev = cross - 1; prev <= cross + 1; prev++) {
        if (costs[(step - 1) * overlap + prev] < costs[(step - 1) * overlap + best]) best = prev;
      }
      costs[step * overlap + cross] = error + (step ? costs[(step - 1) * overlap + best] : 0);
      parents[step * overlap + cross] = best;
    }
    const seam = new Int32Array(length);
    let end = 1;
    for (let cross = 2; cross < overlap - 1; cross++) {
      if (costs[(length - 1) * overlap + cross] < costs[(length - 1) * overlap + end]) end = cross;
    }
    for (let step = length - 1; step >= 0; step--) {
      seam[step] = end;
      end = parents[step * overlap + end];
    }
    const outWidth = vertical ? period : width;
    const outHeight = vertical ? height : period;
    const result = Buffer.alloc(outWidth * outHeight * 3);
    for (let y = 0; y < outHeight; y++) for (let x = 0; x < outWidth; x++) {
      const step = vertical ? y : x, cross = vertical ? x : y;
      const offset = sourceAt(step, cross, cross < seam[step]);
      source.copy(result, (y * outWidth + x) * 3, offset, offset + 3);
    }
    return result;
  }
  const tile = join(join(pixels, size, size, true), period, size, false);
  const result = Buffer.alloc(pixels.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = ((y % period) * period + x % period) * 3;
    tile.copy(result, (y * size + x) * 3, offset, offset + 3);
  }
  return result;
}
