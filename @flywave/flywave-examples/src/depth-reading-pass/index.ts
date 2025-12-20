import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    CesiumWorldTerrainSource,
    ArcGISTileProvider,
    ClassificationType,
    sphereProjection,
    TileRenderDataSource,
    transformECEFToProjection,
    ModularMapViewMonitor
} from "@flywave/flywave.gl";
import { CESIUM_ION_TOKEN } from "../token-config";
import { GUI } from "dat.gui";
import * as THREE from "three";

// Configuration constants
const CONFIG = {
    CANVAS_ELEMENT_ID: "mapCanvas",
    INITIAL_COORDINATES: new GeoCoordinates(22.3760, 109.0255, 690),
    TILT: 56.60060867291795,
    HEADING: -125.79565303507096,
    ZOOM_LEVEL: 18,
    CLICK_POINT_COLOR: 0xff0000,
    CLICK_POINT_SIZE: 10
};

/**
 * Get map canvas element
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById(CONFIG.CANVAS_ELEMENT_ID) as HTMLCanvasElement;
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
const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    return new MapView({
        projection: sphereProjection,
        target: CONFIG.INITIAL_COORDINATES,
        logarithmicDepthBuffer: false,
        enablePolarDataSource: false,
        heading: CONFIG.HEADING,
        tilt: CONFIG.TILT,
        zoomLevel: CONFIG.ZOOM_LEVEL,
        canvas: canvas,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            "celestia": {
                "atmosphere": true,
            },
                  postEffects: {
                brightnessContrast: {
                    brightness: -0.17,  // Brightness adjustment
                    contrast: 0.23,     // Contrast adjustment
                    enabled: true       // Enable brightness contrast effect
                },
                hueSaturation: {
                    hue: 0.17,         // Hue adjustment
                    saturation: 0.57,   // Saturation adjustment
                    enabled: true       // Enable hue saturation effect
                }
            }
        }
    });
};

/**
 * Initialize map control component
 * @param mapView Map view instance
 * @param canvas Map canvas element
 */
const initializeMapControls = (mapView: MapView, canvas: HTMLCanvasElement): void => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    canvas.parentElement!.appendChild(ui.domElement);
    
    // Expose control object to global scope for debugging
    (window as any).controls = controls;
};

/**
 * Configure elevation data source
 * @param mapView Map view instance
 * @returns Configured elevation data source
 */
const configureElevationSource = (mapView: MapView): CesiumWorldTerrainSource => {
    // Create Cesium world terrain data source using Cesium Ion service
    const cesiumIonDataSource = new CesiumWorldTerrainSource({
        // Note: In production environments, this token should be managed using environment variables or configuration files
        accessToken: CESIUM_ION_TOKEN,
        assetId: 1, // Use default terrain dataset
    });
    
    // Set as map elevation data source
    mapView.setElevationSource(cesiumIonDataSource);
    
    // Add ArcGIS tile data provider to enhance map coverage
    cesiumIonDataSource.addWebTileDataSource(
        new ArcGISTileProvider({ 
            minDataLevel: 0, 
            maxDataLevel: 18 
        })
    );
    
    return cesiumIonDataSource;
};

/**
 * Create sample 3D objects for testing depth reading
 * @param mapView Map view instance
 */
const createSampleObjects = (mapView: MapView): void => {
    // Create a group to hold our sample objects
    const objectGroup = new THREE.Group();
    
    // Create a red sphere
    const sphereGeometry = new THREE.SphereGeometry(50, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        transparent: true,
        opacity: 0.7
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(100, 100, 100);
    objectGroup.add(sphere);
    
    // Create a blue box
    const boxGeometry = new THREE.BoxGeometry(80, 80, 80);
    const boxMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x0000ff,
        transparent: true,
        opacity: 0.7
    });
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    box.position.set(-100, 50, -100);
    objectGroup.add(box);
    
    // Create a green cone
    const coneGeometry = new THREE.ConeGeometry(50, 100, 16);
    const coneMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 0.7
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.set(0, 100, -150);
    objectGroup.add(cone);
    
    // Position the group in the scene
    // @ts-ignore
    objectGroup.anchor = new GeoCoordinates(39.7095, -105.2100, 2300);
    mapView.mapAnchors.add(objectGroup);
};

