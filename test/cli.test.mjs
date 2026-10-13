import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import sharp from "sharp";

const cli = fileURLToPath(new URL("../bin/seamless-texture.mjs", import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 120_000, maxBuffer: 4 << 20 });
}

async function gradient(directory, name, offset) {
  const pixels = Buffer.alloc(24 * 24 * 4, 255);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    pixels[(y * 24 + x) * 4] = (x * 9 + offset) % 256;
    pixels[(y * 24 + x) * 4 + 1] = (y * 9 + offset) % 256;
  }
  const path = join(directory, name);
  writeFileSync(path, await sharp(pixels, { raw: { width: 24, height: 24, channels: 4 } }).png().toBuffer());
  return path;
}

test("tile writes deterministic names and reports failures in a JSON summary", async () => {
  const directory = mkdtempSync(join(tmpdir(), "seamless-texture-"));
  const outDir = join(directory, "out");
  const source = await gradient(directory, "wood.png", 0);
  const broken = join(directory, "broken.png");
  writeFileSync(broken, "not a png");
  const result = run(["tile", source, broken, "--out-dir", outDir, "--concurrency", "2"]);
  assert.equal(result.status, 1, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.total, 2);
  assert.equal(summary.ok, 1);
  assert.equal(summary.failed, 1);
  assert.deepEqual(summary.results[0].input, source);
  assert.equal(summary.results[0].output, join(outDir, "wood.tile.png"));
  const written = readFileSync(join(outDir, "wood.tile.png"));
  assert.equal(summary.results[0].bytes, written.length);
  assert.equal(typeof summary.results[1].error, "string");
  assert.match(result.stderr, /wood\.tile\.png/);
  assert.match(result.stderr, /broken\.png/);
});

test("tile applies a preset and rejects unusable invocations", async () => {
  const directory = mkdtempSync(join(tmpdir(), "seamless-texture-"));
  const source = await gradient(directory, "leather.png", 0);
  const outDir = join(directory, "out");
  const preset = run(["tile", source, `--out-dir=${outDir}`, "--preset", "leather"]);
  assert.equal(preset.status, 0, preset.stderr);
  assert.equal(JSON.parse(preset.stdout).ok, 1);
  const sourceWidth = (await sharp(source).metadata()).width;
  const { width } = await sharp(join(outDir, "leather.tile.png")).metadata();
  assert.equal(width, sourceWidth - Math.floor(sourceWidth / 8));
  assert.equal(run(["--help"]).status, 0);
  assert.equal(run(["--version"]).status, 0);
  const missingInputs = run(["tile", "--out-dir", outDir]);
  assert.equal(missingInputs.status, 1);
  assert.match(missingInputs.stderr, /at least one input/);
  const unknownPreset = run(["tile", source, "--out-dir", outDir, "--preset", "silk"]);
  assert.equal(unknownPreset.status, 1);
  assert.match(unknownPreset.stderr, /unknown preset/);
  const unknownOption = run(["tile", source, "--out-dir", outDir, "--zoom"]);
  assert.equal(unknownOption.status, 1);
  assert.match(unknownOption.stderr, /unknown option/);
  const missingValue = run(["tile", source, "--preset"]);
  assert.equal(missingValue.status, 1);
  assert.match(missingValue.stderr, /missing value/);
});
