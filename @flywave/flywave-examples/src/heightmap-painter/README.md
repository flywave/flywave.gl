# Heightmap Painter Example

This example demonstrates how to use the `@flywave/flywave-heightmap-painter` library to interactively paint terrain modifications and apply them to a 3D map.

## Files Structure

```
heightmap-painter/
├── index.ts          # Main TypeScript implementation
├── index.js          # Compiled JavaScript
├── config.ts         # Configuration constants
├── config.js         # Compiled JavaScript config
└── README.md         # This file
```

## Features

-   🎨 **Interactive Painting**: Draw terrain modifications on a 2D map using various brush types
-   🗺️ **Multiple Brush Types**: Raise, Lower, Smooth, Flatten, and Noise brushes
-   📐 **Real-time Preview**: See your changes instantly on the 2D map
-   🌄 **3D Terrain Application**: Apply painted heightmaps to the 3D terrain with one click
-   🎛️ **Adjustable Controls**: Modify brush size and type in real-time
-   📍 **Geo-aware**: Automatically records the geographic extent of your painting

## Usage

1. **Paint on the 2D Map**: Use the painter panel in the top-right corner to draw terrain modifications
2. **Adjust Brush Settings**:
    - Select brush type from the dropdown (Raise, Lower, Smooth, Flatten, Noise)
    - Adjust brush size using the slider
3. **Apply to Terrain**: Click "Apply to Terrain" to apply your painting to the 3D map
4. **Clear Canvas**: Click "Clear Painter" to reset and start over

## Controls

-   **Apply to Terrain**: Applies the current heightmap to the 3D terrain
-   **Clear Painter**: Clears all painted data from the canvas
-   **Brush Type Select**: Choose between different brush types
-   **Brush Size Slider**: Adjust the size of the brush (5-200px)

## Technical Details

### Heightmap Integration

The painted heightmap is applied to the 3D terrain using the `GroundModificationManager`:

```typescript
const manager = cesiumTerrain.getGroundModificationManager();
const geoBox = new GeoBox(
    new GeoCoordinates(exportData.geoBox.minLat, exportData.geoBox.minLon),
    new GeoCoordinates(exportData.geoBox.maxLat, exportData.geoBox.maxLon)
);

const modifierId = manager.addModifier(
    { type: "image", image: exportData.imageData },
    geoBox,
    HeightMapBlendMode.ADD,
    1.0,
    { min: 0, max: 500 }
);
```

### Painter Setup

The painter is initialized with specific dimensions and map settings:

```typescript
const painter = new HeightmapPainter({
    width: 1024,
    height: 1024,
    initialCenter: [36.4, 118.1],
    initialZoom: 13,
    basemap: "satellite"
});

const element = painter.getElement();
document.body.appendChild(element);
```

## Requirements

-   `@flywave/flywave.gl` - Main 3D mapping library
-   `@flywave/flywave-heightmap-painter` - Heightmap painting tool
-   Cesium Ion access token for terrain data

## Notes

-   The painter element is positioned absolutely in the top-right corner
-   Multiple applications will replace previous modifications
-   Height values are normalized to 0-500 meters range
-   GeoBox is automatically calculated based on the visible map area
