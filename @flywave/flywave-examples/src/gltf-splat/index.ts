/* Copyright (C) 2025 flywave.gl contributors */

import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    CopyrightElementHandler
} from "@flywave/flywave.gl";
import { loadGLTF, GLTFLoader } from "@flywave/flywave-gltf";
import * as THREE from "three";

// GLTF Splat model parameters
interface GLTFSplatParams {
    modelUrl: string;
    scale: number;
    rotation: { x: number; y: number; z: number };
    position: { x: number; y: number; z: number };
    pointSize: number;
    enableSplatting: boolean;
    animationEnabled: boolean;
    castShadow: boolean;
    receiveShadow: boolean;
}

// GLTF Splat model controller
class GLTFSplatController {
    private mapView: MapView;
    private mapControls: MapControls;
    private model: THREE.Object3D | null = null;
    private gltf: any = null;
    private params: GLTFSplatParams;
    private gui: any = null;
    private animationMixer: THREE.AnimationMixer | null = null;
    private clock: THREE.Clock;
    private splatMaterial: THREE.ShaderMaterial | null = null;
    
    constructor() {
        this.params = {
            modelUrl: "resources/gltf-splat/output.gltf",
            scale: 1.0,
            rotation: { x: 0, y: 0, z: 0 },
            position: { x: 0, y: 0, z: 0 },
            pointSize: 1.0,
            enableSplatting: true,
            animationEnabled: true,
            castShadow: true,
            receiveShadow: true
        };
        
        this.clock = new THREE.Clock();
        [this.mapView, this.mapControls] = this.initializeMapView("mapCanvas");
        this.loadGLTFSplatModel();
    }
    
    // Initialize map view
    private initializeMapView(id: string): [MapView, MapControls] {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        
        // Initialize map view
        const mapView = new MapView({
            projection: ellipsoidProjection,
            target: new GeoCoordinates(40.721603666587, -73.96000108689394, 0),
            zoomLevel: 18,
            canvas,
            theme: {
                extends: "resources/tilezen_base_globe.json"
            }
        });
        
        // Add map controls
        const mapControls = new MapControls(mapView);
        mapControls.enabled = true;
        
        // Add UI controls
        const ui = new MapControlsUI(mapControls, { 
            zoomLevel: "input",
            projectionSwitch: true
        });
        canvas.parentElement!.appendChild(ui.domElement);
        
        CopyrightElementHandler.install("copyrightNotice", mapView);
        
        // Resize map to fit window
        const resizeMap = () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        };
        
        // Listen for window size changes
        window.addEventListener("resize", resizeMap);
        resizeMap();
        
        // Start render loop
        mapView.update();
        
