import {
    MapView,
    GeoCoordinates,
    sphereProjection,
    MapControls,
    MapControlsUI,
    DEMTerrainSource,
    ArcGISTileProvider,
    MapViewEventNames,
    PostProcessingGUIModule
} from "@flywave/flywave.gl";
import { GUI } from "dat.gui";

import {
    Mesh,
    MeshBasicMaterial,
    SphereGeometry,
    BoxGeometry,
    ConeGeometry,
    CylinderGeometry,
    TorusGeometry,
    Group,
    Color, 
} from "three";

/**
 * Get map canvas element
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Map canvas element not found, please ensure there is a canvas element with id 'mapCanvas' in HTML");
    }
    return canvas;
};

/**
 * Initialize map view configuration
 * @param canvas Map canvas element
 * @returns Configured MapView instance
 */
const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    // Set initial map position and viewpoint (a location in Shandong Province, China)
    const initialLocation = new GeoCoordinates(36.4902, 118.1742, 900);
    
    return new MapView({
        projection: sphereProjection,    // Use spherical projection
        target: initialLocation,         // Initial target position
        zoomLevel: 17,                  // Initial zoom level
        tilt: 45,                       // Initial tilt angle
        logarithmicDepthBuffer: false,   // Disable logarithmic depth buffer
        heading: 1.5413763202653008,    // Initial heading angle
        canvas: canvas,                 // Specify render canvas
        theme: {
            extends: "resources/tilezen_base_globe.json", // Base theme configuration
            "lights": [
                {
                    "type": "ambient",
                    "color": "#ffffff",
                    "intensity": 0.3,
                    "name": "ambient"
                },
            ],
            "celestia": {
                "atmosphere": false,     // Disable atmospheric effects
                sunTime: new Date().setHours(17, 0, 0, 0), // Set sun time
            },
            "postEffects": {
                "bloom": { // Bloom effect
                    "enabled": true,     // Enable bloom effect
                    luminancePassEnabled: true,
                    luminancePassThreshold: 0.1, // Luminance threshold
                    "strength": 2.5,     // Strength
                    "radius": 1.12,      // Radius
                    "levels": 3,         // Levels
                },
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
    
    // Initialize post-processing GUI module after theme is loaded
    mapView.addEventListener(MapViewEventNames.ThemeLoaded, () => {
        new PostProcessingGUIModule(mapView, new GUI()).open();
    });
};

/**
 * Configure DEM terrain data source
 * @param mapView Map view instance
 */
const configureDEMTerrainSource = (mapView: MapView): void => {
    const demTerrain = new DEMTerrainSource({
        source: "dem_terrain/source.json", // DEM terrain data source path
    });

    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ 
        minDataLevel: 0, 
        maxDataLevel: 18 
    }));
};

/**
 * Create multiple glowing geometries
 * @param geometry Geometry
 * @param color Color
 * @param intensity Intensity
 * @param opacity Opacity
 * @returns Glowing mesh object
 */
const createGlowingObject = (geometry: any, color: any, intensity: number = 1.0, opacity: number = 0.7): any => {
    const material = new MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity
    });
    return new Mesh(geometry, material);
};

/**
 * Create pulsing glow effect
 * @param geometry Geometry
 * @param baseColor Base color
 * @param pulseSpeed Pulse speed
 * @returns Mesh object with pulse effect
 */
const createPulsingGlow = (geometry: any, baseColor: any, pulseSpeed: number = 2): any => {
    const material = new MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.5
    });
    const mesh = new Mesh(geometry, material);

    let time = 0;
    mesh.userData.update = (delta: number) => {
        time += delta * pulseSpeed;
        const pulse = Math.sin(time) * 0.3 + 0.7; // Fluctuate between 0.4 and 1.0
        material.opacity = 0.3 + pulse * 0.4;
        material.color = new Color(baseColor).multiplyScalar(0.8 + pulse * 0.4);
    };

    return mesh;
};

/**
 * Create rotating glowing object group
 * @param mapView Map view instance
 * @returns Rotating glowing object group
 */
