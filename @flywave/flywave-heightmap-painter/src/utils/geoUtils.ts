import { GeoBox } from "../types";
import L from "leaflet";

export function calculateGeoBox(map: L.Map, width: number, height: number): GeoBox {
    const bounds = map.getBounds();

    return {
        minLon: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLon: bounds.getEast(),
        maxLat: bounds.getNorth()
    };
}

export function latLonToPixel(
    lat: number,
    lon: number,
    map: L.Map,
    canvasSize: { width: number; height: number }
): { x: number; y: number } {
    const point = map.latLngToContainerPoint([lat, lon]);
    return { x: point.x, y: point.y };
}

export function pixelToLatLon(x: number, y: number, map: L.Map): { lat: number; lon: number } {
    const latlng = map.containerPointToLatLng([x, y]);
    return { lat: latlng.lat, lon: latlng.lng };
}

export function geoBoxToBounds(geoBox: GeoBox): L.LatLngBounds {
    return L.latLngBounds([geoBox.minLat, geoBox.minLon], [geoBox.maxLat, geoBox.maxLon]);
}

export function formatCoordinate(value: number, type: "lat" | "lon"): string {
    const direction = type === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";

    const absValue = Math.abs(value);
    const degrees = Math.floor(absValue);
    const minutes = Math.floor((absValue - degrees) * 60);
    const seconds = ((absValue - degrees) * 60 - minutes) * 60;

    return `${degrees}°${minutes}'${seconds.toFixed(2)}"${direction}`;
}

export function calculatePixelDimensions(
    geoBox: GeoBox,
    zoom: number
): { width: number; height: number } {
    const latDiff = geoBox.maxLat - geoBox.minLat;
    const lonDiff = geoBox.maxLon - geoBox.minLon;

    const tileSize = 256;
    const maxLat = 85.0511287798;

    const latRad1 = (geoBox.minLat * Math.PI) / 180;
    const latRad2 = (geoBox.maxLat * Math.PI) / 180;

    const sinLat1 = Math.sin(latRad1);
    const sinLat2 = Math.sin(latRad2);

    const pixelX1 = (0.5 + (geoBox.minLon + 180) / 360) * tileSize * Math.pow(2, zoom);
    const pixelX2 = (0.5 + (geoBox.maxLon + 180) / 360) * tileSize * Math.pow(2, zoom);
    const pixelY1 =
        (0.5 - Math.log((1 + sinLat1) / (1 - sinLat1)) / (4 * Math.PI)) *
        tileSize *
        Math.pow(2, zoom);
    const pixelY2 =
        (0.5 - Math.log((1 + sinLat2) / (1 - sinLat2)) / (4 * Math.PI)) *
        tileSize *
        Math.pow(2, zoom);

    return {
        width: Math.abs(pixelX2 - pixelX1),
        height: Math.abs(pixelY2 - pixelY1)
    };
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
