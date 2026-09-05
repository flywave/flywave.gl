import {
    MapView,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    DEMTerrainSource,
    ArcGISTileProvider,
    MapViewEventNames
} from "@flywave/flywave.gl";
import { GUI } from "dat.gui";

import { BoxGeometry, Color, Mesh, MeshBasicNodeMaterial } from "three/webgpu";

/**
 * Night scene showcasing the fog light effect: point lights registered with
 * `mapView.addFogLight` glow through volumetric haze. Debug switches:
 * `?foglight=off` starts without the halo pass, `?night=off` starts at noon.
 */

const CENTER = new GeoCoordinates(36.4902, 118.1742, 300);

/** Shared with the GUI so slider positions reflect the URL-parameter state. */
const urlNight = new URLSearchParams(location.search).get("night") !== "off";
const urlFogLightOff = new URLSearchParams(location.search).get("foglight") === "off";

const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Map canvas element not found");
    }
    return canvas;
};

const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    return new MapView({
        target: CENTER,
        zoomLevel: 16,
        tilt: 40,
        heading: 1.2,
        canvas,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            lights: [],
            atmosphere: {
                enabled: true,
                // Late night: sun below horizon, moon + stars carry the sky.
                sunTime: new Date().setHours(urlNight ? 23 : 12, 30, 0, 0)
            },
            toneMappingExposure: urlNight ? 0.6 : 1,
            postEffects: {
                fogLight: {
                    enabled: !urlFogLightOff,
                    intensity: 1,
                    density: 0.002
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

/** City blocks — lit faces read as a small downtown at night. */
const addCityBlocks = (mapView: MapView): void => {
    const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0xffffff, 0x9b59b6];
    colors.forEach((color, i) => {
        const mesh = new Mesh(
            new BoxGeometry(60, 60, 160),
            new MeshBasicNodeMaterial({ color: new Color(color) })
        );
        mesh.position.setZ(80);
        mesh.rotateZ((i / colors.length) * Math.PI * 2);
        mesh.anchor = new GeoCoordinates(
            CENTER.lat + Math.sin((i / colors.length) * Math.PI * 2) * 0.0015,
            CENTER.lng + Math.cos((i / colors.length) * Math.PI * 2) * 0.002,
            500
        );
        mapView.mapAnchors.add(mesh);
    });
};

/**
 * Street lamps: an emissive head (feeds bloom) plus a matching fog light at
 * the same position — the halo comes from the effect, not the mesh.
 */
const addStreetLamps = (mapView: MapView): void => {
    const lampDefs = [
        { lat: CENTER.lat + 0.0008, lng: CENTER.lng - 0.001, color: 0xffb45c },
        { lat: CENTER.lat - 0.0008, lng: CENTER.lng + 0.001, color: 0xffb45c },
        { lat: CENTER.lat + 0.0008, lng: CENTER.lng + 0.0012, color: 0x9fd8ff },
        { lat: CENTER.lat - 0.0008, lng: CENTER.lng - 0.0012, color: 0x9fd8ff }
    ];

    for (const def of lampDefs) {
        const head = new Mesh(
            new BoxGeometry(8, 8, 8),
            new MeshBasicNodeMaterial({ color: new Color(def.color) })
        );
        head.anchor = new GeoCoordinates(def.lat, def.lng, 545);
        mapView.mapAnchors.add(head);

        mapView.addFogLight({
            position: new GeoCoordinates(def.lat, def.lng, 545),
            color: def.color,
            intensity: 1.5,
            radius: 60
        });
    }
};

const setupGui = (mapView: MapView, gui: GUI): void => {
    const state = {
        hour: urlNight ? 23 : 12.5,
        exposure: urlNight ? 0.6 : 1,
        fogLightEnabled: !urlFogLightOff,
        fogLightIntensity: 1,
        fogLightDensity: 0.002
    };

    const atmosphere = gui.addFolder("Night Scene");
    atmosphere.add(state, "hour", 0, 24, 0.25).name("sun hour").onChange(applyHour);
    atmosphere.add(state, "exposure", 0.05, 3, 0.05).onChange(applyExposure);
    atmosphere.open();

    const fog = gui.addFolder("Fog Light");
    fog.add(state, "fogLightEnabled").name("enabled").onChange(applyFogLight);
    fog.add(state, "fogLightIntensity", 0, 6, 0.05).name("intensity").onChange(applyFogLight);
    fog.add(state, "fogLightDensity", 0, 0.01, 0.0001).name("density").onChange(applyFogLight);
    fog.open();

    function applyHour(): void {
        const hours = Math.floor(state.hour);
        const minutes = Math.round((state.hour - hours) * 60);
        mapView.patchTheme({
            atmosphere: {
                sunTime: new Date().setHours(hours, minutes, 0, 0),
                sunTimeTransitionDuration: 0
            }
        });
        mapView.update();
    }

    function applyExposure(): void {
        mapView.patchTheme({ toneMappingExposure: state.exposure });
        mapView.update();
    }

    function applyFogLight(): void {
        mapView.patchTheme({
            postEffects: {
                fogLight: {
                    enabled: state.fogLightEnabled,
                    intensity: state.fogLightIntensity,
                    density: state.fogLightDensity
                }
            }
        });
        mapView.update();
    }
};

const main = async (): Promise<void> => {
    const canvas = getMapCanvas();
    const mapView = initializeMapView(canvas);
    window.__mapView = mapView;

    initializeMapControls(mapView, canvas);
    configureTerrain(mapView);

    addCityBlocks(mapView);
    addStreetLamps(mapView);

    mapView.addEventListener(MapViewEventNames.ThemeLoaded, () => {
        setupGui(mapView, new GUI());
    });
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
