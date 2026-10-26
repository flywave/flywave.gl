/* Copyright (C) 2025 flywave.gl contributors */

import {
    type ILogger,
    type MapView,
    ArcGISTileProvider,
    DEMTerrainSource,
    GeoBox,
    GeoCoordinates,
    LoggerManager
} from "@flywave/flywave.gl";

import { applyPanelStyle, createExampleGui, createExampleMap, logExampleInfo } from "../common";

const logger: ILogger = LoggerManager.instance.create(
    "flywave-examples/terrain-ground-modification"
);

/** Camera pose overlooking the three modification areas. */
const LOOK_AT = {
    target: { lat: 36.41, lng: 118.1 },
    zoomLevel: 14.5,
    tilt: 55,
    heading: 0
};

/** Pixel size shared by all generated modifier images. */
const IMAGE_SIZE = 256;

/**
 * Encode a height DELTA (meters) into a mapbox terrain-RGB pixel.
 *
 * The GPU compositor decodes every modifier pixel with
 * `rgb * (6553.6, 25.6, 0.1) - 10000` and ADDS the result to the base DEM
 * height. Writing `10000 + delta` therefore yields the intended delta;
 * a delta of 0 (the no-op background) is encoded as exactly 10000 m.
 * (The legacy demo claimed "absolute heights", which only works through the
 * same -10000 offset and produces huge unintended trenches - corrected here.)
 *
 * @param delta - Height change in meters.
 * @returns RGBA pixel with full alpha.
 */
function encodeMapboxDelta(delta: number): [number, number, number, number] {
    return encodeMapboxHeight(10000 + delta);
}

/** Mapbox terrain-RGB encoding of an absolute height (see encodeMapboxDelta). */
function encodeMapboxHeight(height: number): [number, number, number, number] {
    const v = Math.floor((height + 10000.0) / 0.1);
    return [Math.floor(v / 65536), Math.floor(v / 256) % 256, v % 256, 255];
}

/**
 * Rasterize a per-pixel delta function into mapbox-encoded ImageData.
 *
 * @param deltaAt - Returns the height delta in meters at pixel (x, y).
 * @returns The modifier image ready for `addModifier`.
 */
function paintDeltas(deltaAt: (x: number, y: number) => number): ImageData {
    const image = new ImageData(IMAGE_SIZE, IMAGE_SIZE);
    for (let y = 0; y < IMAGE_SIZE; y++) {
        for (let x = 0; x < IMAGE_SIZE; x++) {
            const [r, g, b, a] = encodeMapboxDelta(deltaAt(x, y));
            const idx = (y * IMAGE_SIZE + x) * 4;
            image.data[idx] = r;
            image.data[idx + 1] = g;
            image.data[idx + 2] = b;
            image.data[idx + 3] = a;
        }
    }
    return image;
}

/** Stepped wall: a north-south strip with three height steps (+150/+300/+450 m). */
function paintSteppedWall(): ImageData {
    const left = IMAGE_SIZE * 0.3;
    const right = IMAGE_SIZE * 0.7;
    return paintDeltas((x, y) => {
        if (x < left || x >= right) {
            return 0;
        }
        const step = Math.min(2, Math.floor((y / IMAGE_SIZE) * 3));
        return 150 * (step + 1);
    });
}

/** Flat platform: a raised elliptical pad (+200 m) with a no-op surround. */
function paintPlatform(): ImageData {
    const half = IMAGE_SIZE / 2;
    return paintDeltas((x, y) => {
        const dx = (x - half) / (half * 0.8);
        const dy = (y - half) / (half * 0.8);
        return dx * dx + dy * dy <= 1 ? 200 : 0;
    });
}

/** Trench: a horizontal excavated channel (-120 m) with a no-op surround. */
function paintTrench(): ImageData {
    const top = IMAGE_SIZE * 0.4;
    const bottom = IMAGE_SIZE * 0.6;
    return paintDeltas((x, y) => (y >= top && y < bottom ? -120 : 0));
}

/** Declarative description of one demo modifier. */
interface IModifierSpec {
    id: string;
    label: string;
    geoBox: GeoBox;
    paint: () => ImageData;
}