/**
 * Depth reading controller with dat.GUI interface
 */
class DepthReadingController {
    private gui: GUI;
    private mapView: MapView;
    private params: any;
    private clickPoint: THREE.Mesh | null = null;
    private placedObjects: THREE.Object3D[] = []; // Store placed objects
    
    constructor(mapView: MapView) {
        this.mapView = mapView;
        this.gui = new GUI();
        this.params = {
            debugMode: false,
            filterTerrain: false,
            filter3DTiles: false,
            showClickPoint: true,
            objectType: 'sphere', // Default object type to place
            objectColor: '#ff0000', // Default color
            objectSize: 10 // Default size
        };
        
        this.setupGUI();
        this.setupEventListeners();
    }
    
    private setupGUI(): void {
        // Debug mode folder
        const debugFolder = this.gui.addFolder('Debug Mode');
        debugFolder.add(this.params, 'debugMode').name('Enable Debug Mode').onChange((enabled: boolean) => {
            (this.mapView.mapRenderingManager as any).setDepthReadingDebugMode(enabled);
        });
        
        // Filter options folder
        const filterFolder = this.gui.addFolder('Filter Options');
        filterFolder.add(this.params, 'filterTerrain').name('Filter Terrain Only').onChange((enabled: boolean) => {
            if (enabled) {
                (this.mapView.mapRenderingManager as any).setDepthReadingFilter(ClassificationType.TERRAIN);
                this.params.filter3DTiles = false;
            } else if (!this.params.filter3DTiles) {
                (this.mapView.mapRenderingManager as any).setDepthReadingFilter(0); // No filter
            }
            filterFolder.updateDisplay();
        });
        
        filterFolder.add(this.params, 'filter3DTiles').name('Filter 3D Tiles Only').onChange((enabled: boolean) => {
            if (enabled) {
                (this.mapView.mapRenderingManager as any).setDepthReadingFilter(ClassificationType.TILE_3D);
                this.params.filterTerrain = false;
            } else if (!this.params.filterTerrain) {
                (this.mapView.mapRenderingManager as any).setDepthReadingFilter(0); // No filter
            }
            filterFolder.updateDisplay();
        });
        
        // Visualization folder
        const vizFolder = this.gui.addFolder('Visualization');
        vizFolder.add(this.params, 'showClickPoint').name('Show Click Point').onChange((enabled: boolean) => {
            if (this.clickPoint) {
                this.clickPoint.visible = enabled;
            }
        });
        
        // Object placement folder
        const objectFolder = this.gui.addFolder('Object Placement');
        objectFolder.addColor(this.params, 'objectColor').name('Object Color');
        objectFolder.add(this.params, 'objectSize', 1, 100).name('Object Size');
        
        // Add a button to clear all placed objects
        objectFolder.add({ clearObjects: () => this.clearPlacedObjects() }, 'clearObjects').name('Clear All Objects');
        
        // Open folders by default
        debugFolder.open();
        filterFolder.open();
        vizFolder.open();
        objectFolder.open();
    }
    
    private setupEventListeners(): void {
        const canvas = this.mapView.canvas;
        
        canvas.addEventListener('click', (event: MouseEvent) => {
            this.handleCanvasClick(event);
        });
    }
    
