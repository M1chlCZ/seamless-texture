import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { batchMaterialTiles, seamlessMaterialTile } from "../src/sharp.mjs";

async function gradientPNG(width, height, offset) {
  const pixels = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    pixels[(y * width + x) * 4] = (x * 7 + offset) % 256;
    pixels[(y * width + x) * 4 + 1] = (y * 11 + offset) % 256;
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("batch tiles every source in input order and isolates a bad source", async () => {
  const first = await gradientPNG(32, 32, 0);
  const third = await gradientPNG(32, 32, 128);
  const results = await batchMaterialTiles([first, Buffer.from("not a png"), third]);
  assert.equal(results.length, 3);
  assert.deepEqual(results[0], { index: 0, output: await seamlessMaterialTile(first) });
  assert.equal(results[1].index, 1);
  assert.equal(typeof results[1].error, "string");
  assert.ok(results[1].error.length > 0);
  assert.deepEqual(results[2], { index: 2, output: await seamlessMaterialTile(third) });
});

test("batch reports a non-buffer source as one error", async () => {
  const results = await batchMaterialTiles(["not a buffer"]);
  assert.deepEqual(results, [{ index: 0, error: "expected a PNG buffer" }]);
});

test("batch keeps input order under bounded concurrency and passes preset options", async () => {
  const sources = await Promise.all(Array.from({ length: 5 }, (_, index) => gradientPNG(40, 40, index * 23)));
  const results = await batchMaterialTiles(sources, { concurrency: 2, preset: "leather" });
  assert.deepEqual(results.map((result) => result.index), [0, 1, 2, 3, 4]);
  for (let index = 0; index < sources.length; index++) {
    assert.deepEqual(results[index].output, await seamlessMaterialTile(sources[index], { preset: "leather" }));
  }
});

test("batch validates options before processing and accepts an empty list", async () => {
  assert.deepEqual(await batchMaterialTiles([]), []);
  await assert.rejects(batchMaterialTiles([Buffer.alloc(0)], { concurrency: 0 }), /concurrency/);
  await assert.rejects(batchMaterialTiles([Buffer.alloc(0)], { preset: "silk" }), /unknown preset/);
  await assert.rejects(batchMaterialTiles([Buffer.alloc(0)], { feather: 2 }), /feather/);
});