/** The three demo modifiers, laid out side by side inside the initial view. */
const MODIFIER_SPECS: IModifierSpec[] = [
    {
        id: "stepped-wall",
        label: "Stepped wall",
        geoBox: new GeoBox(
            new GeoCoordinates(36.397, 118.078),
            new GeoCoordinates(36.403, 118.082)
        ),
        paint: paintSteppedWall
    },
    {
        id: "platform",
        label: "Flat platform",
        geoBox: new GeoBox(
            new GeoCoordinates(36.408, 118.108),
            new GeoCoordinates(36.412, 118.112)
        ),
        paint: paintPlatform
    },
    {
        id: "trench",
        label: "Trench",
        geoBox: new GeoBox(
            new GeoCoordinates(36.418, 118.094),
            new GeoCoordinates(36.422, 118.106)
        ),
        paint: paintTrench
    }
];

/**
 * Add the three image modifiers to the terrain source.
 *
 * @param terrain - The DEM terrain source to modify.
 */
function addAllModifiers(terrain: DEMTerrainSource): void {
    const manager = terrain.getGroundModificationManager();
    MODIFIER_SPECS.forEach(spec => {
        // Only the "image" source type is demonstrated here; the manager also
        // accepts "url" and raw "data" arrays (see HeightMapSourceData).
        manager.addModifier(spec.id, { type: "image", image: spec.paint() }, spec.geoBox);
        logger.info(`Added ground modifier "${spec.id}"`);
    });
}

/**
 * GUI: per-modifier enable toggles plus clear/restore buttons.
 *
 * @param terrain - The DEM terrain source owning the modifiers.
 * @param mapView - The view to refresh after each change.
 */
function buildGui(terrain: DEMTerrainSource, mapView: MapView): void {
    const manager = terrain.getGroundModificationManager();
    const gui = createExampleGui();
    const folder = gui.addFolder("Ground modifiers");
    MODIFIER_SPECS.forEach(spec => {
        folder
            .add({ enabled: true }, "enabled")
            .name(spec.label)
            .onChange((enabled: boolean) => {
                manager.updateModifier(spec.id, { enabled });
                mapView.update();
            });
    });
    folder
        .add(
            {
                clear: () => {
                    manager.clear();
                    mapView.update();
                }
            },
            "clear"
        )
        .name("Clear all");
    folder
        .add(
            {
                restore: () => {
                    addAllModifiers(terrain);
                    mapView.update();
                }
            },
            "restore"
        )
        .name("Restore all");
    folder.open();

    const note = document.createElement("div");
    note.style.cssText =
        "position:absolute;left:16px;bottom:16px;max-width:360px;padding:10px 14px;" +
        "color:#ddd;font:12px/1.6 sans-serif;white-space:pre-line";
    applyPanelStyle(note);
    note.textContent =
        "Image modifiers composite onto the DEM as height DELTAS: pixel value " +
        "10000 + delta (meters), mapbox terrain-RGB encoded, added by the GPU.\n" +
        "The image modifier composites height DELTAS: pixels encode 10000 + delta (meters).";
    document.body.appendChild(note);
}

/**
 * Example entry point: map -> DEM terrain with modifiers -> GUI.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
    }

    const handle = await createExampleMap(canvas, {
        projection: "globe",
        lookAt: LOOK_AT,
        themeObject: {
            extends: "resources/tilezen_base_globe.json",
            atmosphere: { enabled: true }
        },
        onReady: view => logExampleInfo("terrain-ground-modification", view)
    });

    // A DEM description covering the whole globe at low zoom is enough for
    // the demo; the bundled offline DEM tiles do not reach the modifier area.
    const terrain = new DEMTerrainSource({
        source: {
            tiles: [],
            scheme: "xyz",
            bounds: [-180, -85.0511, 180, 85.0511],
            minzoom: 0,
            maxzoom: 15,
            tileSize: 256,
            type: "raster-dem"
        }
    });
    addAllModifiers(terrain);
    await handle.mapView.setElevationSource(terrain);
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    buildGui(terrain, handle.mapView);
}

void main().catch((error: unknown) => {
    logger.error("Failed to initialize terrain-ground-modification example:", String(error));
});
