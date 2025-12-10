import { MapView, GeoCoordinates, ellipsoidProjection, MapControls, DEMTerrainSource, ArcGISTileProvider, MapControlsUI, MapViewEventNames, sphereProjection } from "@flywave/flywave.gl";
import * as THREE from "three";
import { GUI } from 'dat.gui';
// Configuration constants
const CONFIG = {
    CANVAS_ELEMENT_ID: "mapCanvas",
    DEM_SOURCE_PATH: "dem_terrain/source.json",
    INITIAL_COORDINATES: new GeoCoordinates(36.4839, 118.1755, 700),
    ANCHOR_COORDINATES: new GeoCoordinates(36.48619699228674, 118.17270928364879, 500),
    TILT: 50,
    HEADING: -19,
    SPOT_LIGHT_INTENSITY: 2.8,
    SPOT_LIGHT_DISTANCE: 10000,
    SPOT_LIGHT_ANGLE: Math.PI / 4, // 45 degrees
    SPOT_LIGHT_PENUMBRA: 0.5,
    SPOT_LIGHT_DECAY: 0.2,
    POINT_LIGHT_INTENSITY: 1.5,
    POINT_LIGHT_DISTANCE: 500,
    POINT_LIGHT_DECAY: 0.2,
    DIRECTIONAL_LIGHT_INTENSITY: 0.8,
    SPOT_LIGHT_COLOR: '#ffffff',
    POINT_LIGHT_COLOR: '#ff0000',
    DIRECTIONAL_LIGHT_COLOR: '#ffffff',
    SHOW_HELPERS: true,
    SHADOW_MAP_TYPE: THREE.PCFSoftShadowMap,
    BOX_GEOMETRY_SIZE: 10,
    BOX_INITIAL_POSITION: { x: 0, y: -60, z: 0 },
    BOX_MOVEMENT_AMPLITUDE_X: 40,
    BOX_MOVEMENT_AMPLITUDE_Z: 40,
    BOX_MOVEMENT_AMPLITUDE_Y: 5,
    BOX_MOVEMENT_SPEED_XZ: 1.0,
    BOX_MOVEMENT_SPEED_Y: 1.2,
    BOX_MOVEMENT_FACTOR_Z: 0.7,
    SPOT_LIGHT_SHADOW_MAP_SIZE: 2048,
    POINT_LIGHT_SHADOW_MAP_SIZE: 1024,
    SPOT_LIGHT_POSITION: { x: 0, y: 50, z: 50 },
    SPOT_LIGHT_TARGET_POSITION: { x: 100, y: 0, z: 100 },
    POINT_LIGHT_POSITION: { x: -30, y: 20, z: 40 },
    BOX_COLOR: 0x8844aa
};
/**
 * Get map canvas element
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = () => {
    const canvas = document.getElementById(CONFIG.CANVAS_ELEMENT_ID);
    if (!canvas) {
        throw new Error(`Map canvas element not found, please ensure there is a canvas element with id '${CONFIG.CANVAS_ELEMENT_ID}' in HTML`);
    }
    return canvas;
};
/**
 * Initialize map view configuration
 * @param canvas Map canvas element
 * @returns Configured MapView instance
 */
const initializeMapView = (canvas) => {
    const mapView = new MapView({
        projection: sphereProjection,
        target: CONFIG.INITIAL_COORDINATES,
        tilt: CONFIG.TILT,
        heading: CONFIG.HEADING,
        canvas: canvas,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            lights: [],
            "enableShadows": true,
            "celestia": {
                sunTime: new Date().setHours(17, 0, 0, 0),
                atmosphere: true,
            }
        }
    });
    // Call update() after configuration to ensure theme settings take effect
    mapView.update();
    return mapView;
};
/**
 * Initialize map control component
 * @param mapView Map view instance
 * @param canvas Map canvas element
 */
const initializeMapControls = (mapView, canvas) => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    canvas.parentElement.appendChild(ui.domElement);
};
/**
 * Configure DEM terrain data source
 * @param mapView Map view instance
 */
