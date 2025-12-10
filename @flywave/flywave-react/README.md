# @flywave/flywave-react

React wrapper for flywave.gl MapView with context provider.

## Overview

This package provides React components and hooks for integrating flywave.gl MapView into React applications. It includes:

- `MapProvider` - React Context Provider that manages MapView instance
- `MapCanvas` - React component that renders the map canvas
- `useMap` - React hook to access the MapView instance from any child component
- `useMapEffect` - React hook for running effects with MapView dependency
- Advanced hooks for zoom, camera, data sources, themes, and more

## Installation

```bash
npm install @flywave/flywave-react @flywave/flywave-mapview @flywave/flywave-map-controls
# or
yarn add @flywave/flywave-react @flywave/flywave-mapview @flywave/flywave-map-controls
# or
pnpm add @flywave/flywave-react @flywave/flywave-mapview @flywave/flywave-map-controls
```

## Quick Start

```tsx
import React from 'react';
import { MapProvider, MapCanvas, useMap } from '@flywave/flywave-react';

// Child component that uses the map
function MapInfoPanel() {
  const map = useMap();
  
  return (
    <div>
      <p>Zoom Level: {map?.zoomLevel.toFixed(2)}</p>
    </div>
  );
}

// Main App component
function App() {
  return (
    <MapProvider
      theme="resources/tilezen_base.json"
      decoderUrl="./decoder.bundle.js"
    >
      <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
        <MapCanvas />
        <MapInfoPanel />
      </div>
    </MapProvider>
  );
}

export default App;
```

## Examples

This package includes several examples:

### Basic Example
```tsx
import { BasicReactExample } from '@flywave/flywave-react';

// Renders a simple map with basic controls
<BasicReactExample />
```

### Advanced Example with Custom Hooks
```tsx
import { AdvancedReactExample } from '@flywave/flywave-react';

// Renders a map with advanced features using custom hooks
<AdvancedReactExample />
```

### Custom Implementation
```tsx
import { 
  MapProvider, 
  MapCanvas, 
  useMapZoom, 
  useMapCamera,
  useDataSource 
} from '@flywave/flywave-react';
import { VectorTileDataSource } from '@flywave/flywave-vectortile-datasource';

function CustomMapApp() {
  return (
    <MapProvider theme="your-theme.json">
      <MapCanvas />
      <ZoomControls />
      <DataSourceManager />
    </MapProvider>
  );
}

function ZoomControls() {
  const [zoomLevel, setZoom] = useMapZoom();
  
  return (
    <div>
      <button onClick={() => setZoom(zoomLevel + 1)}>Zoom In</button>
      <button onClick={() => setZoom(zoomLevel - 1)}>Zoom Out</button>
      <span>Zoom: {zoomLevel.toFixed(1)}</span>
    </div>
  );
}

function DataSourceManager() {
  const { dataSource, isLoading, error } = useDataSource(() => {
    return new VectorTileDataSource({
      baseUrl: "https://your-tiles-server.com",
      // ... other options
    });
  });
  
  if (isLoading) return <div>Loading data source...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return <div>Data source connected: {dataSource?.name}</div>;
}
```

## Documentation

- [Usage Guide](./USAGE.md) - Detailed usage instructions and best practices
- [Integration Example](./integration-example/) - Complete Create React App integration example
- [API Reference](#api) - Full API documentation

## Features

✅ **TypeScript Support** - Full TypeScript definitions included  
✅ **React 18 Compatible** - Works with latest React features  
✅ **Context-based** - Clean and efficient state management  
✅ **Custom Hooks** - Powerful hooks for common map operations  
✅ **Error Boundaries** - Built-in error handling  
✅ **Performance Optimized** - Minimal re-renders and efficient updates  
✅ **Responsive** - Automatic canvas resizing  
✅ **Accessibility** - ARIA labels and keyboard navigation support  

### MapProvider

React Context Provider that creates and manages a MapView instance.

```tsx
interface MapProviderProps {
  children: React.ReactNode;
  theme?: string | Theme;
  decoderUrl?: string;
  canvas?: HTMLCanvasElement;
  // ... other MapView options
}

<MapProvider theme="your-theme.json" decoderUrl="./decoder.bundle.js">
  {children}
</MapProvider>
```

### MapCanvas

React component that renders the map canvas and initializes the MapView.

```tsx
interface MapCanvasProps {
  style?: React.CSSProperties;
  className?: string;
  onMapInitialized?: (mapView: MapView) => void;
}

<MapCanvas 
  style={{ width: '100%', height: '400px' }}
  onMapInitialized={(map) => console.log('Map ready:', map)}
/>
```

### useMap

React hook to access the MapView instance from any child component.

```tsx
function MyComponent() {
  const map = useMap();
  
  useEffect(() => {
    if (map) {
      // Use map instance
      map.lookAt({ target: new GeoCoordinates(52.518611, 13.376111), zoomLevel: 10 });
    }
  }, [map]);
  
  return <div>My Map Component</div>;
}
```

### useMapEffect

React hook for running effects that depend on the MapView instance.

```tsx
function MyComponent() {
  useMapEffect((map) => {
    // This runs when map is available
    const controls = new MapControls(map);
    
    return () => {
      // Cleanup
      controls.dispose();
    };
  }, []);
  
  return <div>My Component</div>;
}
```

## Advanced Usage

### Adding Data Sources

```tsx
function DataSourceComponent() {
  useMapEffect((map) => {
    const dataSource = new VectorTileDataSource({
      baseUrl: "https://your-tiles-server.com",
      // ... other options
    });
    
    map.addDataSource(dataSource);
    
    return () => {
      map.removeDataSource(dataSource);
    };
  }, []);
  
  return null;
}
```

### Custom Map Controls

```tsx
function CustomControls() {
  const map = useMap();
  
  const zoomIn = () => map?.zoomLevel && (map.zoomLevel += 1);
  const zoomOut = () => map?.zoomLevel && (map.zoomLevel -= 1);
  
  return (
    <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
      <button onClick={zoomIn}>+</button>
      <button onClick={zoomOut}>-</button>
    </div>
  );
}
```

## License

Apache-2.0