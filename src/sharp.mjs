import sharp from "sharp";

/**
 * seamlessMaterialTile overlaps the opposite edges of an image and feathers
 * them into each other. The middle of the photograph stays intact.
 */
export async function seamlessMaterialTile(texture) {
  const { data, info } = await sharp(texture, { limitInputPixels: 16_000_000 })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const overlapX = Math.floor(info.width / 8);
  const overlapY = Math.floor(info.height / 8);
  if (overlapX < 2 || overlapY < 2) return texture;
  const width = info.width - overlapX;
  const height = info.height - overlapY;
  const result = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const wy = y < overlapY ? (y + 0.5) / overlapY : 1;
    for (let x = 0; x < width; x++) {
      const wx = x < overlapX ? (x + 0.5) / overlapX : 1;
      for (let c = 0; c < 4; c++) {
        const at = (px, py) => data[(py * info.width + px) * 4 + c];
        const top = at(x, y) * wx + at(x < overlapX ? x + width : x, y) * (1 - wx);
        const bottomY = y < overlapY ? y + height : y;
        const bottom = at(x, bottomY) * wx + at(x < overlapX ? x + width : x, bottomY) * (1 - wx);
        result[(y * width + x) * 4 + c] = Math.round(top * wy + bottom * (1 - wy));
      }
    }
  }
  return sharp(result, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
}

/**
 * displaceMaterialSurface offsets texture pixels along a blurred height field
 * from source. The width and height must match both images.
 */
export async function displaceMaterialSurface(tiled, source, width, height) {
  const pixels = await sharp(tiled).ensureAlpha().raw().toBuffer();
  const relief = await sharp(source).flatten({ background: "#808080" })
    .greyscale().blur(6).raw().toBuffer();
  if (pixels.length !== width * height * 4 || relief.length !== width * height) {
    throw new Error("expected matching image dimensions");
  }
  const output = Buffer.alloc(pixels.length);
  const radius = 4;
  const wrap = (value, size) => ((value % size) + size) % size;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (relief[y * width + Math.min(width - 1, x + radius)] -
        relief[y * width + Math.max(0, x - radius)]) / 255 * 6;
      const dy = (relief[Math.min(height - 1, y + radius) * width + x] -
        relief[Math.max(0, y - radius) * width + x]) / 255 * 6;
      const sx = wrap(x + dx, width);
      const sy = wrap(y + dy, height);
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      for (let c = 0; c < 4; c++) {
        const at = (px, py) => pixels[(py * width + px) * 4 + c];
        const upper = at(x0, y0) * (1 - fx) + at((x0 + 1) % width, y0) * fx;
        const lower = at(x0, (y0 + 1) % height) * (1 - fx) + at((x0 + 1) % width, (y0 + 1) % height) * fx;
        output[(y * width + x) * 4 + c] = Math.round(upper * (1 - fy) + lower * fy);
      }
    }
  }
  return sharp(output, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
}
