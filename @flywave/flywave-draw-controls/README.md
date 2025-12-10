# @flywave/flywave-draw-controls

`@flywave/flywave-draw-controls` is the drawing control module of the flywave.gl library, providing geometric drawing and measurement functions on 3D maps. This module supports multiple drawing modes, GeoJSON format data processing, and real-time distance measurement functionality.

## Installation

```bash
npm install @flywave/flywave-draw-controls
```

## Core Features

### 1. GeoJSONDrawControls

`GeoJSONDrawControls` is a drawing control specifically designed for handling GeoJSON data, supporting the creation of drawing objects from GeoJSON data, and providing import/export functionality.

#### Basic Usage

```typescript
import { GeoJSONDrawControls } from "@flywave/flywave-draw-controls";

// Initialize drawing controls
const drawControls = new GeoJSONDrawControls(mapView, mapControls);

// Create sample GeoJSON data
const geojsonData = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: {
                id: "point-1",
                name: "Sample Point"
            },
            geometry: {
                type: "Point",
                coordinates: [116.4074, 39.9042, 0] // Longitude, Latitude, Height
            }
        },
        {
            type: "Feature",
            properties: {
                id: "line-1",
                name: "Sample Line"
            },
            geometry: {
                type: "LineString",
                coordinates: [
                    [116.4074, 39.9042, 0],
                    [121.4737, 31.2304, 0],
                    [113.2644, 23.1291, 0]
                ]
            }
        }
    ]
};

// Add GeoJSON data to drawing controls
const addedCount = drawControls.addGeoJSON(geojsonData);
console.log(`Successfully added ${addedCount} objects`);

// Create objects from GeoJSON data without automatically adding to controls
const objects = drawControls.createObjectsFromGeoJSON(geojsonData);

// Update existing GeoJSON objects
const updatedCount = drawControls.updateGeoJSON(geojsonData);
console.log(`Successfully updated ${updatedCount} objects`);
```

#### API Reference

- `constructor(mapView: MapView, mapControls: MapControls)` - Create new GeoJSONDrawControls instance
- `addGeoJSON(geoJson: GeoJson): number` - Add GeoJSON data to drawing controls
- `updateGeoJSON(geoJson: GeoJson): number` - Update existing GeoJSON objects
- `createObjectsFromGeoJSON(geoJson: GeoJson): DrawableObject[]` - Create drawing objects from GeoJSON data
- `exportToGeoJSON(): GeoJson` - Export all drawing objects as GeoJSON format

### 2. MeasureToolControls

`MeasureToolControls` provides measurement tool functionality, supporting drawing measurement lines on maps and displaying distances in real-time.

#### Basic Usage

```typescript
import { MeasureToolControls } from "@flywave/flywave-draw-controls";

// Initialize measurement tool controls
const measureControls = new MeasureToolControls(mapView, mapControls);

// Switch to measurement mode
measureControls.toggleMeasureMode();

// Create measurement line
const vertices = [
    new GeoCoordinates(39.9042, 116.4074, 0), // Latitude, Longitude, Height
    new GeoCoordinates(31.2304, 121.4737, 0),
    new GeoCoordinates(23.1291, 113.2644, 0)
];

const measureLine = measureControls.createMeasureLine(vertices);

// Get measurement line distance
const distance = measureControls.getMeasureLineDistance(measureLine);
console.log(`Measurement distance: ${measureLine.formatDistance(distance)}`);

// Get all measurement lines
const allMeasureLines = measureControls.getMeasureLines();
```

#### API Reference

- `constructor(mapView: MapView, mapControls: MapControls)` - Create new MeasureToolControls instance
- `toggleMeasureMode(): void` - Toggle measurement mode
- `createMeasureLine(vertices: GeoCoordinates[]): MeasureLine` - Create measurement line object
- `createMeasureLineFromLine(line: DrawableObject): MeasureLine | null` - Create measurement line from existing line object
- `getMeasureLines(): MeasureLine[]` - Get all measurement line objects
- `getMeasureLineDistance(measureLine: MeasureLine): number` - Get measurement line distance
- `updateMeasureLines(): void` - Update display of all measurement lines

## Drawing Modes

All drawing controls support the following drawing modes:

- `DrawMode.NONE` - No drawing mode
- `DrawMode.POINT` - Point drawing mode
- `DrawMode.LINE` - Line drawing mode
- `DrawMode.POLYGON` - Polygon drawing mode
- `DrawMode.EDIT` - Edit mode
- `DrawMode.DELETE` - Delete mode

```typescript
// Set drawing mode
drawControls.setMode(DrawMode.LINE);

// Get current drawing mode
const currentMode = drawControls.getMode();
```

## Event System

Drawing controls use an event system to notify various operations:

```typescript
import { DrawEventNames } from "@flywave/flywave-draw-controls";

// Listen to drawing events
drawControls.addEventListener(DrawEventNames.DRAW_START, (event) => {
    console.log('Drawing started');
});

drawControls.addEventListener(DrawEventNames.DRAW_END, (event) => {
    console.log('Drawing ended');
});

drawControls.addEventListener(DrawEventNames.OBJECT_ADDED, (event) => {
    console.log('Object added', event.object);
});

drawControls.addEventListener(DrawEventNames.OBJECT_MODIFIED, (event) => {
    console.log('Object modified', event.object);
});

drawControls.addEventListener(DrawEventNames.OBJECT_REMOVED, (event) => {
    console.log('Object removed', event.object);
});
```

## Supported Geometry Types

- **PointObject** - Point object, used to represent a single geographic coordinate point
- **DrawLine** - Line object, used to represent a line segment
- **DrawPolygon** - Polygon object, used to represent a closed area

## Advanced Features

### Height Adjustment
Drawing controls support height adjustment functionality, allowing users to adjust the height values of drawn objects.

### Vertex Editing
In edit mode, vertices can be dragged to modify the shape of drawn objects.

### Real-time Measurement
MeasureToolControls provides real-time measurement functionality, displaying distances in real-time during the drawing process.

## Examples

### Complete Drawing Application Example

```typescript
import { GeoJSONDrawControls, MeasureToolControls, DrawMode } from "@flywave/flywave-draw-controls";

// Initialize drawing controls
const drawControls = new GeoJSONDrawControls(mapView, mapControls);
const measureControls = new MeasureToolControls(mapView, mapControls);

// Set drawing mode
drawControls.setMode(DrawMode.LINE);

// Add event listeners
drawControls.addEventListener(DrawEventNames.OBJECT_ADDED, (event) => {
    console.log('New object added:', event.object);
});

// Load GeoJSON data
const geoJsonData = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [116.4074, 39.9042, 0]
            }
        }
    ]
};

drawControls.addGeoJSON(geoJsonData);

// Switch to measurement mode
measureControls.toggleMeasureMode();

// Export all drawn objects as GeoJSON
const exportedData = drawControls.exportToGeoJSON();
console.log('Exported GeoJSON:', exportedData);
```

## License

Apache-2.0 License