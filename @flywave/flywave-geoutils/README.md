# @flywave/flywave-geoutils

Utility classes for working with geospatial data.

## Overview

This package provides utility classes for working with geospatial data, including:
- Coordinate representations
- Polygon and line string operations
- Map projections
- Tiling schemes

## Installation

```bash
pnpm install @flywave/flywave-geoutils
```

## API Reference

### Coordinates

- [GeoCoordinates](src/coordinates/GeoCoordinates.ts) - Class representing geographic coordinates with latitude, longitude, and optional altitude
- [GeoBox](src/coordinates/GeoBox.ts) - Class representing a geographic bounding box
- [GeoPolygon](src/coordinates/GeoPolygon.ts) - Class representing a geographic polygon
- [GeoLineString](src/coordinates/GeoLineString.ts) - Class representing a geographic line string
- [GeoLineStringToStrip](src/coordinates/GeoLineStringToStrip.ts) - Class for converting a line string of geo coordinates into a strip (polygon) with triangulated indices

### GeoLineStringToStrip

The `GeoLineStringToStrip` class converts a line string of geo coordinates into a strip (polygon) with triangulated indices. It takes into account altitude information when creating the strip.

#### Features:
- Converts GeoCoordinates arrays to strip polygons
- Handles altitude information correctly
- Generates triangulated indices for rendering
- Supports optional projection for coordinate conversion
- Provides separate methods for different output formats:
  - `convertToGeoCoordinates()`: outputs GeoCoordinates[]
  - `convertToProjectedCoordinates()`: outputs projected local coordinates (THREE.Vector3[])
  - `convert()`: automatically selects output format based on whether projection is provided

#### Constructor Parameters:

- `width` (number): The width of the strip in meters
- `projection` (IProjection, optional): Optional projection to use for coordinate conversion

#### Usage:

```typescript
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { GeoLineStringToStrip } from "@flywave/flywave-geoutils";

// Create a line string representing a path
const coordinates = [
    new GeoCoordinates(52.52, 13.40, 100), // Berlin with 100m altitude
    new GeoCoordinates(52.52, 13.41, 150), // Next point with 150m altitude
    new GeoCoordinates(52.51, 13.41, 200), // Next point with 200m altitude
    new GeoCoordinates(52.51, 13.40, 50)   // Final point with 50m altitude
];

// Create converter with 500m width
const converter = new GeoLineStringToStrip(500);

// Convert to strip (automatically selects output format)
const result = converter.convert(coordinates);

console.log(`Generated ${result.positions.length} positions`);
console.log(`Generated ${result.indices.length} indices`);
```

#### Convert to GeoCoordinates directly:

```typescript
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { GeoLineStringToStrip } from "@flywave/flywave-geoutils";

// Create a line string representing a path
const coordinates = [
    new GeoCoordinates(52.52, 13.40, 100), // Berlin with 100m altitude
    new GeoCoordinates(52.52, 13.41, 150), // Next point with 150m altitude
    new GeoCoordinates(52.51, 13.41, 200), // Next point with 200m altitude
    new GeoCoordinates(52.51, 13.40, 50)   // Final point with 50m altitude
];

// Create converter with 500m width
const converter = new GeoLineStringToStrip(500);

// Convert to strip directly in GeoCoordinates format
const result = converter.convertToGeoCoordinates(coordinates);

console.log(`Generated ${result.positions.length} GeoCoordinate positions`);
console.log(`Generated ${result.indices.length} indices`);
```

#### Convert to Projected Coordinates directly:

```typescript
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { GeoLineStringToStrip, IProjection } from "@flywave/flywave-geoutils";
import * as THREE from "three";

// Implement a projection
class MyProjection implements IProjection {
    projectPoint(geoPoint: GeoCoordinates): THREE.Vector3 {
        // Your projection implementation
        return new THREE.Vector3(geoPoint.longitude * 1000, geoPoint.latitude * 1000, geoPoint.altitude || 0);
    }

    unprojectPoint(worldPoint: THREE.Vector3): GeoCoordinates {
        // Your unprojection implementation
        return new GeoCoordinates(worldPoint.y / 1000, worldPoint.x / 1000, worldPoint.z);
    }
}

// Create a line string representing a path
const coordinates = [
    new GeoCoordinates(52.52, 13.40, 100), // Berlin with 100m altitude
    new GeoCoordinates(52.52, 13.41, 150), // Next point with 150m altitude
    new GeoCoordinates(52.51, 13.41, 200), // Next point with 200m altitude
    new GeoCoordinates(52.51, 13.40, 50)   // Final point with 50m altitude
];

// Create converter with 500m width and a projection
const projection = new MyProjection();
const converter = new GeoLineStringToStrip(500, projection);

// Convert to strip directly in projected coordinates (local coordinates)
const result = converter.convertToProjectedCoordinates(coordinates);

console.log(`Generated ${result.positions.length} projected positions (local coordinates)`);
console.log(`Generated ${result.indices.length} indices`);
```

#### With Projection:

```typescript
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { GeoLineStringToStrip, IProjection } from "@flywave/flywave-geoutils";
import * as THREE from "three";

// Implement a projection
class MyProjection implements IProjection {
    projectPoint(geoPoint: GeoCoordinates): THREE.Vector3 {
        // Your projection implementation
        return new THREE.Vector3(geoPoint.longitude * 1000, geoPoint.latitude * 1000, geoPoint.altitude || 0);
    }

    unprojectPoint(worldPoint: THREE.Vector3): GeoCoordinates {
        // Your unprojection implementation
        return new GeoCoordinates(worldPoint.y / 1000, worldPoint.x / 1000, worldPoint.z);
    }
}

// Create converter with projection
const projection = new MyProjection();
const converter = new GeoLineStringToStrip(500, projection);

// Convert to strip with projection
const result = converter.convert(coordinates);
```

It includes functionality for:

* [WGS 84](https://en.wikipedia.org/wiki/World_Geodetic_System)-compliant coordinates
* supporting tiling schemes, such as [Web Mercator](https://en.wikipedia.org/wiki/Web_Mercator_projection) or [HERE tile](https://developer.here.com/olp/documentation/data-user-guide/shared_content/topics/olp/concepts/partitions.html)
* supporting map projections, such as [Web Mercator](https://en.wikipedia.org/wiki/Web_Mercator_projection) or [Equirectangular](https://en.wikipedia.org/wiki/Equirectangular_projection)
* math utility functions for working with radians and degrees
