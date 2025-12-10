# @flywave/flywave-3dtile-datasource

## Introduction

3D Tiles data source module for rendering 3D Tiles datasets in flywave.gl.

## Basic Usage

```typescript
import { MapView } from "@flywave/flywave-mapview";
import { TileRenderDataSource } from "@flywave/flywave-3dtile-datasource";

const mapView = new MapView({
    canvas: document.getElementById("map") as HTMLCanvasElement
});

const dataSource = new TileRenderDataSource({
    url: "https://example.com/3dtiles/tileset.json",
    name: "3dtiles"
});

await mapView.addDataSource(dataSource);
```

## Configuration Options (TileRenderDataSourceOptions)

| Option | Type | Description |
|--------|------|-------------|
| url | string | URL of the 3D Tiles tileset.json file |
| name | string | Data source name |
| transform? | Matrix4 | Transformation matrix for server data |
| headers? | HeadersInit | Optional HTTP headers for tile requests |
| enableDebug? | boolean | Whether to enable debug visualization |
| tilingScheme? | TilingScheme | Custom tiling scheme (defaults to Web Mercator) |
| maxConcurrentRequests? | number | Maximum concurrent tile requests |
| errorTarget? | number | Error threshold for level of detail calculation |
| animation? | BatchAnimation | Batch animation configuration |

## Main API Interfaces

### setTheme
Apply theme to 3D Tiles dataset
```typescript
await dataSource.setTheme(theme);
```

### getGeoExtent
Get the geographic extent of the tileset
```typescript
const geoExtent = await dataSource.getGeoExtent();
```

### raycast
Perform raycasting
```typescript
dataSource.raycast(raycaster, intersections);
```

### intersectMapObjects
Intersect map objects
```typescript
const intersects = dataSource.intersectMapObjects(x, y, parameters);
```

## Theme Configuration

### Basic Theme Structure

Themes define the rendering style of 3D Tiles data, including condition evaluation and style definitions:

```typescript
const theme = {
  styles: {
    "3dtiles": [
      {
        when: "batchId === 0",           // Condition evaluation
        technique: "tile3d",             // Rendering technique - use "tile3d" instead of "batch-mesh"
        color: "#ff0000",               // Style properties
        opacity: 0.8,
        visible: true
      }
    ]
  }
};
```

### Style Definition Conditions (when)

Condition expressions are used to determine when styles are applied, supporting the following syntax:

- **Numeric comparison**: `height > 100`, `batchId < 5`
- **Equality comparison**: `type === 'building'`, `name == 'test'`
- **Logical operations**: `height > 100 && batchId < 5`
- **Complex conditions**: `batchId >= 0 && batchId < 10 && height > 50`

### Tile3D Style Properties

| Property | Type | Description |
|----------|------|-------------|
| color | string | Color value (e.g. "#ff0000" or "red") |
| opacity | number | Transparency (0-1) |
| visible | boolean | Whether visible |
| offset | number | Offset amount |
| metalness | number | Metalness (0-1) |
| roughness | number | Roughness (0-1) |
| emissive | string | Emissive color |
| kind | string | Geometry type |
| useAnimation | boolean | Whether to use animation |
| direction | string | Offset direction ("radial", "up", "down") |
| value | number | Current numeric state (0.0-1.0) |

### Animation Effects

Support for defining animation transition effects:

```typescript
const animatedTheme = {
  styles: {
    "3dtiles": [
      {
        when: "height > 100",
        technique: "tile3d",
        // Define animation transitions
        color: { from: "#ff0000", to: "#00ff00" },     // Color transition
        opacity: { from: 0.2, to: 0.9 },              // Opacity transition
        offset: { from: 0, to: 10 },                  // Offset transition
        metalness: { from: 0.1, to: 0.8 },            // Metalness transition
        roughness: { from: 0.9, to: 0.2 },            // Roughness transition
        emissive: { from: "#000000", to: "#ff5500" }, // Emissive transition
        useAnimation: true,                            // Enable animation
        visible: true,
        direction: "up"                               // Offset direction
      }
    ]
  }
};
```

#### Supported Animation Properties

The following properties support animation transitions:

- `color`: Color transition (using `{ from: Color, to: Color }`)
- `opacity`: Transparency transition (using `{ from: number, to: number }`)
- `offset`: Position offset transition (using `{ from: number, to: number }`)
- `metalness`: Metalness transition (using `{ from: number, to: number }`)
- `roughness`: Roughness transition (using `{ from: number, to: number }`)
- `emissive`: Emissive color transition (using `{ from: Color, to: Color }`)

### Tile3D Technique
 

```typescript
const tile3DTheme = {
  styles: {
    "tile3d": [
      {
        when: "batchId === 0",
        technique: "tile3d",           // Use tile3d technique
        color: "#ff0000",
        opacity: 0.8,
        visible: true
      }
    ]
  }
};
```

### Complete Example

```typescript
const completeTheme = {
  styles: {
    "3dtiles": [
      // Building style
      {
        when: "height > 100",
        technique: "tile3d",
        color: "#ff0000",
        opacity: 0.8,
        visible: true,
        metalness: 0.3,
        roughness: 0.6
      },
      // Medium height building style
      {
        when: "height > 50 && height <= 100",
        technique: "tile3d",
        color: "#ffff00",
        opacity: 0.7,
        visible: true
      },
      // Low building style
      {
        when: "height <= 50",
        technique: "tile3d",
        color: "#00ff00",
        opacity: 0.9,
        visible: true
      },
      // Animation effect
      {
        when: "batchId === 0",
        technique: "tile3d",
        color: { from: "#ff0000", to: "#0000ff" },
        opacity: { from: 0.5, to: 1.0 },
        offset: { from: 0, to: 5 },
        useAnimation: true,
        visible: true
      }
    ]
  }
};

// Apply theme
await dataSource.setTheme(completeTheme);
```

## Extension Support

This module provides support for various 3D Tiles extensions:

- **3DTILES_batch_table_hierarchy**: Supports hierarchical batch table structure
- **3DTILES_implicit_tiling**: Supports implicit tiling scheme
- **3DTILES_content_gltf**: Supports embedded glTF content
- **3DTILES_metadata**: Supports metadata extension

## License

Apache 2.0