        return [mapView, mapControls];
    }
    
    // Load GLTF Splat model
    private async loadGLTFSplatModel() {
        try {
            // Remove existing model
            if (this.model) {
                this.mapView.mapAnchors.remove(this.model);
                this.model = null;
            }
            
            // Load model
            this.gltf = await loadGLTF(this.params.modelUrl, GLTFLoader);
            
            // Get model scene
            this.model = this.gltf.scene;
            
            // If splatting is enabled, apply special material
            if (this.params.enableSplatting) {
                this.applySplatMaterial();
            }
            
            // Set model properties
            this.updateModelProperties();
            
            // Set model anchor position
            //@ts-ignore
            this.model.anchor = new GeoCoordinates(40.721603666587, -73.96000108689394, 100);
            
            // Add to map anchor system
            this.mapView.mapAnchors.add(this.model);
            
            // Initialize animation
            if (this.gltf.animations && this.gltf.animations.length > 0) {
                this.animationMixer = new THREE.AnimationMixer(this.model);
                const action = this.animationMixer.clipAction(this.gltf.animations[0]);
                action.play();
            }
            
            console.log("GLTF Splat model loaded successfully and added to map");
            
            // Expose model to global scope for debugging
            //@ts-ignore
            window.gltfSplatModel = this.model;
            //@ts-ignore
            window.gltfSplatData = this.gltf;
            
        } catch (error) {
            console.error("Error loading GLTF Splat model:", error);
        }
    }
    
    // Apply Splat material
    private applySplatMaterial() {
        if (!this.model) return;
        
        // Create splat shader material
        this.splatMaterial = new THREE.ShaderMaterial({
            vertexShader: `
                attribute vec3 color;
                varying vec3 vColor;
                
                void main() {
                    vColor = color;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = 2.0;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                
                void main() {
                    gl_FragColor = vec4(vColor, 1.0);
                }
            `,
            transparent: true
        });
        
        // Traverse point cloud geometries in model and apply material
        this.model.traverse((child) => {
            if (child instanceof THREE.Points) {
                child.material = this.splatMaterial;
            }
        });
    }
    
    // Update model properties
    private updateModelProperties() {
        if (!this.model) return;
        
        // Set scale
        this.model.scale.set(this.params.scale, this.params.scale, this.params.scale);
        
        // Set rotation
        this.model.rotation.set(
            THREE.MathUtils.degToRad(this.params.rotation.x),
            THREE.MathUtils.degToRad(this.params.rotation.y),
            THREE.MathUtils.degToRad(this.params.rotation.z)
        );
        
        // Set position offset
        this.model.position.set(
            this.params.position.x,
            this.params.position.y,
            this.params.position.z
        );
        
        // Set shadow properties
        this.model.traverse((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
                child.castShadow = this.params.castShadow;
                child.receiveShadow = this.params.receiveShadow;
            }
        });
    }
    
    // Update parameters
    updateParams(newParams: Partial<GLTFSplatParams>) {
        this.params = { ...this.params, ...newParams };
        
        // If model URL changes, reload model
        if (newParams.modelUrl !== undefined) {
            this.loadGLTFSplatModel();
        } else {
            // Otherwise only update model properties
            if (newParams.enableSplatting !== undefined) {
                this.loadGLTFSplatModel();
            } else {
                this.updateModelProperties();
            }
        }
    }
    
    // Get current parameters
    getParams(): GLTFSplatParams {
        return { ...this.params };
    }
    
    // Reload model
    reloadModel() {
        this.loadGLTFSplatModel();
        console.log("Reload GLTF Splat model");
    }
    
    // Get model information
    getModelInfo() {
        if (this.gltf) {
            return {
                animations: this.gltf.animations ? this.gltf.animations.length : 0,
                scenes: this.gltf.scenes ? this.gltf.scenes.length : 0,
                cameras: this.gltf.cameras ? this.gltf.cameras.length : 0,
                hasAnimations: !!(this.gltf.animations && this.gltf.animations.length > 0),
                hasSplatData: this.params.enableSplatting
            };
        }
        return null;
    }
    
    // Render animation
    renderAnimation() {
        if (this.animationMixer && this.params.animationEnabled) {
            const delta = this.clock.getDelta();
            this.animationMixer.update(delta);
        }
    }
    
    // Initialize UI control panel
    initializeUI() {
        if (!(window as any).dat) {
            console.warn("dat.GUI not available, skipping UI initialization");
            return;
        }
        
        this.gui = new (window as any).dat.GUI({ name: 'GLTF Splat Controls' });
        
        // Model controls
        const modelFolder = this.gui.addFolder('Model Settings');
        modelFolder.add(this.params, 'modelUrl').name('Model URL').onChange((value: string) => {
            this.updateParams({ modelUrl: value });
        });
        modelFolder.add(this.params, 'scale', 0.1, 10).name('Scale').onChange((value: number) => {
            this.updateParams({ scale: value });
        });
        modelFolder.add(this.params, 'enableSplatting').name('Enable Splatting').onChange((value: boolean) => {
            this.updateParams({ enableSplatting: value });
        });
        
        // Rotation controls
        const rotationFolder = this.gui.addFolder('Rotation Settings');
        rotationFolder.add(this.params.rotation, 'x', -180, 180).name('X-axis Rotation').onChange((value: number) => {
            this.updateParams({ rotation: { ...this.params.rotation, x: value } });
        });
        rotationFolder.add(this.params.rotation, 'y', -180, 180).name('Y-axis Rotation').onChange((value: number) => {
            this.updateParams({ rotation: { ...this.params.rotation, y: value } });
        });
        rotationFolder.add(this.params.rotation, 'z', -180, 180).name('Z-axis Rotation').onChange((value: number) => {
            this.updateParams({ rotation: { ...this.params.rotation, z: value } });
        });
        
        // Position controls
        const positionFolder = this.gui.addFolder('Position Settings');
        positionFolder.add(this.params.position, 'x', -100, 100).name('X-axis Position').onChange((value: number) => {
            this.updateParams({ position: { ...this.params.position, x: value } });
        });
        positionFolder.add(this.params.position, 'y', -100, 100).name('Y-axis Position').onChange((value: number) => {
            this.updateParams({ position: { ...this.params.position, y: value } });
        });
        positionFolder.add(this.params.position, 'z', -100, 100).name('Z-axis Position').onChange((value: number) => {
            this.updateParams({ position: { ...this.params.position, z: value } });
        });
        
        // Splat controls
        const splatFolder = this.gui.addFolder('Splat Settings');
        splatFolder.add(this.params, 'pointSize', 0.1, 5).name('Point Size').onChange((value: number) => {
            // Update point size
            console.log("Point size updated:", value);
        });
        
        // Render controls
        const renderFolder = this.gui.addFolder('Render Settings');
        renderFolder.add(this.params, 'animationEnabled').name('Enable Animation').onChange((value: boolean) => {
            this.updateParams({ animationEnabled: value });
        });
        renderFolder.add(this.params, 'castShadow').name('Cast Shadow').onChange((value: boolean) => {
            this.updateParams({ castShadow: value });
        });
        renderFolder.add(this.params, 'receiveShadow').name('Receive Shadow').onChange((value: boolean) => {
            this.updateParams({ receiveShadow: value });
        });
        
        // Operation controls
        const operationFolder = this.gui.addFolder('Operations');
        operationFolder.add({ reload: () => this.reloadModel() }, 'reload').name('Reload');
        operationFolder.add({ info: () => console.log("Model Info:", this.getModelInfo()) }, 'info').name('Model Info');
        
        // Expand folders
        modelFolder.open();
        rotationFolder.open();
        positionFolder.open();
        splatFolder.open();
        renderFolder.open();
        operationFolder.open();
    }
}

// Initialize GLTF Splat model controller
const splatController = new GLTFSplatController();

// Initialize UI control panel
splatController.initializeUI();

// Expose controller to global scope for debugging
//@ts-ignore
window.splatController = splatController;
//@ts-ignore
window.mapView = splatController['mapView'];

console.log('GLTF Splat model loading example loaded with full implementation');