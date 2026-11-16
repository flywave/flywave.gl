# Strict 3D Tiles test data

The `test/integration` suite runs the real traversal/loading pipeline against the complete
CesiumJS 3D Tiles test dataset (`Specs/Data/Cesium3DTiles`, ~12 MB, 740+ files).

The data is not checked in. Download it and serve it locally:

```bash
# from @flywave/flywave-3dtile-datasource
node scripts/test-data/download.mjs            # downloads to .tiles-test-data
node scripts/test-data/serve.mjs               # http://127.0.0.1:3010
```

Then run the package tests (in another terminal):

```bash
pnpm test
# or point at another server / port
TILES_TEST_DATA_URL=http://127.0.0.1:3010 pnpm test
```

If the data server is not reachable the integration suite is skipped, so the default test
run stays green without the dataset.

## Coverage

| Dataset | What it exercises |
| --- | --- |
| `Batched/*` | b3dm loading, batch tables, real content parsing |
| `Instanced/InstancedQuantizedOct32POrientation` | i3dm quantized positions + OCT32P normals |
| `PointCloud/PointCloudNormalsOctEncoded` | pnts parsing |
| `Composite/Composite` | cmpt composite tiles |
| `Hierarchy/BatchTableHierarchy` | batch table hierarchy |
| `Tilesets/TilesetOfTilesets` | external tilesets, refinement after the error target |
| `Tilesets/TilesetUniform` | control: renderable parent stops refining |
| `Tilesets/TilesetRefinementMix` | mixed ADD/REPLACE refinement |
| `Tilesets/TilesetEmptyRoot`, `TilesetEmptyExternal` | empty root / empty external tilesets |
| `Implicit/ImplicitTileset` | binary subtree expansion |
| `Implicit/ImplicitTilesetWithJsonSubtree` | JSON subtree format (must match binary) |
| `MultipleContents/MultipleContents` | `3DTILES_multiple_contents` (first content) |
| `fail/tileset.json` | 404 handling, no retry storm |

The suite also asserts invariants: queue counters return to zero, byte accounting stays
integral, a static camera does not re-request or oscillate, and queued tiles are cancelled
when the camera stops looking at them.
