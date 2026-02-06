# @flywave/heightmap-painter

An interactive heightmap painting tool library. Paint terrain on Leaflet maps and export heightmap data.

## Features

-   🎨 **Multiple Brush Types**: Raise, Lower, Smooth, Flatten, Noise
-   🗺️ **Multiple Basemaps**: Satellite, Street, Terrain
-   📐 **Precise Geo-coordinates**: Auto-records GeoBox of painted area
-   💾 **Multiple Export Formats**: PNG image + JSON data
-   🔄 **Real-time Preview**: Preview effects while painting
-   🎯 **Dual Mode Operation**: Separate drawing and navigation modes
-   🔧 **Event System**: Listen to brush and export events
-   📦 **TypeScript**: Complete type definitions
-   🎁 **Zero Configuration**: Works out of the box
-   🎨 **Full Control**: Manage DOM placement yourself

## Installation

```bash
npm install @flywave/heightmap-painter
```

## Peer Dependencies

This library requires these peer dependencies:

```bash
npm install leaflet react react-dom styled-components
```

## Optional Dependencies

For better area selection experience, install:

```bash
npm install @jonatanheyman/leaflet-areaselect
```

This will enable a draggable, resizable selection box on the map. Without it, you'll need to manually navigate the map to set the area.

## Usage

### Basic Usage

```typescript
import { HeightmapPainter } from "@flywave/heightmap-painter";

const painter = new HeightmapPainter({
    width: 1024,
    height: 1024
});

const element = painter.getElement();
document.body.appendChild(element);

painter.on("ready", () => {
    console.log("Heightmap painter is ready");
});

const data = painter.exportHeightmap();
console.log("Exported data:", data);

painter.destroy();
```

### Complete Example with DOM Control

```html
<!DOCTYPE html>
<html>
    <head>
        <style>
            body {
                margin: 0;
                padding: 0;
            }

            #my-container {
                width: 100vw;
                height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                background: #f0f0f0;
            }

            .painter-wrapper {
                border: 2px solid #333;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
        </style>
    </head>
    <body>
        <div id="my-container"></div>

        <script type="module">
            import { HeightmapPainter } from "@flywave/heightmap-painter";

            const painter = new HeightmapPainter({
                width: 1920,
                height: 1080,
                initialCenter: [39.9, 116.4],
                initialZoom: 13,
                basemap: "satellite"
            });

            const element = painter.getElement();
            element.className = "painter-wrapper";

            const container = document.getElementById("my-container");
            container.appendChild(element);

            painter.on("ready", () => {
                console.log("Painter initialized");
            });

            painter.on("brushStart", (x, y) => {
                console.log(`Brush start: ${x}, ${y}`);
            });

            painter.on("heightmapChange", data => {
                console.log(`Heightmap updated, size: ${data.length}`);
            });

            painter.on("export", data => {
                console.log("Exported:", {
                    width: data.width,
                    height: data.height,
                    geoBox: data.geoBox
                });
            });

            window.exportPNG = () => {
                const data = painter.exportHeightmap();
                if (data) {
                    data.imageData.toBlob(blob => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `heightmap_${Date.now()}.png`;
                        a.click();
                        URL.revokeObjectURL(url);
                    });
                }
            };

            window.setBrushType = type => {
                painter.updateBrushSettings({ type });
            };

            window.clearCanvas = () => {
                painter.clearCanvas();
            };
        </script>
    </body>
</html>
```

### Advanced DOM Management

```typescript
import { HeightmapPainter } from "@flywave/heightmap-painter";

class HeightmapEditor {
    private painter: HeightmapPainter;
    private container: HTMLElement;

    constructor(parentElement: HTMLElement) {
        this.painter = new HeightmapPainter({
            width: 1024,
            height: 1024,
            initialCenter: [39.9, 116.4],
            initialZoom: 13,
            basemap: "satellite"
        });

        const element = this.painter.getElement();

        this.container = document.createElement("div");
        this.container.className = "heightmap-editor";
        this.container.appendChild(element);

        parentElement.appendChild(this.container);

        this.setupEvents();
    }

    private setupEvents(): void {
        this.painter.on("ready", () => {
            console.log("Editor ready");
        });

        this.painter.on("heightmapChange", data => {
            this.onHeightmapChanged(data);
        });
    }

    private onHeightmapChanged(data: Float32Array): void {
        // Handle heightmap changes
    }

    public export(format: "png" | "json"): void {
        const data = this.painter.exportHeightmap();
        // Export logic
    }

    public destroy(): void {
        this.painter.destroy();
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
```

