/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { MapView, GeoCoordinates, ellipsoidProjection, MapControls, DEMTerrainSource, ArcGISTileProvider, MapControlsUI, mercatorProjection, sphereProjection, } from "@flywave/flywave.gl";
import { CameraAnimationBuilder, CameraKeyTrackAnimation, ControlPoint } from "@flywave/flywave.gl";
import { GUI } from "dat.gui";
import * as THREE from "three";
/**
 * Create base map
 * @returns MapView instance
 */
const createBaseMap = () => {
    const canvas = getMapCanvas();
    const mapView = new MapView({
        projection: ellipsoidProjection, // Use spherical projection
        target: new GeoCoordinates(36.6512, 117.1200), // Initial position set to Jinan
        zoomLevel: 10,
        tilt: 45,
        heading: 0,
        canvas,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            "celestia": {
                "atmosphere": true, // Enable atmospheric effects
            }
        }
    });
    // Initialize map controls and UI
    initializeMapControls(mapView, canvas);
    // Configure DEM terrain data source
    configureDEMTerrainSource(mapView);
    // Expose map view to global scope for debugging
    window.mapView = mapView;
    return mapView;
};
/**
 * Get map canvas element
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = () => {
    const canvas = document.getElementById("mapCanvas");
    if (!canvas) {
        throw new Error("Map canvas element not found, please ensure there is a canvas element with id 'mapCanvas' in HTML");
    }
    return canvas;
};
/**
 * Initialize map control component
 * @param mapView Map view instance
 * @param canvas Map canvas element
 */
const initializeMapControls = (mapView, canvas) => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls, {
        "screenshotButton": {
            "width": 512,
            "height": 512,
        },
    });
    canvas.parentElement.appendChild(ui.domElement);
};
/**
 * Configure DEM terrain data source
 * @param mapView Map view instance
 */
const configureDEMTerrainSource = (mapView) => {
    const demTerrain = new DEMTerrainSource({
        source: "dem_terrain/source.json", // DEM terrain data source path
    });
    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));
};
// Landmark location definitions
const createGeoLocations = () => {
    return {
        // Famous locations in Jinan
        JinanCenter: new GeoCoordinates(36.6512, 117.1200), // Jinan city center
        DamingLake: new GeoCoordinates(36.6778, 117.0211), // Daming Lake
        BaotuSpring: new GeoCoordinates(36.6614, 117.0094), // Baotu Spring
        ThousandBuddhaMountain: new GeoCoordinates(36.6250, 117.0333), // Thousand Buddha Mountain
        // Famous locations in Beijing
        BeijingCenter: new GeoCoordinates(39.9042, 116.4074), // Beijing city center
        ForbiddenCity: new GeoCoordinates(39.9163, 116.3972), // Forbidden City
        TempleOfHeaven: new GeoCoordinates(39.8822, 116.4064), // Temple of Heaven
        SummerPalace: new GeoCoordinates(39.9998, 116.2754) // Summer Palace
    };
};
// Initialize camera animation related options
const initializeAnimationOptions = () => {
    const options = {
        globe: true,
        orbit: false,
        flyTo: "JinanCenter",
        flyOver: false
    };
    const animationOptions = {
        interpolation: THREE.InterpolateSmooth,
        loop: THREE.LoopOnce,
        repetitions: 1,
        rotateOnlyClockWise: true
    };
    return { options, animationOptions };
};
// Create flight route animation options from Jinan to Beijing
const createFlyOverAnimationOptions = (geoLocations) => {
    return {
        controlPoints: [
            new ControlPoint({
                target: geoLocations.DamingLake, // Start from Daming Lake
                timestamp: 0,
                heading: 300,
                tilt: 45,
                distance: 800
            }),
            new ControlPoint({
                target: geoLocations.JinanCenter, // Fly to Jinan city center
                timestamp: 50,
                heading: 20,
                tilt: 45,
                distance: 2000
            }),
            new ControlPoint({
                target: geoLocations.ForbiddenCity, // Fly to Beijing Forbidden City
                timestamp: 150,
                heading: 180,
                tilt: 35,
                distance: 1500
            }),
            new ControlPoint({
                target: geoLocations.TempleOfHeaven, // Finally to Temple of Heaven
                timestamp: 250,
                heading: 90,
                tilt: 25,
                distance: 1000
            })
        ]
    };
};
/**
 * Initialize user interface controls
 * @param map Map view instance
 * @param geoLocations Landmark locations
 * @param options Control options
 * @param animationOptions Animation options
 * @param flyOverAnimationOptions Flight animation options
 */
