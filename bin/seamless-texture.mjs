#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { batchMaterialTiles, materialTilePresets } from "../src/sharp.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const usage = `Usage: seamless-texture tile <inputs...> --out-dir <dir> [--preset <name>] [--concurrency <n>]

Commands:
  tile                  Feather the opposite edges of every input PNG

Options:
  --out-dir <dir>       Output directory, created when missing (required)
  --preset <name>       Tile preset: fabric, leather or wood
  --concurrency <n>     Inputs tiled at once (default 2)
  -h, --help            Show this help
  -v, --version         Show the version

Every input <name>.png is written as <name>.tile.png in the output directory.
The per-file status lines go to stderr, the JSON summary goes to stdout and
the exit code is 1 when any file fails.`;

function parseArguments(argv) {
  const tokens = argv.flatMap((argument) => {
    if (!argument.startsWith("--") || !argument.includes("=")) return [argument];
    const at = argument.indexOf("=");
    return [argument.slice(0, at), argument.slice(at + 1)];
  });
  const options = { positionals: [] };
  for (let index = 0; index < tokens.length; index++) {
    const argument = tokens[index];
    switch (argument) {
      case "--out-dir":
      case "--preset":
      case "--concurrency": {
        const value = tokens[++index];
        if (value === undefined) throw new Error(`missing value for ${argument}`);
        if (argument === "--out-dir") options.outDir = value;
        else if (argument === "--preset") options.preset = value;
        else options.concurrency = value;
        break;
      }
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "-v":
      case "--version":
        options.version = true;
        break;
      default:
        if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
        options.positionals.push(argument);
    }
  }
  return options;
}

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

function tileName(input) {
  return `${basename(input, extname(input))}.tile.png`;
}

async function tileAll(inputs, options) {
  mkdirSync(options.outDir, { recursive: true });
  const entries = inputs.map((input) => {
    const name = tileName(input);
    try {
      return { input, name, bytes: readFileSync(input) };
    } catch (error) {
      return { input, name, error: describe(error) };
    }
  });
  const pending = entries.filter((entry) => entry.error === undefined);
  const tileOptions = {};
  if (options.preset !== undefined) tileOptions.preset = options.preset;
  if (options.concurrency !== undefined) tileOptions.concurrency = Number(options.concurrency);
  const tiles = await batchMaterialTiles(pending.map((entry) => entry.bytes), tileOptions);
  const summary = { total: entries.length, ok: 0, failed: 0, results: [] };
  const written = new Set();
  let cursor = 0;
  for (const entry of entries) {
    const result = entry.error === undefined ? tiles[cursor++] : { error: entry.error };
    let { error } = result;
    if (error === undefined && written.has(entry.name)) error = `duplicate output name: ${entry.name}`;
    if (error === undefined) {
      const output = join(options.outDir, entry.name);
      try {
        writeFileSync(output, result.output);
        written.add(entry.name);
        summary.ok += 1;
        summary.results.push({ input: entry.input, output, bytes: result.output.length });
        process.stderr.write(`${entry.input} -> ${output}\n`);
      } catch (writeError) {
        error = describe(writeError);
      }
    }
    if (error !== undefined) {
      summary.failed += 1;
      summary.results.push({ input: entry.input, error });
      process.stderr.write(`${entry.input}: ${error}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return summary.failed;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.version) {
    process.stdout.write(`${version}\n`);
    return;
  }
  if (options.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const [command, ...inputs] = options.positionals;
  if (command !== "tile") throw new Error(usage);
  if (!options.outDir) throw new Error("tile requires --out-dir");
  if (inputs.length === 0) throw new Error("tile requires at least one input PNG");
  if (options.preset !== undefined && !Object.hasOwn(materialTilePresets, options.preset)) {
    throw new Error(`unknown preset: ${options.preset}`);
  }
  const failed = await tileAll(inputs, options);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${describe(error)}\n`);
  process.exitCode = 1;
});
