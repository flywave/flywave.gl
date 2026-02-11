import type { MapView } from "@flywave/flywave.gl";

export namespace L {
    export type Map = MapView;
}

export interface GeoBox {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
}

export interface HeightmapExport {
    imageData: ImageData | HTMLCanvasElement;
    geoBox: GeoBox;
    width: number;
    height: number;
}

export enum BrushType {
    RAISE = "raise",
    LOWER = "lower",
    SMOOTH = "smooth",
    FLATTEN = "flatten",
    NOISE = "noise"
}

export interface BrushSettings {
    type: BrushType;
    size: number;
    sizeUnit: "meters" | "pixels";
    strength: number;
    hardness: number;
    flattenHeight?: number;
}

export interface PainterEventTypes {
    "brush:start": (x: number, y: number) => void;
    "brush:move": (x: number, y: number) => void;
    "brush:end": () => void;
    "heightmap:change": (heightData: Float32Array) => void;
    "export:ready": (exportData: HeightmapExport) => void;
}

export interface PainterOptions {
    width: number;
    height: number;
    initialZoom?: number;
    initialCenter?: [number, number];
    basemap?: "satellite" | "street" | "terrain";
    paintAreaGeoBox?: GeoBox;
}