const initializeUIControls = (map, geoLocations, options, animationOptions, flyOverAnimationOptions) => {
    let cameraAnimation;
    // Callback function to update camera animation instance
    const updateCameraAnimation = (animation) => {
        cameraAnimation = animation;
    };
    const gui = new GUI({ width: 300 });
    // Add projection switch control
    gui.add(options, "globe").onChange(() => {
        map.projection = options.globe ? sphereProjection : mercatorProjection;
    });
    // Add orbit animation control
    gui.add(options, "orbit").onChange((enable) => {
        enableOrbit(enable, map, options, animationOptions, updateCameraAnimation, createOrbitAnimation);
    }).listen();
    // Add fly to specified location control
    gui.add(options, "flyTo", [...Object.keys(geoLocations)])
        .onChange((location) => {
        flyTo(location, map, geoLocations, options, animationOptions, updateCameraAnimation);
    })
        .listen();
    // Add flight route animation control
    gui.add(options, "flyOver").onChange((enable) => {
        enableFlyOver(enable, map, options, flyOverAnimationOptions, animationOptions, updateCameraAnimation);
    }).listen();
    // Add animation interpolation method control
    gui.add(animationOptions, "interpolation", {
        smooth: THREE.InterpolateSmooth,
        linear: THREE.InterpolateLinear,
        discrete: THREE.InterpolateDiscrete
    })
        .onChange((value) => {
        animationOptions.interpolation = parseInt(value, 10);
        alert("This will only take effect for the next animation created");
    })
        .listen();
    // Add animation repetition count control
    gui.add(animationOptions, "repetitions", [1, 2, 3, 5, 10, Infinity])
        .onChange((value) => {
        if (cameraAnimation) {
            cameraAnimation.repetitions = value;
        }
    })
        .listen();
    // Add animation loop mode control
    gui.add(animationOptions, "loop", {
        once: THREE.LoopOnce,
        pingpong: THREE.LoopPingPong,
        repeat: THREE.LoopRepeat
    }).onChange((value) => {
        animationOptions.loop = parseInt(value, 10);
        if (cameraAnimation) {
            cameraAnimation.loop = parseInt(value, 10);
        }
    });
    // Add clockwise rotation control
    gui.add(animationOptions, "rotateOnlyClockWise")
        .onChange((value) => {
        if (cameraAnimation) {
            cameraAnimation.rotateOnlyClockwise = value;
        }
    })
        .listen();
    return [gui, updateCameraAnimation];
};
/**
 * Stop current animation
 * @param options Control options
 * @param updateCameraAnimation Callback function to update camera animation instance
 */
const stopAnimation = (options, updateCameraAnimation) => {
    updateCameraAnimation(undefined);
    options.flyOver = false;
    options.orbit = false;
};
/**
 * Enable orbit animation
 * @param enable Whether to enable
 * @param map Map view instance
 * @param options Control options
 * @param animationOptions Animation options
 * @param updateCameraAnimation Callback function to update camera animation instance
 * @param createOrbitAnimation Create orbit animation function
 */
const enableOrbit = (enable, map, options, animationOptions, updateCameraAnimation, createOrbitAnimation) => {
    stopAnimation(options, updateCameraAnimation);
    options.orbit = enable;
    if (enable) {
        const newAnimation = createOrbitAnimation(map, animationOptions);
        newAnimation.start();
        updateCameraAnimation(newAnimation);
    }
};
/**
 * Fly to specified location
 * @param location Location name
 * @param map Map view instance
 * @param geoLocations Landmark locations
 * @param options Control options
 * @param animationOptions Animation options
 * @param updateCameraAnimation Callback function to update camera animation instance
 */