const configureDEMTerrainSource = (mapView) => {
    const demTerrain = new DEMTerrainSource({
        source: CONFIG.DEM_SOURCE_PATH,
    });
    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));
};
/**
 * Enable shadow mapping
 * @param mapView Map view instance
 */
const enableShadowMapping = (mapView) => {
    const renderer = mapView.renderer;
    if (renderer && renderer.shadowMap) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = CONFIG.SHADOW_MAP_TYPE; // Softer shadows
    }
};
// Lights manager class - inherits from THREE.Object3D and serves as MapAnchor
class LightsManager extends THREE.Object3D {
    constructor() {
        super();
        this.lights = {};
        this.helpers = {};
        // GUI control parameters
        this.params = {
            spotLightIntensity: CONFIG.SPOT_LIGHT_INTENSITY,
            spotLightDistance: CONFIG.SPOT_LIGHT_DISTANCE,
            spotLightAngle: CONFIG.SPOT_LIGHT_ANGLE, // 45 degrees
            spotLightPenumbra: CONFIG.SPOT_LIGHT_PENUMBRA,
            spotLightDecay: CONFIG.SPOT_LIGHT_DECAY,
            pointLightIntensity: CONFIG.POINT_LIGHT_INTENSITY,
            pointLightDistance: CONFIG.POINT_LIGHT_DISTANCE,
            pointLightDecay: CONFIG.POINT_LIGHT_DECAY,
            directionalLightIntensity: CONFIG.DIRECTIONAL_LIGHT_INTENSITY,
            spotLightColor: CONFIG.SPOT_LIGHT_COLOR,
            pointLightColor: CONFIG.POINT_LIGHT_COLOR,
            directionalLightColor: CONFIG.DIRECTIONAL_LIGHT_COLOR,
            showHelpers: CONFIG.SHOW_HELPERS
        };
        this.gui = new GUI();
        this.spotLightTarget = new THREE.Object3D();
        this.initLights();
        this.setupGUI();
    }
    initLights() {
        // 1. Spotlight (SpotLight)
        const spotLight = new THREE.SpotLight(new THREE.Color(this.params.spotLightColor), // Color
        this.params.spotLightIntensity, // Intensity
        this.params.spotLightDistance, // Distance
        this.params.spotLightAngle, // Angle 
        this.params.spotLightPenumbra, // Penumbra
        this.params.spotLightDecay // Decay
        );
        // Set position in local coordinate system (above the sphere)
        spotLight.position.set(CONFIG.SPOT_LIGHT_POSITION.x, CONFIG.SPOT_LIGHT_POSITION.y, CONFIG.SPOT_LIGHT_POSITION.z);
        spotLight.castShadow = true;
        spotLight.shadow.mapSize.width = CONFIG.SPOT_LIGHT_SHADOW_MAP_SIZE;
        spotLight.shadow.mapSize.height = CONFIG.SPOT_LIGHT_SHADOW_MAP_SIZE;
        // Set spotlight target position
        this.spotLightTarget.position.set(CONFIG.SPOT_LIGHT_TARGET_POSITION.x, CONFIG.SPOT_LIGHT_TARGET_POSITION.y, CONFIG.SPOT_LIGHT_TARGET_POSITION.z);
        spotLight.target = this.spotLightTarget;
        this.lights.spotLight = spotLight;
        this.add(spotLight);
        this.add(this.spotLightTarget);
        // Spotlight helper object
        const spotLightHelper = new THREE.SpotLightHelper(spotLight);
        this.helpers.spotLight = spotLightHelper;
        this.add(spotLightHelper);
        // Create a fixed point light
        const pointLight = new THREE.PointLight(new THREE.Color(this.params.pointLightColor), // Color
        this.params.pointLightIntensity, // Intensity
        this.params.pointLightDistance, // Distance
        this.params.pointLightDecay // Decay
        );
        pointLight.position.set(CONFIG.POINT_LIGHT_POSITION.x, CONFIG.POINT_LIGHT_POSITION.y, CONFIG.POINT_LIGHT_POSITION.z); // Fixed position
        pointLight.castShadow = true;
        pointLight.shadow.mapSize.width = CONFIG.POINT_LIGHT_SHADOW_MAP_SIZE;
        pointLight.shadow.mapSize.height = CONFIG.POINT_LIGHT_SHADOW_MAP_SIZE;
        this.lights.pointLight = pointLight;
        this.add(pointLight);
        // Add helper object for point light
        const pointLightHelper = new THREE.PointLightHelper(pointLight, 5);
        this.helpers.pointLight = pointLightHelper;
        this.add(pointLightHelper);
        // Add a box as shadow receiver and caster
        const boxGeometry = new THREE.BoxGeometry(CONFIG.BOX_GEOMETRY_SIZE, CONFIG.BOX_GEOMETRY_SIZE, CONFIG.BOX_GEOMETRY_SIZE);
        const boxMaterial = new THREE.MeshPhongMaterial({ color: CONFIG.BOX_COLOR });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        // Place the box near the origin as a moving object
        box.position.set(CONFIG.BOX_INITIAL_POSITION.x, CONFIG.BOX_INITIAL_POSITION.y, CONFIG.BOX_INITIAL_POSITION.z); // Initial position
        box.castShadow = true; // Cast shadows 
        box.receiveShadow = true; // Receive shadows
        this.add(box);
        // Add box to helper objects for management
        this.helpers.box = box;
        // Initial update of helper objects
        this.updateHelpers();
    }
    // Update light directions to face the sphere center (negative Z-axis in local coordinates)
    updateLightDirections() {
        // All light targets face the negative Z-axis in local coordinates
        this.spotLightTarget.position.set(0, 0, -1);
        // Update helper objects
        this.updateHelpers();
    }
    // Update helper objects
    updateHelpers() {
        Object.values(this.helpers).forEach(helper => {
            if (helper instanceof THREE.SpotLightHelper ||
                helper instanceof THREE.DirectionalLightHelper) {
                helper.update();
            }
        });
    }
    // Toggle light switch
    toggleLight(lightName, visible) {
        const light = this.lights[lightName];
        const helper = this.helpers[lightName];
        if (light) {
            light.visible = visible;
        }
        if (helper) {
            helper.visible = visible && this.params.showHelpers;
        }
    }
    // Set light intensity
    setLightIntensity(lightName, intensity) {
        const light = this.lights[lightName];
        if (light) {
            light.intensity = intensity;
        }
    }
    // Set light color
    setLightColor(lightName, color) {
        const light = this.lights[lightName];
        if (light) {
            light.color = new THREE.Color(color);
        }
    }
    // Move light in local coordinate system
    moveLight(lightName, x, y, z) {
        const light = this.lights[lightName];
        if (light) {
            light.position.set(x, y, z);
            this.updateHelpers();
        }
    }
    setupGUI() {
        const lightsFolder = this.gui.addFolder('Light Controls');
        // Spotlight controls
        const spotLightFolder = lightsFolder.addFolder('Spotlight');
        spotLightFolder.add(this.params, 'spotLightIntensity', 0, 5).name('Intensity')
            .onChange((value) => this.setLightIntensity('spotLight', value));
        spotLightFolder.add(this.params, 'spotLightDistance', 0, 20000).name('Distance')
            .onChange((value) => this.lights.spotLight.distance = value);
        spotLightFolder.add(this.params, 'spotLightAngle', 0, Math.PI / 2).name('Angle')
            .onChange((value) => {
            this.lights.spotLight.angle = value;
            this.updateHelpers();
        });
        spotLightFolder.add(this.params, 'spotLightPenumbra', 0, 1).name('Penumbra')
            .onChange((value) => this.lights.spotLight.penumbra = value);
        spotLightFolder.add(this.params, 'spotLightDecay', 0, 2).name('Decay')
            .onChange((value) => this.lights.spotLight.decay = value);
        spotLightFolder.addColor(this.params, 'spotLightColor')
            .onChange((value) => this.setLightColor('spotLight', value));
        spotLightFolder.add(this.lights.spotLight, 'visible').name('Switch');
        // Point light controls
        const pointLightFolder = lightsFolder.addFolder('Point Light');
        pointLightFolder.add(this.params, 'pointLightIntensity', 0, 5).name('Intensity')
            .onChange((value) => this.setLightIntensity('pointLight', value));
        pointLightFolder.add(this.params, 'pointLightDistance', 0, 2000).name('Distance')
            .onChange((value) => {
            if (this.lights.pointLight)
                this.lights.pointLight.distance = value;
        });
        pointLightFolder.add(this.params, 'pointLightDecay', 0, 2).name('Decay')
            .onChange((value) => {
            if (this.lights.pointLight)
                this.lights.pointLight.decay = value;
        });
        pointLightFolder.addColor(this.params, 'pointLightColor')
            .onChange((value) => this.setLightColor('pointLight', value));
        pointLightFolder.add(this.lights.pointLight, 'visible').name('Switch');
        // Global controls
        const globalFolder = lightsFolder.addFolder('Global Settings');
        globalFolder.add(this.params, 'showHelpers').name('Show Helpers')
            .onChange((value) => {
            Object.values(this.helpers).forEach(helper => {
                helper.visible = value;
            });
        });
        lightsFolder.open();
        spotLightFolder.open();
        pointLightFolder.open();
    }
    // Update method, called on each frame
    update() {
        this.updateLightDirections();
        // Update box position to create animation moving back and forth on xy plane
        if (this.helpers.box) {
            const time = Date.now() * 0.001; // Time variable for animation
            // Make the box move back and forth on the xy plane
            this.helpers.box.position.x = Math.sin(time * CONFIG.BOX_MOVEMENT_SPEED_XZ) * CONFIG.BOX_MOVEMENT_AMPLITUDE_X; // Move left and right on x-axis
            this.helpers.box.position.z = Math.cos(time * CONFIG.BOX_MOVEMENT_SPEED_XZ * CONFIG.BOX_MOVEMENT_FACTOR_Z) * CONFIG.BOX_MOVEMENT_AMPLITUDE_Z; // Move forward and backward on z-axis
            // y-axis position remains relatively stable with slight vertical fluctuation
            this.helpers.box.position.y = CONFIG.BOX_INITIAL_POSITION.y + Math.abs(Math.sin(time * CONFIG.BOX_MOVEMENT_SPEED_Y)) * CONFIG.BOX_MOVEMENT_AMPLITUDE_Y;
        }
    }
}
/**
 * Add lights manager to map
 * @param mapView Map view instance
 */
