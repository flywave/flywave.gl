# Basic Usage

This guide will introduce how to create basic 3D map applications using flywave.gl.

## Base Path Configuration

Before using flywave.gl, you may need to configure the base path to correctly load resource files.

### Setting the Base Path

```html
<script>
  // Set global base path
  window.FLYWAVE_BASE_URL = "https://flywave.net/flywave.gl/resources/";
</script>
```

Or set it in your application code:

```typescript
// Set base path before initializing MapView
window.FLYWAVE_BASE_URL = "https://flywave.net/flywave.gl/resources/";
import { MapView, GeoCoordinates, MapControls, sphereProjection } from "@flywave/flywave.gl";
```

## Creating a Basic Map

Here's a simple example to create a 3D globe map:

```typescript
import { 
  MapView, 
  GeoCoordinates, 
  MapControls, 
  sphereProjection 
} from "@flywave/flywave.gl";

const mapView = new MapView({
  projection: sphereProjection,
  target: new GeoCoordinates(39.9042, 116.4074), // Beijing coordinates
  zoomLevel: 10,
  canvas: document.getElementById("mapCanvas") as HTMLCanvasElement
});

mapView.initialize();

const mapControls = new MapControls(mapView);
mapControls.enable();
```

## Adding Terrain Data

To add terrain to your map:

```typescript
import { 
  MapView, 
  TerrainDataSource, 
  GeoCoordinates,
  sphereProjection 
} from "@flywave/flywave.gl";

const mapView = new MapView({
  projection: sphereProjection,
  target: new GeoCoordinates(39.9042, 116.4074),
  zoomLevel: 10,
  canvas: document.getElementById("mapCanvas") as HTMLCanvasElement
});

const terrainDataSource = new TerrainDataSource({
  // Terrain configuration
});

mapView.addDataSource(terrainDataSource);
mapView.initialize();
```

## Working with Map Controls

Add interactive controls to your map:

```typescript
import { 
  MapView, 
  MapControls, 
  GeoCoordinates,
  sphereProjection 
} from "@flywave/flywave.gl";

const mapView = new MapView({
  projection: sphereProjection,
  target: new GeoCoordinates(39.9042, 116.4074),
  zoomLevel: 10,
  canvas: document.getElementById("mapCanvas") as HTMLCanvasElement
});

mapView.initialize();

const mapControls = new MapControls(mapView);
mapControls.enable();

// Configure control options
mapControls.options = {
  enableZoom: true,
  enablePan: true,
  enableRotate: true
};
```

## Customizing Map Appearance

Customize the appearance of your map:

```typescript
import { 
  MapView, 
  GeoCoordinates,
  sphereProjection 
} from "@flywave/flywave.gl";

const mapView = new MapView({
  projection: sphereProjection,
  target: new GeoCoordinates(39.9042, 116.4074),
  zoomLevel: 10,
  canvas: document.getElementById("mapCanvas") as HTMLCanvasElement,
  theme: {
    backgroundColor: "#000000",
    fogColor: "#ffffff"
  }
});

mapView.initialize();
```

## Handling Events

Listen to map events:

```typescript
import { 
  MapView, 
  GeoCoordinates,
  sphereProjection 
} from "@flywave/flywave.gl";

const mapView = new MapView({
  projection: sphereProjection,
  target: new GeoCoordinates(39.9042, 116.4074),
  zoomLevel: 10,
  canvas: document.getElementById("mapCanvas") as HTMLCanvasElement
});

mapView.initialize();

// Listen to map events
mapView.addEventListener("mapviewready", () => {
  console.log("Map is ready");
});

mapView.addEventListener("zoomchanged", (event) => {
  console.log("Zoom level changed:", event.zoom);
});
```

## Next Steps

After learning the basics, you can:

- [Explore Examples](./examples.md) - See various feature examples
- [Check API Documentation](../api) - Detailed API references
- [Advanced Guides](../development/guide.md) - In-depth development guides