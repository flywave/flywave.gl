# Custom WebTile Data Source

The `CustomWebTileDataSource` allows you to use custom web map tile services with flywave.gl. This is useful when you want to use your own tile server or a third-party tile service that is not supported by the built-in data sources.

## Usage

To use the `CustomWebTileDataSource`, you need to provide a URL template that specifies how to construct the URLs for the tiles. The template can contain placeholders that will be replaced with actual values when requesting tiles.

### Basic Example

```typescript
import { CustomWebTileDataSource } from "@flywave/flywave-webtile-datasource";

const customDataSource = new CustomWebTileDataSource({
    tileUrlTemplate: "https://example.com/tiles/{z}/{x}/{y}.png"
});

mapView.addDataSource(customDataSource);
```

### URL Template Placeholders

The following placeholders are supported in the URL template:

- `{z}` - Zoom level
- `{x}` - Tile X coordinate (in XYZ scheme)
- `{y}` - Tile Y coordinate (in XYZ scheme)
- `{-y}` - Tile Y coordinate (in TMS scheme)
- `{s}` - Subdomain (when using subdomains)

### Advanced Example with Options

```typescript
const customDataSource = new CustomWebTileDataSource({
    tileUrlTemplate: "https://{s}.example.com/tiles/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
    copyrightInfo: {
        id: "example-tiles",
        year: new Date().getFullYear(),
        label: "Example Tile Service",
        link: "https://example.com/copyright"
    },
    minZoomLevel: 0,
    maxZoomLevel: 18,
    headers: {
        "Authorization": "Bearer your-token-here"
    }
});

mapView.addDataSource(customDataSource);
```

### Options

The `CustomWebTileDataSource` accepts the following options:

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `tileUrlTemplate` | string | URL template for tile requests (required) | - |
| `subdomains` | string[] | Subdomains for load balancing | [] |
| `copyrightInfo` | CopyrightInfo | Copyright information for the tiles | Default copyright |
| `headers` | RequestHeaders | HTTP headers to send with requests | {} |
| `minZoomLevel` | number | Minimum zoom level | 0 |
| `maxZoomLevel` | number | Maximum zoom level | 20 |

## Coordinate Systems

The `CustomWebTileDataSource` supports both XYZ and TMS coordinate systems:

- **XYZ**: Uses `{x}` and `{y}` placeholders (standard OSM/Google Maps scheme)
- **TMS**: Uses `{x}` and `{-y}` placeholders (inverted Y axis)

## Examples

### OpenStreetMap Tiles

```typescript
const osmDataSource = new CustomWebTileDataSource({
    tileUrlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
    copyrightInfo: {
        id: "openstreetmap",
        year: new Date().getFullYear(),
        label: "OpenStreetMap contributors",
        link: "https://www.openstreetmap.org/copyright"
    }
});
```

### Mapbox Tiles

```typescript
const mapboxDataSource = new CustomWebTileDataSource({
    tileUrlTemplate: "https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.png?access_token=YOUR_ACCESS_TOKEN",
    copyrightInfo: {
        id: "mapbox",
        year: new Date().getFullYear(),
        label: "Mapbox",
        link: "https://www.mapbox.com/about/maps/"
    }
});
```

## Error Handling

If the tile URL template is not provided, the constructor will throw an error. Make sure to always provide a valid URL template.

```typescript
// This will throw an error
const invalidDataSource = new CustomWebTileDataSource({}); // Error: tileUrlTemplate is required
```