/* Copyright (C) 2025 flywave.gl contributors */

import { mapAssetsUriResolver, mapBundleMain } from "./BundleMain";
import * as THREE from "three/webgpu";
import { imageLoader } from "@flywave/flywave-gltf";

const win = window as Window & { THREE?: typeof THREE };
if (!win.THREE) {
    win.THREE = THREE;
}

import { MapView as RawMapView, MapViewOptions } from "@flywave/flywave-mapview";

export * from "@flywave/flywave-mapview";
export * from "@flywave/flywave-mapview-decoder";
export * from "@flywave/flywave-draped-draw";
export * from "@flywave/flywave-terrain-datasource";
export * from "@flywave/flywave-map-controls";
export * from "@flywave/flywave-3dtile-datasource";
export * from "@flywave/flywave-datasource-protocol";
export * from "@flywave/flywave-draw-controls";
export * from "@flywave/flywave-webtile-datasource";
export * from "@flywave/flywave-geoutils";
export * from "@flywave/flywave-features-datasource";
export * from "@flywave/flywave-geojson-datasource";
export * from "@flywave/flywave-utils";
export * from "@flywave/flywave-vectortile-datasource";
export * from "@flywave/flywave-inspector";
export * from "@flywave/flywave-gltf";
export * from "@flywave/flywave-transfer-manager";
export * from "@flywave/flywave-geometry";
export {
    FontCatalog,
    TextCanvas,
    ContextualArabicConverter,
    TextRenderStyle,
    TextLayoutStyle,
    FontStyle,
    FontUnit,
    FontVariant,
    VerticalAlignment,
    HorizontalAlignment
} from "@flywave/flywave-text-canvas";

export class MapView extends RawMapView {
    constructor(options: Omit<MapViewOptions, "uriResolver">) {
        super({
            ...options,
            uriResolver: mapAssetsUriResolver
        });

        this.ready.then(() => {
            imageLoader.configure(this.renderer as any, mapAssetsUriResolver);
        });
    }
}
mapBundleMain();
