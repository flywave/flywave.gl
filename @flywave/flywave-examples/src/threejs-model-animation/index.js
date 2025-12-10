import { MapView, GeoCoordinates, ellipsoidProjection, MapControls, DEMTerrainSource, ArcGISTileProvider, MapControlsUI, MapViewEventNames, } from "@flywave/flywave.gl";
import * as THREE from "three";
import { GUI } from 'dat.gui';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
// Configuration constants
const CONFIG = {
    CANVAS_ELEMENT_ID: "mapCanvas",
    DEM_SOURCE_PATH: "dem_terrain/source.json",
    INITIAL_COORDINATES: new GeoCoordinates(36.4810, 118.1727, 900),
    ANCHOR_COORDINATES: new GeoCoordinates(36.48619699228674, 118.17270928364879, 330),
    TILT: 50.1,
    MODEL_FILE_PATH: 'Samba Dancing.fbx',
    INITIAL_MODEL_SCALE: 0.5,
    MODEL_SCALE_MIN: 0.01,
    MODEL_SCALE_MAX: 0.5,
    MODEL_SCALE_STEP: 0.01,
    ANIMATION_SPEED_MIN: 0,
    ANIMATION_SPEED_MAX: 2,
    ANIMATION_SPEED_STEP: 0.1,
    POSITION_MIN: -20,
    POSITION_MAX: 20,
    POSITION_STEP: 1,
    INITIAL_ANIMATION_INDEX: 0,
    MAX_ANIMATION_INDEX: 10,
    ANIMATION_INDEX_STEP: 1,
    MODEL_ROTATION_X: Math.PI / 2
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
        projection: ellipsoidProjection,
        target: CONFIG.INITIAL_COORDINATES,
        canvas: canvas,
        tilt: CONFIG.TILT,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            lights: [],
            "enableShadows": true,
            "celestia": {
                sunTime: new Date().setHours(13, 0, 0, 0),
                atmosphere: true,
                sunCastShadow: true,
                sunIntensity: 5.0,
            }
        }
    });
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
// Samba Dancing model manager class
class SambaDancingManager extends THREE.Object3D {
    constructor() {
        super();
        this.mixer = null;
        this.model = null;
        // Control parameters
        this.params = {
            modelScale: CONFIG.INITIAL_MODEL_SCALE,
            showModel: true,
            animationSpeed: 1.0,
            modelPositionX: 0,
            modelPositionY: 0,
            modelPositionZ: 0,
            animationIndex: CONFIG.INITIAL_ANIMATION_INDEX
        };
        // Animation list
        this.animationList = [];
        this.gui = new GUI();
        this.clock = new THREE.Clock();
        this.loader = new FBXLoader();
        this.guiMorphsFolder = this.gui.addFolder('Morphs');
        this.guiMorphsFolder.hide();
        this.initGUI();
        this.loadSambaDancing();
    }
    initGUI() {
        // Model settings
        const modelFolder = this.gui.addFolder('Samba Dance Model Settings');
        modelFolder.add(this.params, 'modelScale', CONFIG.MODEL_SCALE_MIN, CONFIG.MODEL_SCALE_MAX, CONFIG.MODEL_SCALE_STEP).name('Scale')
            .onChange((value) => {
            if (this.model) {
                this.model.scale.setScalar(value);
            }
        });
        modelFolder.add(this.params, 'showModel').name('Show Model')
            .onChange((value) => {
            if (this.model) {
                this.model.visible = value;
            }
        });
        modelFolder.add(this.params, 'animationSpeed', CONFIG.ANIMATION_SPEED_MIN, CONFIG.ANIMATION_SPEED_MAX, CONFIG.ANIMATION_SPEED_STEP).name('Animation Speed')
            .onChange((value) => {
            if (this.mixer) {
                this.mixer.timeScale = value;
            }
        });
        // Animation Control
        const animationFolder = modelFolder.addFolder('Animation Control');
        animationFolder.add(this.params, 'animationIndex', 0, CONFIG.MAX_ANIMATION_INDEX, CONFIG.ANIMATION_INDEX_STEP).name('Animation Index')
            .onChange((value) => {
            this.playAnimation(value);
        });
        // Position Control
        const positionFolder = modelFolder.addFolder('Position');
        positionFolder.add(this.params, 'modelPositionX', CONFIG.POSITION_MIN, CONFIG.POSITION_MAX, CONFIG.POSITION_STEP).name('X Position')
            .onChange((value) => {
            if (this.model) {
                this.model.position.x = value;
            }
        });
        positionFolder.add(this.params, 'modelPositionY', CONFIG.POSITION_MIN, CONFIG.POSITION_MAX, CONFIG.POSITION_STEP).name('Y Position')
            .onChange((value) => {
            if (this.model) {
                this.model.position.y = value;
            }
        });
        positionFolder.add(this.params, 'modelPositionZ', CONFIG.POSITION_MIN, CONFIG.POSITION_MAX, CONFIG.POSITION_STEP).name('Z Position')
            .onChange((value) => {
            if (this.model) {
                this.model.position.z = value;
            }
        });
        modelFolder.open();
        positionFolder.open();
    }
    loadSambaDancing() {
        this.loader.load(CONFIG.MODEL_FILE_PATH, (group) => {
            // Set new model
            this.model = group;
            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                }
            });
            // Set animation
            if (this.model.animations && this.model.animations.length) {
                this.mixer = new THREE.AnimationMixer(this.model);
                // Get animation list
                this.animationList = this.model.animations.map(anim => anim.name);
                console.log('Available animations:', this.animationList);
                // Play first animation by default
                this.playAnimation(CONFIG.INITIAL_ANIMATION_INDEX);
            }
            else {
                this.mixer = null;
                console.log('Model has no animations');
            }
            // Set Morph Targets control
            this.setupMorphControls();
            // Set model properties
            this.setupModelProperties();
            console.log('Samba Dancing model loaded successfully');
        }, undefined, (error) => {
            throw error;
        });
    }
    setupMorphControls() {
        if (!this.model)
            return;
        // Set morph targets control
        this.model.traverse((child) => {
            if (child.isMesh) {
                const mesh = child;
                if (mesh.morphTargetDictionary) {
                    this.guiMorphsFolder.show();
                    const meshFolder = this.guiMorphsFolder.addFolder(mesh.name || 'Morph Targets');
                    Object.keys(mesh.morphTargetDictionary).forEach((key) => {
                        meshFolder.add(mesh.morphTargetInfluences, mesh.morphTargetDictionary[key], 0, 1, 0.01).name(key);
                    });
                }
            }
        });
    }
    setupModelProperties() {
        if (!this.model)
            return;
        // Set model properties and shadows
        this.model.traverse((child) => {
            if (child.isMesh) {
                const mesh = child;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
            }
        });
        // Initial scale and position
        this.model.scale.setScalar(this.params.modelScale);
        this.model.position.set(this.params.modelPositionX, this.params.modelPositionY, this.params.modelPositionZ);
        this.model.rotateX(CONFIG.MODEL_ROTATION_X);
        this.add(this.model);
    }
    // Play animation by specified index
    playAnimation(animationIndex = 0) {
        if (this.mixer && this.model && this.model.animations) {
            if (animationIndex < this.model.animations.length) {
                this.mixer.stopAllAction();
                const action = this.mixer.clipAction(this.model.animations[animationIndex]);
                action.play();
                this.params.animationIndex = animationIndex;
                console.log(`Playing animation: ${this.model.animations[animationIndex].name}`);
            }
        }
    }
    // Update method, called on each frame
    update() {
        const delta = this.clock.getDelta();
        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(delta);
        }
    }
    // Get available animation list
    getAnimationList() {
        return this.animationList;
    }
}
/**
 * Add Samba dance model manager to map
 * @param mapView Map view instance
 */
const addSambaManagerToMap = (mapView) => {
    // Create and add Samba dance model manager to scene
    const sambaManager = new SambaDancingManager();
    // Set anchor property to anchor the model manager to a specific geographic location
    //@ts-ignore
    sambaManager.anchor = CONFIG.ANCHOR_COORDINATES;
    // Set orientation
    sambaManager.lookAt(ellipsoidProjection.projectPoint(CONFIG.ANCHOR_COORDINATES, new THREE.Vector3()));
    // Add to map anchors
    mapView.mapAnchors.add(sambaManager);
    // Add render event listener to update model animation
    mapView.addEventListener(MapViewEventNames.Render, () => {
        sambaManager.update();
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
    // 5. Add Samba dance model manager to map
    addSambaManagerToMap(mapView);
    // 6. Start animation loop
    mapView.beginAnimation();
    console.log("Three.js model animation example initialized successfully");
}
catch (error) {
    console.error("Error initializing Three.js model animation example:", error);
}
