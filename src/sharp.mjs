import sharp from "sharp";

/**
 * materialTilePresets holds named feather bundles for seamlessMaterialTile.
 * Every bundle sets the real seam style: feather is the fraction of each
 * axis folded at the edges. The output size stays caller-controlled through
 * the size option.
 *
 * - fabric: feather 1/5
 * - leather: feather 1/8
 * - wood: feather 1/12
 */
export const materialTilePresets = Object.freeze({
  fabric: Object.freeze({ feather: 1 / 5 }),
  leather: Object.freeze({ feather: 1 / 8 }),
  wood: Object.freeze({ feather: 1 / 12 }),
});

function resolveTileOptions(options) {
  const { preset, ...explicit } = options;
  if (preset === undefined) return explicit;
  if (!Object.hasOwn(materialTilePresets, preset)) throw new Error(`unknown preset: ${preset}`);
  return { ...materialTilePresets[preset], ...explicit };
}

function validateTileOptions(options) {
  const { feather = 1 / 8, size } = options;
  if (!(Number.isFinite(feather) && feather > 0 && feather < 1)) {
    throw new Error("feather must be a fraction between 0 and 1");
  }
  if (size !== undefined && (!Number.isInteger(size) || size < 1)) {
    throw new Error("size must be a positive integer");
  }
}

/**
 * seamlessMaterialTile overlaps the opposite edges of an image and feathers
 * them into each other. The middle of the photograph stays intact. The
 * feather option is the fraction of each axis folded at the edges (1/8 by
 * default). The size option stretches the tile to a square of that size. The
 * preset option loads a materialTilePresets bundle and an explicit option
 * overrides the preset value.
 */
export async function seamlessMaterialTile(texture, options = {}) {
  const tileOptions = resolveTileOptions(options);
  validateTileOptions(tileOptions);
  const { feather = 1 / 8, size } = tileOptions;
  const { data, info } = await sharp(texture, { limitInputPixels: 16_000_000 })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const overlapX = Math.floor(info.width * feather);
  const overlapY = Math.floor(info.height * feather);
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
  const tile = sharp(result, { raw: { width, height, channels: 4 } });
  return (size === undefined ? tile : tile.resize(size, size, { fit: "fill" }))
    .png({ compressionLevel: 0 }).toBuffer();
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

/**
 * batchMaterialTiles tiles many source PNG buffers in one call with bounded
 * concurrency. The result holds one entry per source in input order: an
 * { index, output } entry with the tiled PNG buffer or an { index, error }
 * entry with a message. One bad source never rejects the whole batch. The
 * options carry every seamlessMaterialTile option plus the concurrency
 * limit, 2 by default. The options are validated before processing.
 */
export async function batchMaterialTiles(sources, options = {}) {
  if (!Array.isArray(sources)) throw new Error("sources must be an array of PNG buffers");
  const { concurrency = 2, ...rest } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer");
  }
  const tileOptions = resolveTileOptions(rest);
  validateTileOptions(tileOptions);
  const results = new Array(sources.length);
  let next = 0;
  const worker = async () => {
    while (next < sources.length) {
      const index = next++;
      try {
        if (!Buffer.isBuffer(sources[index])) throw new Error("expected a PNG buffer");
        results[index] = { index, output: await seamlessMaterialTile(sources[index], tileOptions) };
      } catch (error) {
        results[index] = { index, error: error instanceof Error ? error.message : String(error) };
      }
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, sources.length) }, worker);
  await Promise.all(workers);
  return results;
}

/**
 * normalMapFromTile converts a PNG into a tangent-space normal map. The
 * greyscale value of each pixel is the height and the horizontal and vertical
 * sobel gradients sample with wraparound, so a seamless tile stays seamless.
 * The unit normal is encoded as R = 128 + nx * 127.5, G = 128 + ny * 127.5
 * and B = 128 + nz * 127.5, so flat input gives (128, 128, 255). The strength
 * option scales both slopes before normalization and defaults to 1.
 */
export async function normalMapFromTile(texture, options = {}) {
  const { strength = 1 } = options;
  if (!(Number.isFinite(strength) && strength >= 0)) {
    throw new Error("strength must be a non-negative number");
  }
  const { data, info } = await sharp(texture, { limitInputPixels: 16_000_000 })
    .removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const output = Buffer.alloc(width * height * 3);
  const encode = (value) => Math.max(0, Math.min(255, Math.round(value * 127.5 + 127.5)));
  for (let y = 0; y < height; y++) {
    const above = (y + height - 1) % height;
    const below = (y + 1) % height;
    for (let x = 0; x < width; x++) {
      const left = (x + width - 1) % width;
      const right = (x + 1) % width;
      const sample = (px, py) => data[py * width + px] / 255;
      const gx = sample(right, above) + 2 * sample(right, y) + sample(right, below)
        - sample(left, above) - 2 * sample(left, y) - sample(left, below);
      const gy = sample(left, below) + 2 * sample(x, below) + sample(right, below)
        - sample(left, above) - 2 * sample(x, above) - sample(right, above);
      const nx = -gx / 4 * strength;
      const ny = gy / 4 * strength;
      const length = Math.sqrt(nx * nx + ny * ny + 1);
      const offset = (y * width + x) * 3;
      output[offset] = encode(nx / length);
      output[offset + 1] = encode(ny / length);
      output[offset + 2] = encode(1 / length);
    }
  }
  return sharp(output, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
}

/**
 * roughnessMapFromTile converts a PNG into a greyscale roughness map. The
 * greyscale value of each pixel is the height: bright pixels become smooth
 * and dark pixels become rough. The output value is floor + (ceiling - floor)
 * * (1 - height / 255). The floor and ceiling options are integers between 0
 * and 255 and bound the output, 0 and 255 by default.
 */
export async function roughnessMapFromTile(texture, options = {}) {
  const { floor = 0, ceiling = 255 } = options;
  if (!Number.isInteger(floor) || floor < 0 || floor > 255) {
    throw new Error("floor must be an integer between 0 and 255");
  }
  if (!Number.isInteger(ceiling) || ceiling < 0 || ceiling > 255) {
    throw new Error("ceiling must be an integer between 0 and 255");
  }
  if (floor > ceiling) throw new Error("floor must not exceed ceiling");
  const { data, info } = await sharp(texture, { limitInputPixels: 16_000_000 })
    .removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < output.length; i++) {
    output[i] = Math.round(floor + (ceiling - floor) * (1 - data[i] / 255));
  }
  return sharp(output, { raw: { width: info.width, height: info.height, channels: 1 } })
    .toColourspace("b-w").png({ compressionLevel: 0 }).toBuffer();
}
