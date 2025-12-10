# @flywave/flywave.gl

[![NPM Version](https://img.shields.io/npm/v/@flywave/flywave.gl.svg?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@flywave/flywave.gl)
[![License](https://img.shields.io/npm/l/@flywave/flywave.gl.svg?style=for-the-badge)](https://github.com/flywave/flywave.gl/blob/master/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/@flywave/flywave.gl.svg?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@flywave/flywave.gl)

**A TypeScript-based open-source 3D map rendering engine**  
*Create high-performance, scalable 3D map visualization solutions using WebGL and Three.js*

## Overview

`@flywave/flywave.gl` is the complete feature package of the flywave.gl project, integrating all core modules to provide a fully functional 3D map rendering engine. The package is designed with modularity in mind, aiming to provide a high-performance, scalable, and modular 3D map rendering solution.

## Features

- 🌍 **Develop visually appealing 3D maps** - Create immersive map experiences using WebGL technology
- 🎨 **Create highly animated and dynamic map visualizations with WebGL** - Based on the popular [three.js](https://threejs.org/) library
- 🎨 **Create dynamically switchable theme maps** - Support multiple map styles and themes
- ⚡ **Create smooth map experiences through high-performance map rendering and decoding** - Parallelize CPU-intensive tasks with Web Workers
- 🔧 **Modular map design** - Exchange modules and data providers as needed
- 🗺️ **Multi-data source support** - Support multiple map data source formats (3D Tiles, vector tiles, web tiles, etc.)
- 🏔️ **Terrain support** - Built-in Digital Elevation Model (DEM) support
- 🖱️ **Rich interaction features** - Provide complete map interaction and control features
- 🌍 **Multiple projection methods** - Support spherical, planar, and ellipsoidal projections

## Installation

```bash
npm install @flywave/flywave.gl
```

or

```bash
yarn add @flywave/flywave.gl
```

## Quick Start

```javascript
import * as flywave from '@flywave/flywave.gl';

// Create map view
const mapView = new flywave.MapView({
  target: 'map-container',
  theme: 'dark'
});

// Add data source
const tileDataSource = new flywave.WebTileDataSource({
  name: 'basemap',
  tileUrls: ['https://example.com/tiles/{z}/{x}/{y}.png']
});

mapView.addDataSource(tileDataSource);
```

## Core Modules

This package includes all core modules of the flywave.gl project:

- `@flywave/flywave-mapview` - Map view core module
- `@flywave/flywave-terrain-datasource` - Terrain data source module
- `@flywave/flywave-map-controls` - Map control module
- `@flywave/flywave-3dtile-datasource` - 3D tile data source module
- `@flywave/flywave-datasource-protocol` - Data source protocol module
- `@flywave/flywave-draw-controls` - Drawing control module
- `@flywave/flywave-webtile-datasource` - Web tile data source module
- `@flywave/flywave-geoutils` - Geospatial utility module
- `@flywave/flywave-features-datasource` - Feature data source module
- `@flywave/flywave-utils` - Utility module
- `@flywave/flywave-vectortile-datasource` - Vector tile data source module
- `@flywave/flywave-inspector` - Debug inspection tool

## Documentation Resources

- [Full Documentation](https://flywave.net/docs) - API documentation, tutorials, best practices
- [Example Collection](https://flywave.net/examples) - Feature examples, code snippets
- [Official Website](https://flywave.net) - Project homepage, latest news
- [GitHub Repository](https://github.com/flywave/flywave.gl) - Source code, issue feedback

## Development

### Environment Requirements

| Tool | Version Requirement |
|------|-------------------|
| **Node.js** | >= 22.15.0 |
| **pnpm** | >= 9.0.0 |

### Installation and Build

```bash
# Install dependencies
pnpm install

# Build project
pnpm build
```

## License

Copyright © 2022-2025 [Flywave Project Authors](https://github.com/flywave)

Licensed under the [Apache License, Version 2.0](https://github.com/flywave/flywave.gl/blob/master/LICENSE).