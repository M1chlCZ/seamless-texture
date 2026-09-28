import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { displaceMaterialSurface, seamlessMaterialTile } from "../src/sharp.mjs";

test("opposite tile edges meet smoothly while the central print is preserved", async () => {
  const width = 64, height = 64;
  const pixels = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    pixels[(y * width + x) * 4] = x * 4;
    pixels[(y * width + x) * 4 + 1] = y * 4;
  }
  const source = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const tile = await seamlessMaterialTile(source);
  assert.deepEqual(await seamlessMaterialTile(source), tile);
  const { data, info } = await sharp(tile).raw().toBuffer({ resolveWithObject: true });
  assert.ok(Math.abs(data[0] - data[(info.width - 1) * 4]) < 20);
  assert.ok(Math.abs(data[1] - data[((info.height - 1) * info.width) * 4 + 1]) < 20);
  assert.deepEqual([...data.subarray((32 * info.width + 32) * 4, (32 * info.width + 32) * 4 + 4)],
    [...pixels.subarray((32 * width + 32) * 4, (32 * width + 32) * 4 + 4)]);
});

test("flat relief leaves texture pixels and alpha unchanged", async () => {
  const source = await sharp({ create: { width: 32, height: 32, channels: 4,
    background: { r: 128, g: 128, b: 128, alpha: 1 } } }).png().toBuffer();
  const pixels = Buffer.from(Array.from({ length: 32 * 32 * 4 }, (_, i) => i % 251));
  const texture = await sharp(pixels, { raw: { width: 32, height: 32, channels: 4 } }).png().toBuffer();
  const displaced = await displaceMaterialSurface(texture, source, 32, 32);
  assert.deepEqual(await sharp(displaced).raw().toBuffer(), pixels);
});
