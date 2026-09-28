# seamless-texture

Join the opposite edges of a texture without mirroring or blended pixels.

## Features

- `materialRepeat` joins a square RGB texture through low-error seams.
- `seamlessMaterialTile` feathers the opposite edges of an image into each other.
- `displaceMaterialSurface` offsets texture pixels along a blurred height field.
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
