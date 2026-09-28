import assert from "node:assert/strict";
import test from "node:test";

import { materialRepeat } from "../src/index.mjs";

test("repeat keeps only original colours and wraps deterministically", () => {
  const size = 32, period = 28;
  const source = Buffer.from(Array.from({ length: size * size * 3 }, (_, i) =>
    ((Math.floor(i / 3) * 17 + i % 3 * 43) % 5) * 50));
  const result = materialRepeat(source, size);
  assert.deepEqual(materialRepeat(source, size), result);
  const colour = (data, offset) => data.subarray(offset, offset + 3).toString("hex");
  const originalColours = new Set(Array.from({ length: size * size }, (_, i) => colour(source, i * 3)));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 3;
    assert.ok(originalColours.has(colour(result, offset)), "a blended colour was introduced");
    assert.equal(colour(result, offset), colour(result, ((y % period) * size + x % period) * 3));
  }
  assert.deepEqual(source.subarray((12 * size + 12) * 3, (12 * size + 12) * 3 + 3),
    result.subarray((12 * size + 12) * 3, (12 * size + 12) * 3 + 3));
});

test("repeat rejects invalid RGB dimensions", () => {
  assert.throws(() => materialRepeat(Buffer.alloc(32), 32), /square RGB/);
  assert.throws(() => materialRepeat(Buffer.alloc(30 * 30 * 3), 30), /square RGB/);
});
