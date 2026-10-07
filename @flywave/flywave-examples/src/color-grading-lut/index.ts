import {
    ArcGISTileProvider,
    DEMTerrainSource,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    MapView,
    MapViewEventNames
} from "@flywave/flywave.gl";
import { GUI } from "dat.gui";
import { BoxGeometry, Color, Mesh, MeshBasicNodeMaterial } from "three/webgpu";

import { shouldForceWebGL } from "../common-webgl-debug";

/**
 * Built-in LUT presets shipped in `flywave-map-theme/resources/lut/` and
 * served next to the other runtime assets (`resources/lut/**`). Relative
 * paths resolve through the MapView uriResolver at apply time.
 */
const LUT_PRESETS: Record<string, string> = {
    None: "",
    "PresetPro Cinematic (.3dl)": "resources/lut/presetpro-cinematic.3dl",
    "Django 25 (.cube)": "resources/lut/django-25.cube",
    "Blackmagic 4.6K Film (.cube)": "resources/lut/blackmagic-4.6k-film-extended-video.cube",
    "Fuji 160C": "resources/lut/fuji-160c.png",
    "Fuji 800Z": "resources/lut/fuji-800z.png",
    "Fuji FP-100C": "resources/lut/fuji-fp100c.png",
    "Kodak E-100 GX": "resources/lut/kodak-e100-gx.png",
    "Agfa Vista 200": "resources/lut/agfa-vista-200.png",
    "Agfa Precisa 100": "resources/lut/agfa-precisa-100.png",
    "Agfa Ultra Color 100": "resources/lut/agfa-ultra-color-100.png"
};

const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Map canvas element not found");
    }
    return canvas;
};

const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    const initialLocation = new GeoCoordinates(36.4902, 118.1742, 900);
    // Debug switch: ?lut=off loads without the LUT effect; ?lut=neutral
    // enables the LUT node but never loads a file (stays on the neutral LUT).
    const lutParam = new URLSearchParams(location.search).get("lut");
    const lutOff = lutParam === "off";
    const lutNeutral = lutParam === "neutral";

    return new MapView({
        forceWebGL: shouldForceWebGL(),
        target: initialLocation,
        zoomLevel: 16,
        tilt: 40,
        heading: 1.2,
        canvas,
        theme: {
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
        }
    });
};

const initializeMapControls = (mapView: MapView, canvas: HTMLCanvasElement): void => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    canvas.parentElement!.appendChild(ui.domElement);
};

const configureTerrain = (mapView: MapView): void => {
    const demTerrain = new DEMTerrainSource({
        source: "dem_terrain/source.json"
    });
    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(
        new ArcGISTileProvider({
            minDataLevel: 0,
            maxDataLevel: 18
        })
    );
};

/** Colorful reference blocks — LUT grading shows up clearly on flat colors. */
const addReferenceBlocks = (mapView: MapView): void => {
    const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0xffffff, 0x9b59b6];
    colors.forEach((color, i) => {
        const mesh = new Mesh(
            new BoxGeometry(60, 60, 160),
            new MeshBasicNodeMaterial({ color: new Color(color) })
        );
        mesh.position.setZ(80);
        mesh.rotateZ((i / colors.length) * Math.PI * 2);
        mesh.anchor = new GeoCoordinates(
            36.4902 + Math.sin((i / colors.length) * Math.PI * 2) * 0.0015,
            118.1742 + Math.cos((i / colors.length) * Math.PI * 2) * 0.002,
            500
        );
        mapView.mapAnchors.add(mesh);
    });
};

const setupLutGui = (mapView: MapView, gui: GUI): void => {
    const state = {
        enabled: true,
        preset: "Fuji 160C",
        opacity: 1
    };

    const applyLut = (): void => {
        // patchTheme deep-merges postEffects; url resolution to the served
        // asset happens inside MapView (uriResolver chain, same as themes).
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
};

const main = async (): Promise<void> => {
    const canvas = getMapCanvas();
    const mapView = initializeMapView(canvas);
    window.__mapView = mapView;

    initializeMapControls(mapView, canvas);
    configureTerrain(mapView);

    mapView.addEventListener(MapViewEventNames.ThemeLoaded, () => {
        const gui = new GUI();
        setupLutGui(mapView, gui);
    });

    addReferenceBlocks(mapView);
};

main();

/**
 * MapView instance attached for debugging in the browser console.
 */
declare global {
    interface Window {
        __mapView: MapView;
    }
}
