# Flywave React Native Examples

React Native examples demonstrating flywave.gl 3D map rendering capabilities on mobile platforms.

## Features

-   📱 Native React Native performance with expo-GL
-   🎨 Touch-optimized gesture handling (single/two-finger gestures)
-   🌍 Full compatibility with flywave.gl MapView and MapControls
-   🔗 No WebView - direct WebGL rendering
-   ✅ TypeScript support with full type safety

## Prerequisites

-   Node.js >= 22.15.0
-   pnpm >= 9.0.0
-   Expo CLI installed globally: `npm install -g expo-cli`

## Getting Started

### Installation

```bash
# Install dependencies
pnpm install

# For development in iOS simulator
pnpm start

# For development in Android emulator
pnpm android

# For web development
pnpm web
```

### Basic Usage

```typescript
import { GLView } from "@flywave/react-native-gl";

function MapApp() {
    const handleContextCreate = (gl: unknown, mapView: unknown): void => {
        console.log("Map initialized");
    };

    return (
        <GLView
            style={{ flex: 1 }}
            theme={{
                version: "1.0.0",
                name: "Example Theme",
                styles: [],
                background: {
                    color: [1.0, 1.0, 1.0, 1.0]
                }
            }}
            onContextCreate={handleContextCreate}
        />
    );
}
```

## Examples

### Current Example

-   **Basic Map View**: Demonstrates the simplest flywave.gl React Native integration with basic theme configuration.

### Coming Soon

-   3D Tiles loading
-   Terrain visualization
-   Custom themes
-   Map controls interaction
-   Advanced gesture handling

## Platform Support

-   ✅ iOS (via Expo)
-   ✅ Android (via Expo)
-   ✅ Web (via Expo web)

## Important Notes

-   **Network Loading Only**: This example uses network loading for 3D tiles data
-   **Absolute URLs Required**: React Native requires absolute URLs (https://...) for tileset loading
-   **Expo Go**: You can test this example using the Expo Go app on your device

## Troubleshooting

### iOS Build Issues

```bash
# Clean iOS build
cd ios && pod install && cd ..

# Rebuild
pnpm start --ios
```

### Android Build Issues

```bash
# Clean Android build
cd android && ./gradlew clean && cd ..

# Rebuild
pnpm start --android
```

## License

Apache License 2.0 - See LICENSE file for details

## Contributing

See the main flywave.gl repository for contribution guidelines.
