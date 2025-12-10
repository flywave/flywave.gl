/* Copyright (C) 2025 flywave.gl contributors */

// FixedSizeArrow.ts
import * as THREE from "three";

/**
 * Fixed size arrow component options
 */
export interface FixedSizeArrowOptions {
    /** Arrow size (pixels) */
    size?: number;
    /** Arrow head color */
    headColor?: THREE.Color | number | string;
    /** Arrow shaft color */
    shaftColor?: THREE.Color | number | string;
    /** Whether visible */
    visible?: boolean;
    /** Opacity (0-1) */
    opacity?: number;
}

/**
 * Fixed size arrow component
 * Inherits from THREE.Object3D, maintains fixed size in screen space
 */
export class FixedSizeArrow extends THREE.Object3D {
    // Default options
    private static readonly DEFAULT_OPTIONS: FixedSizeArrowOptions = {
        size: 40,
        headColor: 0xe65c00,
        shaftColor: 0xf9d423,
        visible: true,
        opacity: 1.0
    };

    // Member variables
    private _size: number;
    private _headColor: THREE.Color;
    private _shaftColor: THREE.Color;
    private _opacity: number;
    private _headMesh: THREE.Mesh | null = null;
    private _shaftMesh: THREE.Mesh | null = null;
    private readonly _options: FixedSizeArrowOptions;

    /**
     * Create fixed size arrow
     * @param options Arrow configuration options
     */
    constructor(options: FixedSizeArrowOptions = {}) {
        super();

        // Merge options
        this._options = { ...FixedSizeArrow.DEFAULT_OPTIONS, ...options };

        // Initialize properties
        this._size = this._options.size!;
        this._headColor = new THREE.Color(this._options.headColor!);
        this._shaftColor = new THREE.Color(this._options.shaftColor!);

        // Create arrow geometry
        this.createArrowGeometry();

        // Mark as fixed size object
        (this as any).isFixedSizeArrow = true;
    }

    /**
     * Create arrow geometry
     */
    private createArrowGeometry(): void {
        // Clear existing geometry
        this.clear();

        // Calculate geometry dimensions (using unit dimensions, final size controlled by scaling)
        const headLength = 0.6; // Head length
        const headWidth = 0.4; // Head width
        const shaftLength = 0.8; // Shaft length
        const shaftWidth = 0.1; // Shaft width

        // Create arrow head
        const headGeometry = new THREE.ConeGeometry(headWidth / 2, headLength, 8);
        const headMaterial = new THREE.MeshBasicMaterial({
            color: this._headColor,
            transparent: this._opacity < 1,
            opacity: this._opacity,
            depthTest: false
        });

        this._headMesh = new THREE.Mesh(headGeometry, headMaterial);
        this._headMesh.position.y = shaftLength + headLength / 2;
        this.add(this._headMesh);

        // Create arrow shaft
        const shaftGeometry = new THREE.CylinderGeometry(
            shaftWidth / 2,
            shaftWidth / 2,
            shaftLength,
            8
        );
        const shaftMaterial = new THREE.MeshBasicMaterial({
            color: this._shaftColor,
            transparent: this._opacity < 1,
            opacity: this._opacity,
            depthTest: false
        });

        this._shaftMesh = new THREE.Mesh(shaftGeometry, shaftMaterial);
        this._shaftMesh.position.y = shaftLength / 2;
        this.add(this._shaftMesh);
    }

    /**
     * Update arrow size to maintain fixed screen space size
     * @param camera Camera
     * @param renderer Renderer (optional, for more accurate size calculation)
     */
    public updateSize(camera: THREE.Camera, renderer?: THREE.WebGLRenderer): void {
        if (!camera) return;

        // Calculate distance factor
        const worldPos = new THREE.Vector3().setFromMatrixPosition(this.matrixWorld);
        const distance = worldPos.length();
        // Calculate scale factor to maintain screen space size
        let scaleFactor: number;

        if (camera instanceof THREE.PerspectiveCamera) {
            // Perspective camera calculation
            const fov = camera.fov * (Math.PI / 180);
            const screenHeight = 2 * Math.tan(fov / 2) * distance;
            const canvasHeight = renderer?.domElement.height || window.innerHeight;
            scaleFactor = (this._size / canvasHeight) * screenHeight;
        } else if (camera instanceof THREE.OrthographicCamera) {
            // Orthographic camera calculation
            const zoom = camera.zoom;
            const canvasHeight = renderer?.domElement.height || window.innerHeight;
            scaleFactor = (this._size * zoom) / canvasHeight;

            // Consider orthographic camera range
            const height = camera.top - camera.bottom;
            scaleFactor *= height;
        } else {
            // Default calculation
            scaleFactor = (distance * this._size) / 1000;
        }

        this.scale.set(scaleFactor, scaleFactor, scaleFactor);
    }

    /**
     * Set arrow size
     * @param size New size (pixels)
     */
    public setSize(size: number): void {
        if (this._size !== size) {
            this._size = Math.max(1, size);
            // No need to recreate geometry since size is controlled by scaling
        }
    }