const addLightManagerToMap = (mapView) => {
    // Create and add lights manager to scene
    const lightsManager = new LightsManager();
    // Set anchor property to anchor the lights manager to a specific geographic location
    //@ts-ignore
    lightsManager.anchor = CONFIG.ANCHOR_COORDINATES;
    lightsManager.lookAt(ellipsoidProjection.projectPoint(CONFIG.ANCHOR_COORDINATES, new THREE.Vector3()));
    // Add to map anchors
    mapView.mapAnchors.add(lightsManager);
    // Add render event listener to update lights
    mapView.addEventListener(MapViewEventNames.Render, () => {
        lightsManager.update();
    });
};
// ==================== Main execution flow ====================
try {
    // 1. Get map canvas element
    const canvas = getMapCanvas();
    // 2. Initialize map view
    const mapView = initializeMapView(canvas);
    // 3. Initialize map controls
    initializeMapControls(mapView, canvas);
    // 4. Configure DEM terrain data source
    configureDEMTerrainSource(mapView);
    // 5. Enable shadow mapping
    enableShadowMapping(mapView);
    // 6. Add lights manager to map
    addLightManagerToMap(mapView);
    // 7. Start animation
    mapView.beginAnimation();
    // 8. Expose map view to global scope for debugging
    window.mapView = mapView;
    console.log("Three.js lighting example initialized successfully");
}
catch (error) {
    console.error("Error initializing Three.js lighting example:", error);
}
