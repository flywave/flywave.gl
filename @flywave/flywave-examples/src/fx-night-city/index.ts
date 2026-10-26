/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Night city showcase combining the full night toolkit: the volumetric fog
 * light effect (`theme.postEffects.fogLight` + `mapView.addFogLight`), bloom
 * over emissive surfaces, a dim night light rig (`theme.lights`) and tone
 * mapping exposure. Debug switches: `?foglight=off` starts without the halo
 * pass, `?night=off` starts at noon.
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
    logExampleInfo
} from "../common";

/** Scene center (Shandong, China). */
const CENTER = { lat: 36.4902, lng: 118.1742 };

/** URL-parameter start state, shared with the GUI so sliders match it. */
const START_NIGHT = new URLSearchParams(location.search).get("night") !== "off";
const START_FOG_LIGHT = new URLSearchParams(location.search).get("foglight") !== "off";

/** Default bloom / fog-light parameters; the GUI writes back into copies. */
const DEFAULTS = {
    bloomStrength: 1.2,
    fogLightIntensity: 1,
    fogLightDensity: 0.002,
    exposure: 0.6,
    hour: 23
};

/**
 * Night light rig: a faint blue ambient fill plus a moonlight directional.
 * Together with the low `toneMappingExposure` this keeps unlit geometry
 * readable while the emissive lamp heads and fog-light halos carry the scene.
 */
function buildTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        lights: [
            {
                type: "ambient",
                name: "night-ambient",
                color: "#1a2340",
                intensity: START_NIGHT ? 0.6 : 1.2
            },
            {
                type: "directional",
                name: "moonlight",
                color: "#8ea6c8",
                intensity: START_NIGHT ? 0.5 : 1.5,
                direction: { x: 0.3, y: -1, z: 0.4 }
            }
        ],
        atmosphere: {
            enabled: true,
            // Late night: sun below horizon, moon + stars carry the sky.
            sunTime: new Date().setHours(START_NIGHT ? DEFAULTS.hour : 12, 30, 0, 0)
        },
        toneMappingExposure: START_NIGHT ? DEFAULTS.exposure : 1,
        postEffects: {
            bloom: {
                enabled: true,
                strength: DEFAULTS.bloomStrength,
                luminancePassThreshold: 0.5,
                radius: 0.8
            },
            fogLight: {
                enabled: START_FOG_LIGHT,
                intensity: DEFAULTS.fogLightIntensity,
                density: DEFAULTS.fogLightDensity
            }
        }
    };
}

/**
 * City blocks: unlit emissive-looking boxes — their bright faces read as a
 * small downtown at night and feed the bloom pass.
 */
function addCityBlocks(mapView: MapView): void {
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
 * Street lamps: an emissive head (feeds bloom) plus a matching fog light at
 * the same position — the halo comes from the effect, not the mesh.
 */
function addStreetLamps(mapView: MapView): void {
    const lampDefs = [
        { lat: CENTER.lat + 0.0008, lng: CENTER.lng - 0.001, color: 0xffb45c },
        { lat: CENTER.lat - 0.0008, lng: CENTER.lng + 0.001, color: 0xffb45c },
        { lat: CENTER.lat + 0.0008, lng: CENTER.lng + 0.0012, color: 0x9fd8ff },
        { lat: CENTER.lat - 0.0008, lng: CENTER.lng - 0.0012, color: 0x9fd8ff }
    ];

    for (const def of lampDefs) {
        const head: MapAnchor<Mesh> = new Mesh(
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
}

/**
 * Wire the night-scene control panel: sun time + exposure, fog light tuning
 * and bloom strength, all applied through `patchTheme`.
 */
function setupNightCityGui(mapView: MapView): void {
    const state = {
        hour: START_NIGHT ? DEFAULTS.hour : 12.5,
        exposure: START_NIGHT ? DEFAULTS.exposure : 1,
        fogLightEnabled: START_FOG_LIGHT,
        fogLightIntensity: DEFAULTS.fogLightIntensity,
        fogLightDensity: DEFAULTS.fogLightDensity,
        bloomEnabled: true,
        bloomStrength: DEFAULTS.bloomStrength
    };

    const applyHour = (): void => {
        const hours = Math.floor(state.hour);
        const minutes = Math.round((state.hour - hours) * 60);
        mapView.patchTheme({
            atmosphere: {
                sunTime: new Date().setHours(hours, minutes, 0, 0),
                sunTimeTransitionDuration: 0
            }
        });
        mapView.update();
    };

    const applyExposure = (): void => {
        mapView.patchTheme({ toneMappingExposure: state.exposure });
        mapView.update();
    };

    const applyFogLight = (): void => {
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
    };

    const applyBloom = (): void => {
        mapView.patchTheme({
            postEffects: {
                bloom: { enabled: state.bloomEnabled, strength: state.bloomStrength }
            }
        });
        mapView.update();
    };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    const scene = gui.addFolder("Night Scene");
    scene.add(state, "hour", 0, 24, 0.25).name("sun hour").onChange(applyHour);
    scene.add(state, "exposure", 0.05, 3, 0.05).onChange(applyExposure);
    scene.open();

    const fog = gui.addFolder("Fog Light");
    fog.add(state, "fogLightEnabled").name("enabled").onChange(applyFogLight);
    fog.add(state, "fogLightIntensity", 0, 6, 0.05).name("intensity").onChange(applyFogLight);
    fog.add(state, "fogLightDensity", 0, 0.01, 0.0001).name("density").onChange(applyFogLight);
    fog.open();

    const bloom = gui.addFolder("Bloom");
    bloom.add(state, "bloomEnabled").name("enabled").onChange(applyBloom);
    bloom.add(state, "bloomStrength", 0, 4, 0.05).name("strength").onChange(applyBloom);
    bloom.open();
}

/**
 * Example entry: create the night map, add terrain + city + lamps, then the
 * control panel once the theme is ready.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView } = await createExampleMap(canvas, {
        themeObject: buildTheme(),
        lookAt: {
            target: { ...CENTER, alt: 300 },
            zoomLevel: 16,
            tilt: 40,
            heading: 1.2
        }
    });
    logExampleInfo("fx-night-city", mapView);

    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    addCityBlocks(mapView);
    addStreetLamps(mapView);

    // patchTheme throws until the theme finished loading; getTheme() resolves
    // exactly then and is race-free even if the load already completed.
    await mapView.getTheme();
    setupNightCityGui(mapView);
}

void main();
