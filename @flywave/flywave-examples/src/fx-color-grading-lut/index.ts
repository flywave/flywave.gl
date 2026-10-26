/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Color grading LUT example: a 3D LUT (`.cube` / `.3dl` file or a film
 * simulation PNG) is applied to the final tone-mapped image through
 * `theme.postEffects.colorGradingLUT`, and switched at runtime with
 * `mapView.patchTheme`. Colorful reference blocks make the grading readable.
 *
 * Debug switches (see {@link setupLutGui} for the runtime controls):
 * - `?lut=off` — start without the LUT effect at all.
 * - `?lut=neutral` — enable the LUT node but load no file (neutral image).
 */

import {
    ArcGISTileProvider,
    GeoCoordinates,
    type MapAnchor,
    MapView,
    type Theme
} from "@flywave/flywave.gl";

import { BoxGeometry, Color, Mesh, MeshBasicNodeMaterial } from "three/webgpu";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    LUT_PRESETS,
    logExampleInfo,
    type LutPresetName
} from "../common";

/** Scene center (Shandong, China). */
const CENTER = { lat: 36.4902, lng: 118.1742 };

/** GUI state mirrored onto the theme via {@link patchTheme}. */
interface ILutState {
    enabled: boolean;
    preset: LutPresetName;
    opacity: number;
}

/**
 * Add flat-colored blocks around the center; LUT grading is easiest to read
 * on saturated, uniformly lit surfaces.
 */
function addReferenceBlocks(mapView: MapView): void {
    const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0xffffff, 0x9b59b6];
    colors.forEach((color, i) => {
        const angle = (i / colors.length) * Math.PI * 2;
        const block: MapAnchor<Mesh> = new Mesh(
            new BoxGeometry(60, 60, 160),
            new MeshBasicNodeMaterial({ color: new Color(color) })
        );
        block.position.setZ(80);
        block.rotateZ(angle);
        block.anchor = new GeoCoordinates(
            CENTER.lat + Math.sin(angle) * 0.0015,
            CENTER.lng + Math.cos(angle) * 0.002,
            500
        );
        mapView.mapAnchors.add(block);
    });
}

/**
 * Wire the dat.GUI folder that applies the LUT through `patchTheme`. The
 * patch deep-merges `postEffects`, and the LUT url resolves through the
 * MapView uriResolver just like theme assets.
 */
function setupLutGui(mapView: MapView): void {
    const state: ILutState = {
        enabled: mapView.postEffects?.colorGradingLUT?.enabled ?? true,
        preset: "Fuji 160C",
        opacity: 1
    };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    const applyLut = (): void => {
        mapView.patchTheme({
            postEffects: {
                colorGradingLUT: {
                    enabled: state.enabled,
                    url: LUT_PRESETS[state.preset],
                    opacity: state.opacity
                }
            }
        });
        mapView.update();
    };

    const folder = gui.addFolder("Color Grading LUT");
    folder.add(state, "enabled").onChange(applyLut);
    folder.add(state, "preset", Object.keys(LUT_PRESETS)).onChange(applyLut);
    folder.add(state, "opacity", 0, 1, 0.01).onChange(applyLut);
    folder.open();
}

/**
 * Example entry: create the map, add terrain + reference blocks and the LUT
 * control panel.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    // Debug switches: ?lut=off skips the effect entirely; ?lut=neutral keeps
    // the LUT node enabled but loads no file, so the image stays unchanged.
    const lutParam = new URLSearchParams(location.search).get("lut");
    const lutOff = lutParam === "off";
    const lutNeutral = lutParam === "neutral";

    const theme: Theme = {
        extends: "resources/tilezen_base_globe.json",
        lights: [],
        atmosphere: {
            enabled: true,
            sunTime: new Date().setHours(17, 30, 0, 0)
        },
        postEffects: lutOff
            ? undefined
            : {
                  colorGradingLUT: {
                      enabled: true,
                      url: lutNeutral ? "" : LUT_PRESETS["Fuji 160C"],
                      opacity: 1
                  }
              }
    };

    const { mapView } = await createExampleMap(canvas, {
        themeObject: theme,
        lookAt: {
            target: { ...CENTER, alt: 900 },
            zoomLevel: 16,
            tilt: 40,
            heading: 1.2
        }
    });
    logExampleInfo("fx-color-grading-lut", mapView);

    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    // The LUT panel (and any patchTheme call) needs the resolved theme; this
    // await is race-free even if ThemeLoaded already fired during renderer
    // initialization.
    await mapView.getTheme();
    setupLutGui(mapView);
}

void main();