const flyTo = (location, map, geoLocations, options, animationOptions, updateCameraAnimation) => {
    stopAnimation(options, updateCameraAnimation);
    options.flyTo = location;
    if (location !== "") {
        const target = new ControlPoint({
            target: geoLocations[location],
            distance: location.includes("Beijing") ? 3000 : 1500, // Use larger distance for Beijing, smaller distance for Jinan
            tilt: 25,
            heading: Math.random() * 360,
            timestamp: 10
        });
        const flyToOpts = CameraAnimationBuilder.createBowFlyToOptions(map, new ControlPoint({
            ...CameraAnimationBuilder.getLookAtFromView(map),
            timestamp: 0
        }), target);
        Object.assign(flyToOpts, animationOptions);
        const newAnimation = new CameraKeyTrackAnimation(map, flyToOpts);
        newAnimation.start();
        updateCameraAnimation(newAnimation);
    }
};
/**
 * Enable flight route animation
 * @param enable Whether to enable
 * @param map Map view instance
 * @param options Control options
 * @param flyOverAnimationOptions Flight animation options
 * @param animationOptions Animation options
 * @param updateCameraAnimation Callback function to update camera animation instance
 */
const enableFlyOver = (enable, map, options, flyOverAnimationOptions, animationOptions, updateCameraAnimation) => {
    stopAnimation(options, updateCameraAnimation);
    options.flyOver = enable;
    if (enable) {
        Object.assign(flyOverAnimationOptions, animationOptions);
        const newAnimation = new CameraKeyTrackAnimation(map, flyOverAnimationOptions);
        newAnimation.start();
        updateCameraAnimation(newAnimation);
    }
};
/**
 * Create orbit animation
 * @param map Map view instance
 * @param animationOptions Animation options
 * @returns CameraKeyTrackAnimation instance
 */
const createOrbitAnimation = (map, animationOptions) => {
    const currentLookAt = CameraAnimationBuilder.getLookAtFromView(map);
    const orbitControlPoints = [
        new ControlPoint({
            ...currentLookAt,
            timestamp: 0,
            heading: 0
        }),
        new ControlPoint({
            ...currentLookAt,
            timestamp: 10,
            heading: 90,
            distance: currentLookAt.distance * 1.1
        }),
        new ControlPoint({
            ...currentLookAt,
            timestamp: 20,
            heading: 180, // 180 degree rotation
            distance: currentLookAt.distance
        }),
        new ControlPoint({
            ...currentLookAt,
            timestamp: 30,
            heading: 270, // 270 degree rotation
            distance: currentLookAt.distance * 1.1
        }),
        new ControlPoint({
            ...currentLookAt,
            timestamp: 40,
            heading: 360, // Return to starting point
            distance: currentLookAt.distance
        })
    ];
    const orbitOpts = {
        controlPoints: orbitControlPoints,
        interpolation: animationOptions.interpolation,
        loop: animationOptions.loop,
        repetitions: animationOptions.repetitions
    };
    return new CameraKeyTrackAnimation(map, orbitOpts);
};
// ==================== Main execution flow ====================
try {
    // 1. Create base map
    const map = createBaseMap();
    // 2. Create landmark locations
    const geoLocations = createGeoLocations();
    // 3. Set initial viewpoint to Jinan city center
    map.lookAt({
        target: geoLocations.JinanCenter,
        distance: 2000,
        tilt: 45
    });
    // 4. Initialize animation options
    const { options, animationOptions } = initializeAnimationOptions();
    // 5. Create flight route animation options
    const flyOverAnimationOptions = createFlyOverAnimationOptions(geoLocations);
    // 6. Initialize user interface controls
    const [gui, updateCameraAnimation] = initializeUIControls(map, geoLocations, options, animationOptions, flyOverAnimationOptions);
    console.log("Camera animation getting started example initialized successfully");
}
catch (error) {
    console.error("Error occurred while initializing camera animation getting started example:", error);
}
