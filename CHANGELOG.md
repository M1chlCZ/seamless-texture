# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `batchMaterialTiles(sources, options)` tiles many PNG buffers in one call
  with bounded concurrency (default 2). It resolves to one result per source
  in input order, `{ index, output }` or `{ index, error }`, so one bad
  source never rejects the whole batch.
- Tile presets `materialTilePresets` (`fabric`, `leather`, `wood`) bundle the
  feather style; the output size stays caller-controlled. An explicit option
  overrides the preset bundle.
- `feather` and `size` options for `seamlessMaterialTile`: the fraction of
  each axis folded at the edges and a square output size. The defaults keep
  the 0.1.x behavior.
- `normalMapFromTile(texture, { strength })` builds a tangent-space normal
  map from the luminance height field with wraparound sobel gradients.
- `roughnessMapFromTile(texture, { floor, ceiling })` builds a grayscale
  roughness map from the inverted luminance.
- The `seamless-texture` CLI (`bin/seamless-texture.mjs`) with the `tile`
  command, deterministic `<basename>.tile.png` output names, `--out-dir`,
  `--preset` and `--concurrency` flags. Per-file status lines go to stderr,
  a JSON summary goes to stdout, and the exit code is 1 when any file fails.
