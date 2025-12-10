import { MapView, GeoCoordinates, ellipsoidProjection, MapControls, DEMTerrainSource, ArcGISTileProvider, MapControlsUI, } from "@flywave/flywave.gl";
import * as THREE from "three";
import ParticleSystem, { Body, Color, Emitter, Gravity, Life, Mass, Position, RadialVelocity, RandomDrift, Rate, Scale, Span, SphereZone, SpriteRenderer, Vector3D, ease, } from 'three-nebula';
// Configuration constants
const CONFIG = {
    CANVAS_ELEMENT_ID: "mapCanvas",
    DEM_SOURCE_PATH: "dem_terrain/source.json",
    INITIAL_COORDINATES: new GeoCoordinates(36.4764, 118.1720, 1200),
    ANCHOR_COORDINATES: new GeoCoordinates(36.48619699228674, 118.17270928364879, 350),
    ZOOM_LEVEL: 19,
    TILT: 50.1,
    CANVAS_SPRITE_SIZE: 64,
    PARTICLE_SPRITE_SIZE: { width: 64, height: 64 },
    AUTO_EXPLOSION_INTERVAL: 2000,
    EXPLOSION_TRIGGER_CHANCE: 0.7,
    EXPLOSION_EMITTER_DURATION: 3000,
    FIRE_EMITTER_RATE: { min: 15, max: 20 },
    FIRE_EMITTER_LIFETIME: { min: 2, max: 4 },
    FIRE_EMITTER_RADIUS: 10,
    FIRE_EMITTER_VELOCITY: { min: 200, max: 400 },
    FIRE_EMITTER_SPREAD: 20,
    EXPLOSION_EMITTER_RATE: { min: 50, max: 80 },
    EXPLOSION_EMITTER_LIFETIME: { min: 1, max: 2 },
    EXPLOSION_EMITTER_RADIUS: 5,
    EXPLOSION_EMITTER_VELOCITY: { min: 300, max: 600 },
    FOUNTAIN_EMITTER_RATE: { min: 10, max: 15 },
    FOUNTAIN_EMITTER_LIFETIME: { min: 3, max: 5 },
    FOUNTAIN_EMITTER_RADIUS: 5,
    FOUNTAIN_EMITTER_VELOCITY: { min: 100, max: 200 },
    FOUNTAIN_EMITTER_SPREAD: 45
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
        zoomLevel: CONFIG.ZOOM_LEVEL,
        addBackgroundDatasource: true,
        canvas: canvas,
        tilt: CONFIG.TILT,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            "lights": [
                {
                    "type": "ambient",
                    "color": "#ffffff",
                    "intensity": 0.3,
                    "name": "ambient"
                },
            ],
            "enableShadows": true,
            "celestia": {
                sunTime: new Date().setHours(17, 0, 0, 0),
                atmosphere: false,
                sunCastShadow: true,
                sunIntensity: 5.0,
            },
            "postEffects": {
                "bloom": {
                    "enabled": true,
                    luminancePassEnabled: true,
                    "luminancePassThreshold": 0.3,
                    "strength": 2.5,
                    "radius": 20.0
                },
            }
        }
    });
    mapView.update();
    return mapView;
};
// Initialize map view
const canvas = getMapCanvas();
const mapView = initializeMapView(canvas);
// Initialize map controls
const controls = new MapControls(mapView);
const ui = new MapControlsUI(controls);
canvas.parentElement.appendChild(ui.domElement);
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
// three-nebula particle system manager
class NebulaParticleManager extends THREE.Object3D {
    constructor() {
        super();
        this.system = null;
        this.renderer = null;
        this.currentEmitters = [];
        this.clock = new THREE.Clock();
        this.scale.set(1, 1, 1);
    }
    // Create sprite material
    createSprite() {
        // Use built-in circular texture to avoid external image dependencies
        const canvas = document.createElement('canvas');
        canvas.width = CONFIG.CANVAS_SPRITE_SIZE;
        canvas.height = CONFIG.CANVAS_SPRITE_SIZE;
        const context = canvas.getContext('2d');
        // Create circular gradient
        const gradient = context.createRadialGradient(CONFIG.PARTICLE_SPRITE_SIZE.width / 2, CONFIG.PARTICLE_SPRITE_SIZE.height / 2, 0, CONFIG.PARTICLE_SPRITE_SIZE.width / 2, CONFIG.PARTICLE_SPRITE_SIZE.height / 2, CONFIG.PARTICLE_SPRITE_SIZE.width / 2);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.5, 'rgba(255, 100, 100, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, CONFIG.PARTICLE_SPRITE_SIZE.width, CONFIG.PARTICLE_SPRITE_SIZE.height);
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            color: 0xffffff,
            blending: THREE.AdditiveBlending,
            transparent: true,
        });
        return new THREE.Sprite(material);
    }
    createEmitter(emitterType = 'fire') {
        const emitter = new Emitter();
        let config;
        switch (emitterType) {
            case 'fire':
                config = {
                    rate: new Rate(new Span(CONFIG.FIRE_EMITTER_RATE.min, CONFIG.FIRE_EMITTER_RATE.max), new Span(0.05, 0.1)),
                    initializers: [
                        new Body(this.createSprite()),
                        new Mass(1),
                        new Life(CONFIG.FIRE_EMITTER_LIFETIME.min, CONFIG.FIRE_EMITTER_LIFETIME.max),
                        new Position(new SphereZone(CONFIG.FIRE_EMITTER_RADIUS)),
                        new RadialVelocity(new Span(CONFIG.FIRE_EMITTER_VELOCITY.min, CONFIG.FIRE_EMITTER_VELOCITY.max), new Vector3D(0, 1, 0), CONFIG.FIRE_EMITTER_SPREAD),
                    ],
                    behaviours: [
                        new RandomDrift(5, 5, 5, 0.05),
                        new Scale(new Span(1, 2), 0),
                        new Gravity(3),
                        new Color('#FF4400', ['#FFFF00', '#FF0000'], Infinity, ease.easeOutSine),
                    ],
                    position: { x: 0, y: 0, z: 0 }
                };
                break;
            case 'explosion':
                config = {
                    rate: new Rate(new Span(CONFIG.EXPLOSION_EMITTER_RATE.min, CONFIG.EXPLOSION_EMITTER_RATE.max), new Span(0.01, 0.02)),
                    initializers: [
                        new Body(this.createSprite()),
                        new Mass(1),
                        new Life(CONFIG.EXPLOSION_EMITTER_LIFETIME.min, CONFIG.EXPLOSION_EMITTER_LIFETIME.max),
                        new Position(new SphereZone(CONFIG.EXPLOSION_EMITTER_RADIUS)),
                        new RadialVelocity(new Span(CONFIG.EXPLOSION_EMITTER_VELOCITY.min, CONFIG.EXPLOSION_EMITTER_VELOCITY.max), new Vector3D(0, 0, 0), 360),
                    ],
                    behaviours: [
                        new RandomDrift(8, 8, 8, 0.1),
                        new Scale(new Span(1.5, 3), 0),
                        new Gravity(2),
                        new Color('#FFFF00', ['#FF4500', '#FF0000'], Infinity, ease.easeOutSine),
                    ],
                    position: { x: 0, y: 0, z: 0 }
                };
                break;
            case 'fountain':
                config = {
                    rate: new Rate(new Span(CONFIG.FOUNTAIN_EMITTER_RATE.min, CONFIG.FOUNTAIN_EMITTER_RATE.max), new Span(0.1, 0.2)),
                    initializers: [
                        new Body(this.createSprite()),
                        new Mass(1),
                        new Life(CONFIG.FOUNTAIN_EMITTER_LIFETIME.min, CONFIG.FOUNTAIN_EMITTER_LIFETIME.max),
                        new Position(new SphereZone(CONFIG.FOUNTAIN_EMITTER_RADIUS)),
                        new RadialVelocity(new Span(CONFIG.FOUNTAIN_EMITTER_VELOCITY.min, CONFIG.FOUNTAIN_EMITTER_VELOCITY.max), new Vector3D(0, 1, 0), CONFIG.FOUNTAIN_EMITTER_SPREAD),
                    ],
                    behaviours: [
                        new RandomDrift(3, 3, 3, 0.02),
                        new Scale(new Span(1, 1.5), 0),
                        new Gravity(8),
                        new Color('#00AAFF', ['#0088FF', '#0066FF'], Infinity, ease.easeOutSine),
                    ],
                    position: { x: 0, y: 0, z: 0 }
                };
                break;
        }
        return emitter
            .setRate(config.rate)
            .addInitializers(config.initializers)
            .addBehaviours(config.behaviours)
            .setPosition(config.position)
            .emit();
    }
    // Initialize particle system
    async initializeSystem(emitterType = 'fire') {
        // Clean up existing system
        this.clearSystem();
        // Create new particle system
        this.system = new ParticleSystem();
        // Create emitter
        const emitter = this.createEmitter(emitterType);
        this.currentEmitters = [emitter];
        // Add to system
        this.system.addEmitter(emitter);
        // Create renderer
        this.renderer = new SpriteRenderer(this, THREE);
        this.system.addRenderer(this.renderer);
        console.log(`Nebula particle system initialization completed - Type: ${emitterType}`);
    }
    // Update particle system
    update() {
        const delta = this.clock.getDelta();
        if (this.system) {
            this.system.update(delta);
        }
    }
    // Clear system
    clearSystem() {
        if (this.system) {
            this.system.destroy();
            this.system = null;
        }
        if (this.renderer) {
            this.renderer = null;
        }
        this.currentEmitters = [];
    }
    // Trigger explosion effect
    triggerExplosion() {
        if (this.system) {
            const explosionEmitter = this.createEmitter('explosion');
            this.system.addEmitter(explosionEmitter);
            this.currentEmitters.push(explosionEmitter);
            // Remove explosion emitter after 3 seconds
            setTimeout(() => {
                if (this.system && explosionEmitter) {
                    this.system.removeEmitter(explosionEmitter);
                    this.currentEmitters = this.currentEmitters.filter(e => e !== explosionEmitter);
                }
            }, CONFIG.EXPLOSION_EMITTER_DURATION);
        }
    }
    // Set emission rate
    setEmissionRate(rate) {
        this.currentEmitters.forEach(emitter => {
            if (emitter.rate) {
                emitter.setRate(new Rate(new Span(rate * 0.8, rate * 1.2), new Span(0.05, 0.1)));
            }
        });
    }
    // Set particle scale
    setParticleScale(scale) {
        this.currentEmitters.forEach(emitter => {
            // Update scale behavior
            const scaleBehaviour = emitter.behaviours.find((b) => b instanceof Scale);
            if (scaleBehaviour) {
                scaleBehaviour.scaleA = new Span(scale * 0.8, scale * 1.2);
            }
        });
    }
}
// Configure DEM terrain data source
configureDEMTerrainSource(mapView);
// Create and add particle system manager
const particleManager = new NebulaParticleManager();
//@ts-ignore
particleManager.anchor = CONFIG.ANCHOR_COORDINATES;
particleManager.lookAt(ellipsoidProjection.projectPoint(CONFIG.ANCHOR_COORDINATES, new THREE.Vector3()));
mapView.mapAnchors.add(particleManager);
// Modify animation loop
const originalAnimate = mapView.beginAnimation;
mapView.beginAnimation = function () {
    const result = originalAnimate.call(this);
    const animate = () => {
        particleManager.update();
        requestAnimationFrame(animate);
    };
    animate();
    return result;
};
/**
 * Automatically trigger explosion (if enabled)
 * @param controls Control object
 */
const startAutoExplosion = (controls) => {
    setInterval(() => {
        if (controls.autoExplosion && Math.random() > CONFIG.EXPLOSION_TRIGGER_CHANCE) {
            controls.explosionCount = (controls.explosionCount || 0) + 1;
            particleManager.triggerExplosion();
        }
    }, CONFIG.AUTO_EXPLOSION_INTERVAL);
};
/**
 * Initialize particle system
 */
const initializeParticleSystem = async () => {
    // Initialize default system
    await particleManager.initializeSystem('fire');
    // Start automatic explosion (if enabled)
    startAutoExplosion(controls);
    // Start animation loop
    mapView.beginAnimation();
};
// Start application
try {
    initializeParticleSystem();
    console.log("Three.js particle system example initialized successfully");
}
catch (error) {
    console.error("Error initializing Three.js particle system example:", error);
}