    private handleCanvasClick(event: MouseEvent): void {
        const canvas = this.mapView.canvas;
        const rect = canvas.getBoundingClientRect();
        
        // Calculate normalized device coordinates
        const ndc = this.mapView.getNormalizedScreenCoordinates(event.layerX, event.layerY)
        
        // Read depth at clicked position
        const depth = this.mapView.mapRenderingManager.readDepth(this.mapView.getNormalizedScreenCoordinates(event.layerX, event.layerY));
        
        if (depth !== null) { 
            
            // Convert NDC with depth to world coordinates
            const ndcWithDepth = new THREE.Vector3(ndc.x, ndc.y, (depth * 2.0) - 1.0);

            const worldPosition = new THREE.Vector3();
             this.mapView.ndcToView(ndcWithDepth, worldPosition).add(this.mapView.camera.position);
            
            console.log(`World Position: (${worldPosition.x.toFixed(2)}, ${worldPosition.y.toFixed(2)}, ${worldPosition.z.toFixed(2)})`);
            
            // Convert to geographic coordinates
            const geoPosition = this.mapView.projection.unprojectPoint(worldPosition);
            console.log(`Geo Position: Lat=${geoPosition.latitude.toFixed(6)}, Lng=${geoPosition.longitude.toFixed(6)}, Alt=${geoPosition.altitude?.toFixed(2) || 'N/A'}`);
            
            // Update or create click point visualization
            this.updateClickPoint(worldPosition);
            
            // Place an object at the clicked position
            this.placeObjectAt(worldPosition);
            
            // Display information in GUI
            this.displayInfo(ndc, depth, worldPosition, geoPosition);
             
        } else {
            console.log(`No depth value at (${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)})`);
            
            // If no depth is available, we can still place an object at a default distance
            // This is useful for placing objects in the sky or far away
            const farPoint = new THREE.Vector3(ndc.x, ndc.y, 0.99); // Near the far plane
            const worldPosition = farPoint.unproject(this.mapView.camera);
            this.placeObjectAt(worldPosition);
        }
    } 

    private updateClickPoint(position: THREE.Vector3): void {
        // Remove existing point if it exists
        if (this.clickPoint) {
            // Create a temporary group to hold the click point for proper removal
            const tempGroup = new THREE.Group();
            tempGroup.add(this.clickPoint);
            this.mapView.mapAnchors.remove(tempGroup);
            this.clickPoint = null;
        }
        
        if (this.params.showClickPoint) {
            // Create a new group for the click point
            const clickPointGroup = new THREE.Group();
            
            // Create a new point
            const geometry = new THREE.SphereGeometry(CONFIG.CLICK_POINT_SIZE, 16, 16);
            const material = new THREE.MeshBasicMaterial({ 
                color: CONFIG.CLICK_POINT_COLOR,
                transparent: true,
                opacity: 0.8
            });
            this.clickPoint = new THREE.Mesh(geometry, material);
            clickPointGroup.add(this.clickPoint);
            
            // Convert world position to geographic coordinates
            const geoPosition = this.mapView.projection.unprojectPoint(position);
            
            // Set anchor for the group
            // @ts-ignore
            clickPointGroup.anchor = geoPosition;
            
            // Add to map anchors
            this.mapView.mapAnchors.add(clickPointGroup);
        }
    }
    