const createRotatingGlowGroup = (mapView: MapView): any => {
    const group = new Group();

    // Center sphere
    const centerSphere = createGlowingObject(
        new SphereGeometry(50, 16, 16),
        0xff6b6b, // Red
        1.2,
        0.6
    );
    group.add(centerSphere);

    // Surrounding ring
    const ring = createGlowingObject(
        new TorusGeometry(80, 15, 16, 32),
        0x4ecdc4, // Cyan
        0.8,
        0.4
    );
    ring.rotation.x = Math.PI / 2;
    mapView.mapRenderingManager.addBloomObject(ring);
    group.add(ring);

    // Surrounding small spheres
    const smallSpheres: any[] = [];
    const sphereCount = 6;
    for (let i = 0; i < sphereCount; i++) {
        const angle = (i / sphereCount) * Math.PI * 2;
        const sphere = createPulsingGlow(
            new SphereGeometry(20, 12, 12),
            0x45b7d1, // Blue
            3 + i * 0.5
        );
        sphere.position.set(
            Math.cos(angle) * 120,
            Math.sin(angle) * 120,
            0
        );
        group.add(sphere);
        smallSpheres.push(sphere);
    }

    // Rotation animation
    group.userData.update = (delta: number) => {
        group.rotation.z += delta * 0.5;
        group.rotation.y += delta * 0.3;

        // Update pulse spheres
        smallSpheres.forEach((sphere) => {
            if (sphere.userData.update) {
                sphere.userData.update(delta);
            }
        });
    };

    return group;
};

/**
 * Create building-like glowing structure
 * @param mapView Map view instance
 * @returns Building-like glowing structure
 */
const createGlowingStructure = (mapView: MapView): any => {
    const structure = new Group();

    // Base
    const base = createGlowingObject(
        new CylinderGeometry(60, 80, 40, 8),
        0xffa726, // Orange
        1.0,
        0.6
    );
    structure.add(base);

    mapView.mapRenderingManager.addBloomObject(base);

    // Middle layer
    const middle = createGlowingObject(
        new CylinderGeometry(40, 60, 60, 8),
        0x66bb6a, // Green
        1.1,
        0.7
    );
    middle.position.y = 50;
    structure.add(middle);
    mapView.mapRenderingManager.addBloomObject(middle);

    // Top layer
    const top = createGlowingObject(
        new ConeGeometry(30, 80, 8),
        0xab47bc, // Purple
        1.3,
        0.8
    );
    top.position.y = 110;
    structure.add(top);

    // Top glowing sphere
    const topSphere = createPulsingGlow(
        new SphereGeometry(25, 16, 16),
        0xffeb3b, // Yellow
        4
    );
    topSphere.position.y = 150;
    structure.add(topSphere);

    return structure;
};

/**
 * Create floating glowing particles
 * @param mapView Map view instance
 * @param count Number of particles
 * @returns Floating particle group
 */
const createFloatingParticles = (mapView: MapView, count: number = 8): any => {
    const particles = new Group();

    for (let i = 0; i < count; i++) {
        const size = 15 + Math.random() * 20;
        const geometry = Math.random() > 0.5 ?
            new SphereGeometry(size, 8, 8) :
            new BoxGeometry(size, size, size);

        const particle = createPulsingGlow(
            geometry,
            new Color().setHSL(Math.random(), 0.8, 0.6).getHex(),
            2 + Math.random() * 3
        );

        // Random initial position
        particle.position.set(
            (Math.random() - 0.5) * 300,
            (Math.random() - 0.5) * 300,
            (Math.random() - 0.5) * 200
        );

        // Random float parameters
        particle.userData.floatSpeed = 0.5 + Math.random() * 1;
        particle.userData.floatRange = 50 + Math.random() * 50;
        particle.userData.initialY = particle.position.y;
        particle.userData.floatTime = Math.random() * Math.PI * 2;

        particles.add(particle);
        mapView.mapRenderingManager.addBloomObject(particle);
    }

    // Floating animation
    particles.userData.update = (delta: number) => {
        particles.children.forEach((particle: any) => {
            particle.userData.floatTime += delta * particle.userData.floatSpeed;
            particle.position.y = particle.userData.initialY +
                Math.sin(particle.userData.floatTime) * particle.userData.floatRange;

            particle.rotation.x += delta * 0.5;
            particle.rotation.y += delta * 0.3;

            if (particle.userData.update) {
                particle.userData.update(delta);
            }
        });
    };

    return particles;
};

