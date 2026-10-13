import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { normalMapFromTile, roughnessMapFromTile } from "../src/sharp.mjs";

async function rampPNG(width, height, horizontal) {
  const pixels = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const position = horizontal ? x : y;
    pixels[y * width + x] = Math.round(position * 255 / (horizontal ? width - 1 : height - 1));
  }
  return sharp(pixels, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

test("normal map tilts away from a rising slope and stays neutral when flat", async () => {
  const width = 16, height = 16;
  const rising = await rampPNG(width, height, true);
  const { data, info } = await sharp(await normalMapFromTile(rising)).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 3);
  const offset = (8 * width + 8) * 3;
  assert.ok(data[offset] < 128, `expected a left tilt, got ${data[offset]}`);
  assert.equal(data[offset + 1], 128);
  assert.ok(data[offset + 2] > 200);

  const stronger = await sharp(await normalMapFromTile(rising, { strength: 2 })).raw().toBuffer();
  assert.ok(stronger[offset] < data[offset]);

  const verticalRamp = await rampPNG(width, height, false);
  const vertical = await sharp(await normalMapFromTile(verticalRamp)).raw().toBuffer();
  assert.equal(vertical[offset], 128);
  assert.ok(vertical[offset + 1] > 128, `expected a downward tilt, got ${vertical[offset + 1]}`);

  const flat = await sharp(Buffer.alloc(64, 128), { raw: { width: 8, height: 8, channels: 1 } }).png().toBuffer();
  const neutral = await sharp(await normalMapFromTile(flat)).raw().toBuffer();
  for (let i = 0; i < neutral.length; i += 3) {
    assert.deepEqual([...neutral.subarray(i, i + 3)], [128, 128, 255]);
  }
  await assert.rejects(normalMapFromTile(flat, { strength: -1 }), /strength/);
});

test("roughness map inverts luminance between the floor and the ceiling", async () => {
  const width = 8, height = 4;
  const ramp = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    ramp[y * width + x] = Math.round(x * 255 / (width - 1));
  }
  const source = await sharp(ramp, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const file = await roughnessMapFromTile(source);
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.space, "b-w");
  assert.equal(metadata.channels, 1);
  const bare = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  assert.equal(bare.info.channels, 1);
  const bounded = await sharp(await roughnessMapFromTile(source, { floor: 40, ceiling: 200 })).greyscale().raw().toBuffer();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const heightValue = ramp[y * width + x];
    assert.equal(bare.data[y * width + x], 255 - heightValue);
    assert.equal(bounded[y * width + x], Math.round(40 + 160 * (1 - heightValue / 255)));
  }
  await assert.rejects(roughnessMapFromTile(source, { floor: 200, ceiling: 40 }), /floor/);
  await assert.rejects(roughnessMapFromTile(source, { ceiling: 256 }), /ceiling/);
});