## API

### HeightmapPainter

Main class for managing the heightmap painting tool.

#### Constructor

```typescript
new HeightmapPainter(options: HeightmapPainterOptions)
```

**Options:**

```typescript
interface HeightmapPainterOptions {
    width?: number; // Canvas width (default: 1024)
    height?: number; // Canvas height (default: 1024)
    initialCenter?: [number, number]; // Initial center [lat, lon] (default: [39.9, 116.4])
    initialZoom?: number; // Initial zoom level (default: 13)
    basemap?: "satellite" | "street" | "terrain"; // Basemap type (default: "satellite")
}
```

#### Methods

##### getElement()

Get the root DOM element of the painter. You can append this element wherever you want.

```typescript
const element = painter.getElement();
document.body.appendChild(element);
// Or append to any container
myContainer.appendChild(element);
```

##### on(event, callback)

Register an event listener.

```typescript
painter.on("brushStart", (x: number, y: number) => {
    console.log("Brush started at:", x, y);
});
```

##### off(event, callback)

Remove an event listener.

```typescript
const callback = (x, y) => console.log(x, y);
painter.on("brushStart", callback);
painter.off("brushStart", callback);
```

##### exportHeightmap()

Export the current heightmap data.

```typescript
const data = painter.exportHeightmap();
// Returns: HeightmapExport | null
```

**HeightmapExport:**

```typescript
interface HeightmapExport {
    imageData: HTMLCanvasElement;
    geoBox: {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
    };
    width: number;
    height: number;
}
```

##### clearCanvas()

Clear all painted data.

```typescript
painter.clearCanvas();
```

##### updateBrushSettings(settings)

Update brush settings.

```typescript
painter.updateBrushSettings({
    type: BrushType.RAISE,
    size: 50,
    strength: 0.5,
    hardness: 0.5
});
```

##### getBrushSettings()

Get current brush settings.

```typescript
const settings = painter.getBrushSettings();
```

##### setMode(mode)

Set painter mode.

```typescript
painter.setMode("draw"); // Enable drawing
painter.setMode("navigate"); // Enable map navigation
```

##### getMap()

Get the underlying Leaflet map instance.

```typescript
const map = painter.getMap();
```

##### getBrushEngine()

Get the brush engine instance.

```typescript
const engine = painter.getBrushEngine();
```

##### destroy()

Destroy the painter instance and clean up resources.

```typescript
painter.destroy();
```

### Events

All available events:

```typescript
interface HeightmapPainterEvents {
    ready: () => void; // Fired when painter is ready
    destroy: () => void; // Fired when painter is destroyed
    brushStart: (x: number, y: number) => void; // Brush stroke started
    brushMove: (x: number, y: number) => void; // Brush moved
    brushEnd: () => void; // Brush stroke ended
    heightmapChange: (heightData: Float32Array) => void; // Heightmap data changed
    export: (data: HeightmapExport) => void; // Data exported
}
```

### Type Definitions

```typescript
enum BrushType {
    RAISE = "raise", // Raise terrain
    LOWER = "lower", // Lower terrain
    SMOOTH = "smooth", // Smooth terrain
    FLATTEN = "flatten", // Flatten terrain
    NOISE = "noise" // Add noise
}

interface BrushSettings {
    type: BrushType;
    size: number; // Brush size (5-200px)
    strength: number; // Brush strength (0.01-1.0)
    hardness: number; // Brush hardness (0.0-1.0)
    flattenHeight?: number; // Flatten height (flatten brush only)
}
```

## Integration with flywave.gl

```typescript
import { HeightmapPainter } from "@flywave/heightmap-painter";
import { GeoBox, GeoCoordinates, HeightMapBlendMode } from "@flywave/flywave.gl";

const painter = new HeightmapPainter({
    width: 1024,
    height: 1024
});

document.body.appendChild(painter.getElement());

painter.on("export", exportData => {
    const geoBox = new GeoBox(
        new GeoCoordinates(exportData.geoBox.minLat, exportData.geoBox.minLon),
        new GeoCoordinates(exportData.geoBox.maxLat, exportData.geoBox.maxLon)
    );

    const modifierId = manager.addModifier(
        { type: "image", image: exportData.imageData },
        geoBox,
        HeightMapBlendMode.ADD,
        1.0,
        { min: 0, max: 1000 }
    );
});
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run build:watch
```

## License

Apache-2.0