/**
 * Add glowing objects to map
 * @param mapView Map view instance
 */
const addGlowingObjectsToMap = (mapView: MapView): void => {
    const mainCoordinates = new GeoCoordinates(36.4902, 118.1742, 500);

    // 1. Main rotating glowing group
    const rotatingGlowGroup = createRotatingGlowGroup(mapView);
    // @ts-ignore
    rotatingGlowGroup.anchor = mainCoordinates;
    mapView.mapAnchors.add(rotatingGlowGroup);

    // 2. Building-like glowing structure (slightly offset position)
    const structureCoords = new GeoCoordinates(36.491, 118.175, 450);
    const glowingStructure = createGlowingStructure(mapView);
    // @ts-ignore
    glowingStructure.anchor = structureCoords;
    mapView.mapAnchors.add(glowingStructure);

    // 3. Floating particles (around main coordinates)
    const floatingParticles = createFloatingParticles(mapView, 12);
    // @ts-ignore
    floatingParticles.anchor = mainCoordinates;
    mapView.mapAnchors.add(floatingParticles);

    // 4. Additional individual glowing objects (different shapes)
    const extraObjects = [
        { geometry: new ConeGeometry(40, 100, 8), color: 0xe91e63, position: [36.489, 118.173, 480] }, // Pink cone
        { geometry: new CylinderGeometry(35, 35, 120, 6), color: 0x00bcd4, position: [36.492, 118.176, 520] }, // Blue cylinder
        { geometry: new TorusGeometry(60, 20, 12, 24), color: 0x8bc34a, position: [36.488, 118.177, 460] } // Green torus
    ];

    extraObjects.forEach((obj, index) => {
        const mesh = createPulsingGlow(obj.geometry, obj.color, 2 + index);
        // @ts-ignore
        mesh.anchor = new GeoCoordinates(obj.position[0], obj.position[1], obj.position[2]);
        mapView.mapAnchors.add(mesh);
    });
};

/**
 * Start animation loop
 * @param objects Animated objects that need to be updated
 */
const startAnimationLoop = (objects: any[]): void => {
    const animate = () => {
        const delta = 0.016; // Approximately 60fps

        // Update all animated objects
        objects.forEach(group => {
            if (group.userData.update) {
                group.userData.update(delta);
            }
        });

        requestAnimationFrame(animate);
    };

    animate();
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
    
    // 5. Add glowing objects to map
    addGlowingObjectsToMap(mapView);
    
    // 6. Start animation loop
    const objectsToAnimate = [
        mapView.mapAnchors.children.find((obj: any) => obj.userData.update !== undefined)
    ].filter(Boolean) as any[];
    
    // Actually, we need to directly use the objects created previously
    const mainCoordinates = new GeoCoordinates(36.4902, 118.1742, 500);
    const structureCoords = new GeoCoordinates(36.491, 118.175, 450);
    
    // Find corresponding instances based on objects added previously
    const rotatingGlowGroup = mapView.mapAnchors.children.find((obj: any) => 
        obj.anchor && obj.anchor.equals(mainCoordinates));
    const glowingStructure = mapView.mapAnchors.children.find((obj: any) => 
        obj.anchor && obj.anchor.equals(structureCoords));
    const floatingParticles = mapView.mapAnchors.children.find((obj: any) => 
        obj.anchor && obj.anchor.equals(mainCoordinates) && obj !== rotatingGlowGroup);
    
    const objectsToAnimateFull = [rotatingGlowGroup, glowingStructure, floatingParticles].filter(Boolean) as any[];
    startAnimationLoop(objectsToAnimateFull);
    
    console.log("Post-processing effects example initialized successfully");
} catch (error) {
    console.error("Error occurred while initializing post-processing effects example:", error);
}
