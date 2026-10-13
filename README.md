# seamless-texture

Join the opposite edges of a texture without mirroring or blended pixels.

## Features

- `materialRepeat` joins a square RGB texture through low-error seams.
- `seamlessMaterialTile` feathers the opposite edges of an image into each other.
- `batchMaterialTiles` tiles many PNG buffers in one call with bounded concurrency.
- `normalMapFromTile` builds a tangent-space normal map from the luminance height field.
- `roughnessMapFromTile` builds a grayscale roughness map from the luminance.
- `displaceMaterialSurface` offsets texture pixels along a blurred height field.
- Tile presets (`fabric`, `leather`, `wood`) bundle the real tile options.
- The `seamless-texture` CLI tiles files from the command line.
- `materialRepeat` never mirrors, rotates, or blends pixels. `seamlessMaterialTile` feathers only the edge overlap.

## Install

```
npm install seamless-texture
```

Node.js 22 or later is required. The `sharp` helpers need `sharp`:

```
npm install sharp
```

## Usage

```js
import { materialRepeat } from "seamless-texture";

const tiled = materialRepeat(pixels, 512);
```

```js
import { seamlessMaterialTile, displaceMaterialSurface } from "seamless-texture/sharp";

const tile = await seamlessMaterialTile(sourcePNG);
const relief = await displaceMaterialSurface(tile, sourcePNG, 512, 512);
```

### Tile options and presets

`seamlessMaterialTile(texture, options)` accepts:

- `preset`: `fabric`, `leather` or `wood`. The preset loads its bundle. An explicit option overrides the bundle value.
- `feather`: the fraction of each axis folded at the edges, between 0 and 1. The default is `1/8`.
- `size`: the square output size in pixels. The tile is stretched to that size. The default keeps the feathered source size.

| Preset | `feather` |
| --- | --- |
| `fabric` | `1/5` |
| `leather` | `1/8` |
| `wood` | `1/12` |

Every preset sets the feather style only; the output `size` stays
caller-controlled.

```js
const fabric = await seamlessMaterialTile(sourcePNG, { preset: "fabric" });
const narrow = await seamlessMaterialTile(sourcePNG, { preset: "fabric", feather: 1 / 12 });
```

### Batch mode

```js
import { batchMaterialTiles } from "seamless-texture/sharp";

const results = await batchMaterialTiles([firstPNG, secondPNG], { preset: "leather", concurrency: 4 });
for (const result of results) {
  if (result.error) console.error(result.error);
  else if (result.output) console.log(result.output.length);
}
```

`batchMaterialTiles(sources, options)` resolves to one entry per source in input order:

- `{ index, output }` with the tiled PNG buffer on success.
- `{ index, error }` with a message on failure.

One bad source never rejects the whole batch. The options carry every `seamlessMaterialTile` option plus `concurrency`, the number of sources tiled at once. The default is 2. The options are validated before processing, so a bad preset or concurrency rejects the call.

### Normal and roughness maps

```js
import { normalMapFromTile, roughnessMapFromTile } from "seamless-texture/sharp";

const normals = await normalMapFromTile(tilePNG, { strength: 1 });
const roughness = await roughnessMapFromTile(tilePNG, { floor: 0, ceiling: 255 });
```

`normalMapFromTile(texture, options)`:

- The sharp greyscale value of each pixel is the height.
- Horizontal and vertical sobel gradients sample with wraparound, so a seamless tile stays seamless.
- The unit normal is encoded as `R = 128 + nx * 127.5`, `G = 128 + ny * 127.5` and `B = 128 + nz * 127.5`. Flat input gives `(128, 128, 255)`.
- `strength` scales both slopes before normalization. The default is 1.

`roughnessMapFromTile(texture, options)`:

- Bright pixels become smooth and dark pixels become rough.
- The output value is `floor + (ceiling - floor) * (1 - height / 255)`, written as a grayscale PNG.
- `floor` and `ceiling` are integers between 0 and 255. The defaults are 0 and 255.

## CLI

```
npx seamless-texture tile <inputs...> --out-dir <dir> [--preset <name>] [--concurrency <n>]
```

- Every input `name.png` is written as `name.tile.png` in the output directory.
- A status line per file goes to stderr. A JSON summary goes to stdout.
- The exit code is 1 when any file fails.

## Notes

- `materialRepeat` reads and writes raw RGB buffers. The size must be a multiple of eight and at least 32.
- The helpers read and write PNG buffers.
- `sharp` is an optional peer dependency. The core function has no dependencies.

## Development

```
npm ci
npm test
```

## License

MIT. See `LICENSE`.