    /**
     * Create and place an object at the specified world position
     * @param position World position to place the object
     */
    private placeObjectAt(position: THREE.Vector3): void {
        // Create a new group for the placed object
        const objectGroup = new THREE.Group();
        
        // Create a sphere
        const sphereGeometry = new THREE.SphereGeometry(this.params.objectSize, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({ 
            color: this.params.objectColor,
            transparent: true,
            opacity: 0.8
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        objectGroup.add(sphere);
        
        // Convert world position to geographic coordinates
        const geoPosition = this.mapView.projection.unprojectPoint(position);
        
        // Set anchor for the group
        // @ts-ignore
        objectGroup.anchor = geoPosition;
        
        // Add to map anchors
        this.mapView.mapAnchors.add(objectGroup);
        
        // Store reference for potential cleanup
        this.placedObjects.push(objectGroup);
    }
    
    /**
     * Clear all placed objects
     */
    private clearPlacedObjects(): void {
        this.placedObjects.forEach(obj => {
            // Remove from map anchors instead of scene
            this.mapView.mapAnchors.remove(obj);
            if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (obj.material instanceof THREE.Material) {
                    obj.material.dispose();
                } else if (Array.isArray(obj.material)) {
                    obj.material.forEach(material => material.dispose());
                }
            }
        });
        this.placedObjects = [];
    }
    
    private displayInfo(ndc: THREE.Vector2, depth: number, worldPos: THREE.Vector3, geoPos: GeoCoordinates): void {
        // Create info folder if it doesn't exist
        const folders = (this.gui as any).__folders;
        let infoFolder = folders['Click Info'];
        if (!infoFolder) {
            infoFolder = this.gui.addFolder('Click Info');
            infoFolder.open();
        } else {
            // Clear existing info
            for (const [key, controller] of Object.entries((infoFolder as any).__controllers)) {
                infoFolder.remove(controller);
            }
        }
        
        // Add new info
        infoFolder.add({ ndcX: ndc.x.toFixed(3) }, 'ndcX').name('NDC X').listen();
        infoFolder.add({ ndcY: ndc.y.toFixed(3) }, 'ndcY').name('NDC Y').listen();
        infoFolder.add({ depth: depth.toFixed(6) }, 'depth').name('Depth').listen();
        infoFolder.add({ worldX: worldPos.x.toFixed(2) }, 'worldX').name('World X').listen();
        infoFolder.add({ worldY: worldPos.y.toFixed(2) }, 'worldY').name('World Y').listen();
        infoFolder.add({ worldZ: worldPos.z.toFixed(2) }, 'worldZ').name('World Z').listen();
        infoFolder.add({ lat: geoPos.latitude.toFixed(6) }, 'lat').name('Latitude').listen();
        infoFolder.add({ lng: geoPos.longitude.toFixed(6) }, 'lng').name('Longitude').listen();
        infoFolder.add({ alt: geoPos.altitude?.toFixed(2) || 'N/A' }, 'alt').name('Altitude').listen();
    }
}


// let tmpVec = new THREE.Vector3();
// let tmpVec2 = new THREE.Vector3();
// let tempQuaternion = new THREE.Quaternion();
// const create3DTILEDataSource = (mapView: MapView): TileRenderDataSource => {
//     const tileDataSource = new TileRenderDataSource({
//         url: "http://127.0.0.1/terra_b3dms/tileset.json", // Gaussian splat dataset path
//         matrixTransformCallback: (matrix) => {
//             matrix.decompose(tmpVec, tempQuaternion, tmpVec2);
//             return  transformECEFToProjection(tmpVec, sphereProjection,true).transformMatrix.multiply(new THREE.Matrix4().makeRotationFromQuaternion(tempQuaternion));
//         },
//         errorTarget:2
//     });

//     tileDataSource.setTheme({
//            postEffects: { 
//                     translucentDepth: {
//                         enabled: true,   // Enable translucent depth effect
//                         mixFactor: 1, // Translucent depth mix factor
//                         useObjectColor: true, // Use object color for translucent depth
//                         objectColorMix: 0, // Object color mix factor 
//                         occlusionDistance: 30, // Occlusion distance
//                     }
//                 },
//     });
    
//     mapView.addDataSource(tileDataSource);
     
    
//     return tileDataSource;
// };

// ==================== Main execution flow ====================

try {
    // 1. Get map canvas element
    const canvas = getMapCanvas();
    
    // 2. Initialize map view
    const mapView = initializeMapView(canvas);
    
    // 3. Initialize map controls
    initializeMapControls(mapView, canvas);
    
    // 4. Configure elevation data source
    const elevationDataSource = configureElevationSource(mapView);
    
    // 5. Create sample objects
    createSampleObjects(mapView);

    new ModularMapViewMonitor(mapView);
    
    // 6. Initialize depth reading controller
    const depthController = new DepthReadingController(mapView);

    // 6. Add 3DTILE data source
    // create3DTILEDataSource(mapView);
     
    // 7. Start map animation rendering
    mapView.beginAnimation();
    
    console.log("Depth reading pass example initialized successfully");
} catch (error) {
    console.error("Error initializing depth reading pass example:", error);
}