# @flywave/react-native-gl

React Native adapter for flywave.gl - enables flywave.gl to run on React Native platforms.

## Features

-   ✅ Native React Native performance with expo-GL
-   ✅ Touch-optimized gesture handling (single/two-finger gestures)
-   ✅ Full compatibility with flywave.gl MapView and MapControls
-   ✅ No WebView - direct WebGL rendering
-   ✅ TypeScript support with full type safety

## Installation

```bash
npm install @flywave/react-native-gl
```

## Quick Start

### Basic Usage

```typescript
import { GLView } from "@flywave/react-native-gl";

function MapApp() {
    return <GLView style={{ flex: 1 }} theme="path/to/theme.json" />;
}
```

### Advanced Usage with Map Controls

```typescript
import { GLView } from "@flywave/react-native-gl";

function MapApp() {
    return (
        <GLView
            style={{ flex: 1 }}
            theme="path/to/theme.json"
            onContextCreate={(gl, mapView, controls) => {
                // Access MapView and MapControls instances
                console.log("MapView:", mapView);
                console.log("MapControls:", controls);

                // Configure controls
                controls.enabled = true;
            }}
        />
    );
}
```

## API Reference

### MapView

React Native version of the flywave.gl MapView.

```typescript
import { MapView } from "@flywave/react-native-gl";

const mapView = new MapView(webglContext, {
    theme: "path/to/theme.json",
    projection: "geographic"
    // ... other MapViewOptions
});
```

### MapControls

React Native-optimized map controls that extends the base MapControls with touch gesture support.

```typescript
import { MapControls, MapView } from "@flywave/react-native-gl";

const mapView = new MapView(webglContext, { theme: "..." });
const controls = new MapControls(mapView);

// Enable/disable controls
controls.enabled = true;
controls.enabled = false;

// Clean up when done
controls.dispose();
```

### GLView Component

React component wrapper for expo-GL with automatic MapView and MapControls setup.

#### Props

| Prop            | Type                            | Description                            |
| --------------- | ------------------------------- | -------------------------------------- |
| style           | React.CSSProperties             | Style for the GL view                  |
| theme           | string \| object                | Map theme configuration                |
| onContextCreate | (gl, mapView, controls) => void | Callback when WebGL context is created |

## Touch Gestures

The adapter supports the following touch gestures:

-   **Single finger drag** - Pan/Move the map
-   **Two-finger pinch** - Zoom in/out
-   **Two-finger drag** - Rotate/tilt the 3D view
-   **Single finger double tap** - Quick zoom to location

These gestures are automatically recognized and mapped to the appropriate map controls.

## Complete Example

```typescript
import React from "react";
import { StyleSheet, View } from "react-native";
import { GLView } from "@flywave/react-native-gl";

function App(): React.JSX.Element {
    return (
        <View style={styles.container}>
            <GLView
                style={styles.map}
                theme="path/to/your/theme.json"
                onContextCreate={(gl, mapView, controls) => {
                    console.log("Map initialized with controls:", controls);
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1
    },
    map: {
        flex: 1
    }
});

export default App;
```

## Comparison with Web Version

The React Native API is designed to be as similar as possible to the web version:

```typescript
// Web version
import { MapView, MapControls } from "@flywave/flywave";
const mapView = new MapView(canvas, options);
const controls = new MapControls(mapView);

// React Native version
import { MapView, MapControls } from "@flywave/react-native-gl";
const mapView = new MapView(webglContext, options);
const controls = new MapControls(mapView);
```

## Requirements

-   React Native 0.74+
-   expo 51+
-   expo-gl 14+

## Notes

-   The adapter handles the conversion between expo-GL's WebGL context and the HTMLCanvasElement interface expected by MapView
-   Touch gestures are automatically recognized and mapped to appropriate map control actions
-   Performance is optimized for mobile devices
-   Full TypeScript support with no `any` types