    /**
     * Get arrow size
     */
    public getSize(): number {
        return this._size;
    }

    /**
     * Set head color
     * @param color Color value
     */
    public setHeadColor(color: THREE.Color | number | string): void {
        this._headColor = new THREE.Color(color);
        if (this._headMesh && this._headMesh.material instanceof THREE.MeshBasicMaterial) {
            this._headMesh.material.color.copy(this._headColor);
        }
    }

    /**
     * Get head color
     */
    public getHeadColor(): THREE.Color {
        return this._headColor.clone();
    }

    /**
     * Set arrow color
     * @param color Color value
     */
    public setShaftColor(color: THREE.Color | number | string): void {
        this._shaftColor = new THREE.Color(color);
        if (this._shaftMesh && this._shaftMesh.material instanceof THREE.MeshBasicMaterial) {
            this._shaftMesh.material.color.copy(this._shaftColor);
        }
    }

    /**
     * Get shaft color
     */
    public getShaftColor(): THREE.Color {
        return this._shaftColor.clone();
    }

    /**
     * Set arrow opacity
     * @param opacity Opacity (0-1)
     */
    public setOpacity(opacity: number): void {
        this._opacity = THREE.MathUtils.clamp(opacity, 0, 1);

        if (this._headMesh && this._headMesh.material instanceof THREE.MeshBasicMaterial) {
            this._headMesh.material.opacity = this._opacity;
            this._headMesh.material.transparent = this._opacity < 1;
        }

        if (this._shaftMesh && this._shaftMesh.material instanceof THREE.MeshBasicMaterial) {
            this._shaftMesh.material.opacity = this._opacity;
            this._shaftMesh.material.transparent = this._opacity < 1;
        }
    }

    /**
     * Get opacity
     */
    public getOpacity(): number {
        return this._opacity;
    }

    /**
     * Destroy arrow, release resources
     */
    public dispose(): void {
        if (this._headMesh) {
            this._headMesh.geometry.dispose();
            if (Array.isArray(this._headMesh.material)) {
                this._headMesh.material.forEach(material => {
                    material.dispose();
                });
            } else {
                this._headMesh.material.dispose();
            }
        }

        if (this._shaftMesh) {
            this._shaftMesh.geometry.dispose();
            if (Array.isArray(this._shaftMesh.material)) {
                this._shaftMesh.material.forEach(material => {
                    material.dispose();
                });
            } else {
                this._shaftMesh.material.dispose();
            }
        }

        this.clear();
    }
}

/**
 * Fixed size arrow system
 * Used to manage updates of multiple fixed size arrows
 */
export class FixedSizeArrowSystem {
    private readonly _arrows = new Set<FixedSizeArrow>();
    private _camera: THREE.Camera | null = null;
    private _renderer: THREE.WebGLRenderer | null = null;

    /**
     * Create arrow system
     * @param camera Camera
     * @param renderer Renderer (optional)
     */
    constructor(camera: THREE.Camera, renderer?: THREE.WebGLRenderer) {
        this._camera = camera;
        this._renderer = renderer || null;
    }

    /**
     * Add arrow to system
     * @param arrow Arrow instance
     */
    public add(arrow: FixedSizeArrow): void {
        this._arrows.add(arrow);
    }

    /**
     * Remove arrow from system
     * @param arrow Arrow instance
     */
    public remove(arrow: FixedSizeArrow): void {
        this._arrows.delete(arrow);
    }

    /**
     * Check if arrow is included
     * @param arrow Arrow instance
     */
    public has(arrow: FixedSizeArrow): boolean {
        return this._arrows.has(arrow);
    }

    /**
     * Get all arrows
     */
    public getArrows(): FixedSizeArrow[] {
        return Array.from(this._arrows);
    }

    /**
     * Clear all arrows
     */
    public clear(): void {
        this._arrows.clear();
    }

    /**
     * Update size of all arrows
     */
    public update(): void {
        if (!this._camera) return;

        this._arrows.forEach(arrow => {
            if ((arrow as any).isFixedSizeArrow) {
                arrow.updateSize(this._camera!, this._renderer);
            }
        });
    }

    /**
     * Set camera
     * @param camera Camera instance
     */
    public setCamera(camera: THREE.Camera): void {
        this._camera = camera;
    }

    /**
     * Get current camera
     */
    public getCamera(): THREE.Camera | null {
        return this._camera;
    }

    /**
     * Set renderer
     * @param renderer Renderer instance
     */
    public setRenderer(renderer: THREE.WebGLRenderer): void {
        this._renderer = renderer;
    }

    /**
     * Get current renderer
     */
    public getRenderer(): THREE.WebGLRenderer | null {
        return this._renderer;
    }

    /**
     * Destroy system, release resources
     */
    public dispose(): void {
        this._arrows.forEach(arrow => {
            arrow.dispose();
        });
        this.clear();
        this._camera = null;
        this._renderer = null;
    }
}
