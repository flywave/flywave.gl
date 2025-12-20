/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection } from "@flywave/flywave-geoutils";
import { createThreeSceneFromGLTF } from "@flywave/flywave-gltf";
import { ExtendedFrustum } from "@flywave/flywave-utils/ExtendedFrustum";
import {
    type Camera,
    type Material,
    type Texture,
    BoxGeometry,
    BufferAttribute,
    BufferGeometry,
    Euler,
    EventDispatcher,
    FrontSide,
    Group,
    InstancedBufferAttribute,
    InstancedMesh,
    LoadingManager,
    Matrix4,
    Mesh,
    Object3D,
    PerspectiveCamera,
    Points,
    PointsMaterial,
    Quaternion,
    Scene,
    TypedArray,
    Vector2,
    Vector3
} from "three";

import { ITile, type Tile, type TileInternal } from "../base/Tile";
import { TilesRendererBase } from "../base/TilesRendererBase";
import { type ViewErrorTarget } from "../base/traverseFunctions";

// Type for matrix transformation function
export type MatrixTransformCallback = (matrix: Matrix4) => Matrix4;
import { type Tiles3DTileContent } from "../loader";
import { estimateBytesUsed } from "../utilities/estimateBytesUsed";
import { TileBoundingVolume } from "../utilities/TileBoundingVolume";
import { raycastTraverse, raycastTraverseFirstHit } from "./raycastTraverse";
import { TilesGroup } from "./TilesGroup";

// Temporary variables for calculations
const _mat = new Matrix4();
const _euler = new Euler();
const tempMat = new Matrix4();
const tempQuaternion = new Quaternion();
const tempVector = new Vector3();
const tempVector2 = new Vector2();
const tempVector3 = new Vector3();

// Symbol for tracking initial frustum culling state
const INITIAL_FRUSTUM_CULLED = Symbol("INITIAL_FRUSTUM_CULLED");

// Constants for axis vectors
const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);

// Temporary object for view error calculations
const viewErrorTarget = {
    inView: false,
    error: Infinity
};

/**
 * Updates frustum culling state for all objects in a scene
 *
 * This function traverses a scene hierarchy and updates the frustumCulled
 * property for each object based on its initial state and the provided flag.
 *
 * @param object The root object to traverse
 * @param toInitialValue Whether to restore initial culling state
 */
function updateFrustumCulled(object: any, toInitialValue: boolean): void {
    object.traverse((c: any) => {
        c.frustumCulled = c[INITIAL_FRUSTUM_CULLED] && toInitialValue;
    });
}

/**
 * The main 3D Tiles renderer class that extends TilesRendererBase with Three.js-specific functionality.
 *
 * This class provides the core rendering functionality for 3D Tiles datasets,
 * including:
 * - Loading and parsing of tile content (B3DM, I3DM, PNTS, etc.)
 * - Hierarchical level-of-detail (HLOD) management
 * - Camera-based culling and level-of-detail selection
 * - Raycasting for picking and interaction
 * - Memory management and resource disposal
 * - Coordinate system transformations (ECEF to local)
 *
 * The renderer handles both explicit tilesets (tileset.json) and implicit tilesets
 * using subtree files. It supports various 3D Tiles extensions and features
 * including batch tables, feature tables, and structural metadata.
 */
export abstract class TilesRenderer extends TilesRendererBase {
    /**
     * Group containing all rendered tiles
     *
     * This group serves as the root container for all tile scenes and
     * handles coordinate transformations between the tileset and the
     * local rendering coordinate system.
     */
    public group: TilesGroup;

    /**
     * Array of cameras tracked by the renderer
     *
     * These cameras are used for frustum culling and level-of-detail
     * calculations. The renderer automatically updates based on the
     * view parameters of these cameras.
     */
    public cameras: Camera[] = [];

    /**
     * Map of cameras to their resolution information
     *
     * This map stores the resolution (width/height) for each tracked
     * camera, which is used in screen space error calculations.
     */
    private readonly cameraMap = new Map<Camera, Vector2>();

    /**
     * Array of camera information for view calculations
     *
     * This array contains precomputed information for each tracked
     * camera, including frustum, projection parameters, and position
     * in the tileset coordinate system.
     */
    private readonly cameraInfo: Array<{
        frustum: ExtendedFrustum;
        isOrthographic: boolean;
        sseDenominator: number;
        position: Vector3;
        invScale: number;
        pixelSize: number;
    }> = [];

    // Internal state
    /**
     * Whether to optimize raycasting (deprecated)
     *
     * This property is deprecated and has no effect.
     */
    private _optimizeRaycast: boolean = true;

    /**
     * Matrix for handling glTF up-axis transformations
     *
     * This matrix stores the rotation needed to align the glTF up-axis
     * with the renderer's expected up-axis.
     */
    private readonly _upRotationMatrix: Matrix4 = new Matrix4();

    /**
     * Whether to automatically disable Three.js frustum culling
     *
     * When true, the renderer manages frustum culling internally
     * and disables Three.js's built-in frustum culling for tile
     * objects to avoid conflicts.
     */
    private _autoDisableRendererCulling: boolean = true;

    /**
     * Loading manager for handling resource loading
     *
     * This manager handles URL preprocessing and loading events
     * for tile content and associated resources.
     */
    public manager: LoadingManager;

    /**
     * Gets the projection used by the renderer
     *
     * This abstract method must be implemented by subclasses to
     * provide the geographic projection used for coordinate
     * transformations.
     *
     * @returns The projection used by the renderer
     */
    protected abstract getProjection(): Projection;

    /**
     * Whether to automatically disable Three.js frustum culling
     */
    get autoDisableRendererCulling(): boolean {
        return this._autoDisableRendererCulling;
    }

    /**
     * Sets whether to automatically disable Three.js frustum culling
     *
     * When set to true, the renderer will disable frustum culling
     * on all loaded models to prevent conflicts with its own
     * culling implementation.
     *
     * @param value Whether to disable renderer culling
     */
    set autoDisableRendererCulling(value: boolean) {
        if (this._autoDisableRendererCulling !== value) {
            this._autoDisableRendererCulling = value;
            this.forEachLoadedModel(scene => {
                updateFrustumCulled(scene, !value);
            });
        }
    }

    /**
     * Whether to optimize raycasting (deprecated)
     */
    get optimizeRaycast(): boolean {
        return this._optimizeRaycast;
    }

    /**
     * Sets whether to optimize raycasting (deprecated)
     *
     * This property is deprecated and has no effect.
     *
     * @param v The new value (ignored)
     */
    set optimizeRaycast(v: boolean) {
        // console.warn('TilesRenderer: The "optimizeRaycast" option has been deprecated.');
        this._optimizeRaycast = v;
    }

    debugBoundingVolume: boolean = false;

    /**
     * Matrix transformation callback that can be applied to transformMatrix
     */
    matrixTransformCallback: MatrixTransformCallback | null = null;

    /**
     * Shared material for points rendering
     */
    private m_pointsMaterial: PointsMaterial;

    /**
     * Size of points in the point cloud
     */
    public pointSize: number = 0.5;

    /**
     * Sets the size of points in the point cloud
     * 
     * @param size The new size for points
     */
    setPointSize(size: number): void {
        this.pointSize = size;
        this.m_pointsMaterial.size = size;
    }

    /**
     * Creates a new TilesRenderer instance
     *
     * @param url The URL of the root tileset
     */
    constructor(url: string) {
        super(url);

        // Initialize core components
        this.group = new TilesGroup(this);

        // Initialize shared points material
        this.m_pointsMaterial = new PointsMaterial({
            size: this.pointSize,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: false
        });

        // Configure LRU cache memory estimation
        this.lruCache.computeMemoryUsageCallback = (tile: any) => tile.cached.bytesUsed ?? null;

        // Set up loading manager with URL preprocessing
        this.manager = new LoadingManager();
        this.manager.setURLModifier((url: string) => {
            return this.preprocessURL ? this.preprocessURL(url) : url;
        });
    }

    // EventDispatcher methods
    /**
     * Adds an event listener
     * @param args Arguments passed to EventDispatcher.addEventListener
     */
    addEventListener(...args: any[]): void {
        EventDispatcher.prototype.addEventListener.call(this, ...args);
    }

    /**
     * Checks if an event listener exists
     * @param args Arguments passed to EventDispatcher.hasEventListener
     */
    hasEventListener(...args: any[]): void {
        EventDispatcher.prototype.hasEventListener.call(this, ...args);
    }

    /**
     * Removes an event listener
     * @param args Arguments passed to EventDispatcher.removeEventListener
     */
    removeEventListener(...args: any[]): void {
        EventDispatcher.prototype.removeEventListener.call(this, ...args);
    }

    /**
     * Dispatches an event
     * @param args Arguments passed to EventDispatcher.dispatchEvent
     */
    dispatchEvent(...args: any[]): void {
        EventDispatcher.prototype.dispatchEvent.call(this, ...args);
    }

    /* Public API Methods */

    /**
     * Gets the axis-aligned bounding box of the root tile
     *
     * @param target Target box to store the result
     * @returns Whether the bounding box was found
     */
    getBoundingBox(target: any): boolean {
        if (!this.root) return false;
        const boundingVolume = this.root.cached.boundingVolume;
        if (boundingVolume) {
            boundingVolume.getAABB(target);
            return true;
        }
        return false;
    }

    /**
     * Gets the oriented bounding box of the root tile
     *
     * @param targetBox Target box to store the result
     * @param targetMatrix Target matrix to store the orientation
     * @returns Whether the OBB was found
     */
    getOrientedBoundingBox(targetBox: any, targetMatrix: Matrix4): boolean {
        if (!this.root) return false;
        const boundingVolume = this.root.cached.boundingVolume;
        if (boundingVolume) {
            boundingVolume.getOBB(targetBox, targetMatrix);
            return true;
        }
        return false;
    }

    /**
     * Gets the bounding sphere of the root tile
     *
     * @param target Target sphere to store the result
     * @returns Whether the bounding sphere was found
     */
    getBoundingSphere(target: any): boolean {
        if (!this.root) return false;
        const boundingVolume = this.root.cached.boundingVolume;
        if (boundingVolume) {
            boundingVolume.getSphere(target);
            return true;
        }
        return false;
    }

    /**
     * Executes a callback for each loaded model in the tileset
     *
     * This function traverses all loaded tiles and calls the provided
     * callback for each tile that has a cached scene.
     *
     * @param callback Function to call for each loaded model
     */
    forEachLoadedModel(callback: (scene: any, tile: any) => void): void {
        this.traverse(
            (tile: any) => {
                const scene = tile.cached?.scene;
                if (scene) {
                    callback(scene, tile);
                }
            },
            null,
            false
        );
    }

    /**
     * Performs raycasting against the tileset
     *
     * This function performs hierarchical raycasting against the tileset,
     * either finding the first hit (if raycaster.firstHitOnly is true)
     * or all hits.
     *
     * @param raycaster The raycaster to use
     * @param intersects Array to store intersection results
     */
    raycast(raycaster: any, intersects: any[]): void {
        if (!this.root) return;

        if (raycaster.firstHitOnly) {
            const hit = raycastTraverseFirstHit(this, this.root, raycaster);
            if (hit) {
                intersects.push(hit);
            }
        } else {
            raycastTraverse(this, this.root, raycaster, intersects);
        }
    }

    /**
     * Checks if a camera is being tracked by the renderer
     *
     * @param camera The camera to check
     * @returns Whether the camera is being tracked
     */
    hasCamera(camera: any): boolean {
        return this.cameraMap.has(camera);
    }

    /**
     * Adds a camera to be tracked by the renderer
     *
     * @param camera The camera to add
     * @returns Whether the camera was added (false if already exists)
     */
    setCamera(camera: any): boolean {
        if (!this.cameraMap.has(camera)) {
            this.cameraMap.set(camera, new Vector2());
            this.cameras.push(camera);
            this.dispatchEvent({ type: "add-camera", camera });
            return true;
        }
        return false;
    }

    /**
     * Sets the resolution for a tracked camera
     *
     * @param camera The camera to update
     * @param xOrVec Either width or a Vector2 containing width/height
     * @param y The height (if xOrVec is not a Vector2)
     * @returns Whether the resolution was set (false if camera not found)
     */
    setResolution(camera: any, xOrVec: number | Vector2, y?: number): boolean {
        if (!this.cameraMap.has(camera)) return false;

        const width = xOrVec instanceof Vector2 ? xOrVec.x : xOrVec;
        const height = xOrVec instanceof Vector2 ? xOrVec.y : y;
        const cameraVec = this.cameraMap.get(camera);

        if (cameraVec!.x !== width || cameraVec!.y !== height) {
            cameraVec!.set(width, height || 0);
            this.dispatchEvent({ type: "camera-resolution-change" });
        }

        return true;
    }

    /**
     * Sets camera resolution from a renderer's current size
     *
     * @param camera The camera to update
     * @param renderer The renderer to get size from
     * @returns Whether the resolution was set
     */
    setResolutionFromRenderer(camera: any, renderer: any): boolean {
        renderer.getSize(tempVector2);
        return this.setResolution(camera, tempVector2.x, tempVector2.y);
    }

    /**
     * Removes a camera from tracking
     *
     * @param camera The camera to remove
     * @returns Whether the camera was removed (false if not found)
     */
    deleteCamera(camera: any): boolean {
        if (this.cameraMap.has(camera)) {
            const index = this.cameras.indexOf(camera);
            this.cameras.splice(index, 1);
            this.cameraMap.delete(camera);
            this.dispatchEvent({ type: "delete-camera", camera });
            return true;
        }
        return false;
    }

    /* Overridden Methods */

    /**
     * Loads the root tileset with additional processing for glTF up-axis and ellipsoid
     *
     * This function extends the base implementation to handle glTF up-axis
     * transformations and ellipsoid extensions.
     *
     * @returns Promise that resolves with the loaded tileset
     */
    async loadRootTileSet(): Promise<any> {
        return await super.loadRootTileSet().then((root: any) => {
            // Cache the glTF tile set rotation matrix based on up-axis
            const { asset, extensions = {} } = root;
            const upAxis = asset?.gltfUpAxis || "y";
            switch (upAxis.toLowerCase()) {
                case "x":
                    this._upRotationMatrix.makeRotationAxis(Y_AXIS, -Math.PI / 2);
                    break;
                case "y":
                    this._upRotationMatrix.makeRotationAxis(X_AXIS, Math.PI / 2);
                    break;
            }

            // Update the ellipsoid based on the extension
            // if ("3DTILES_ellipsoid" in extensions) {
            //     const ext = extensions["3DTILES_ellipsoid"];
            //     const { ellipsoid } = this;
            //     ellipsoid.name = ext.body;
            //     ellipsoid.radius.set(...(ext.radii || [1, 1, 1]));
            // }

            return root;
        });
    }

    /**
     * Updates the tileset rendering based on current camera views
     *
     * This function performs the main update loop for the renderer,
     * including:
     * - Updating camera information
     * - Performing frustum culling
     * - Calculating level-of-detail
     * - Loading and unloading tiles
     * - Updating tile visibility
     */
    update(): void {
        // Check if plugins require an update
        const needsUpdate: boolean | null = null;
        // this.invokeAllPlugins((plugin: any) => {
        //     if (plugin.doTilesNeedUpdate) {
        //         const res = plugin.doTilesNeedUpdate();
        //         needsUpdate = needsUpdate === null ? res : needsUpdate || res;
        //     }
        // });

        if (needsUpdate === false) {
            this.dispatchEvent({ type: "update-before" });
            this.dispatchEvent({ type: "update-after" });
            return;
        }

        // Begin update process
        this.dispatchEvent({ type: "update-before" });

        const { group, cameras, cameraMap, cameraInfo } = this;

        // Adjust camera info array size to match active cameras
        while (cameraInfo.length > cameras.length) {
            cameraInfo.pop();
        }
        while (cameraInfo.length < cameras.length) {
            cameraInfo.push({
                frustum: new ExtendedFrustum(),
                isOrthographic: false,
                sseDenominator: -1,
                position: new Vector3(),
                invScale: -1,
                pixelSize: 0
            });
        }

        // Check for non-uniform scale
        tempVector.setFromMatrixScale(group.matrixWorldInverse);
        if (Math.abs(Math.max(tempVector.x - tempVector.y, tempVector.x - tempVector.z)) > 1e-6) {
            // console.warn(
            //     "ThreeTilesRenderer: Non-uniform scale may cause issues with screen space error calculation."
            // );
        }

        // Update camera info for each tracked camera
        for (let i = 0, l = cameraInfo.length; i < l; i++) {
            const camera = cameras[i];
            const info = cameraInfo[i];
            const resolution = cameraMap.get(camera);

            if (resolution?.x === 0 || resolution?.y === 0) {
                // console.warn("TilesRenderer: Camera resolution not set for error calculation.");
            }

            // Determine camera type and setup parameters
            const projection = camera.projectionMatrix.elements;
            info.isOrthographic = projection[15] === 1;

            if (info.isOrthographic) {
                const w = 2 / projection[0];
                const h = 2 / projection[5];
                info.pixelSize = Math.max(h / resolution!.y, w / resolution!.x);
            } else {
                info.sseDenominator = 2 / projection[5] / resolution!.y;
            }

            if (camera instanceof PerspectiveCamera) camera.updateProjectionMatrix();
            camera.updateMatrixWorld();
            info.frustum.setFromProjectionMatrix(
                new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
            );

            // Update camera position in group root frame
            info.position
                // .set(0, 0, 0)
                .copy(camera.position);
            // .applyMatrix4(group.matrixWorldInverse);
        }

        // Perform base update
        super.update();
        this.dispatchEvent({ type: "update-after" });

        // Warn if no cameras are set and no plugins provide error calculation
        // if (cameras.length === 0 && this.root) {
        //     let found = false;
        //     this.invokeAllPlugins((plugin: any) => {
        //         found = found || (plugin !== this && plugin.calculateTileViewError);
        //         return found;
        //     });
        //     if (!found) {
        //         console.warn("TilesRenderer: No cameras defined. Cannot update 3D tiles.");
        //     }
        // }
    }

    /**
     * Preprocesses a tile node, setting up transforms and bounding volumes
     *
     * This function extends the base implementation to set up the tile's
     * transformation matrices and bounding volume in the renderer's
     * coordinate system.
     *
     * @param tile The tile to preprocess
     * @param tileSetDir The base directory of the tileset
     * @param parentTile The parent tile (optional)
     */
    preprocessNode(tile: TileInternal, tileSetDir: string, parentTile: TileInternal = null): void {
        super.preprocessNode(tile, tileSetDir, parentTile);

        // Set up transform matrices
        const transform = new Matrix4();
        if (tile.transform) {
            transform.fromArray(tile.transform);
        }

        if (parentTile) {
            transform.premultiply(parentTile.cached.transform);
        }

        const transformInverse = new Matrix4().copy(transform).invert();

        // Set up bounding volume
        const boundingVolume = new TileBoundingVolume();
        if ("sphere" in tile.boundingVolume) {
            const ecefPos = new Vector3().fromArray(tile.boundingVolume.sphere);

            const transformMatrix = new Matrix4().setPosition(ecefPos.x, ecefPos.y, ecefPos.z)

            transformMatrix.premultiply(transform);

            boundingVolume.setSphereData(
                this.getProjection(),
                ...[0, 0, 0, tile.boundingVolume.sphere[3]],
                this.matrixTransformCallback?.(transformMatrix) || transformMatrix
            );
        } else if ("box" in tile.boundingVolume) {
            const ecefPos = new Vector3().fromArray(tile.boundingVolume.box);
            const transformMatrix = new Matrix4().setPosition(ecefPos.x, ecefPos.y, ecefPos.z)
            transformMatrix.premultiply(transform);
            const box = [...tile.boundingVolume.box] as typeof tile.boundingVolume.box;

            box[0] = 0;
            box[1] = 0;
            box[2] = 0;

            boundingVolume.setObbData(this.getProjection(), box, this.matrixTransformCallback?.(transformMatrix) || transformMatrix);
        } else if ("region" in tile.boundingVolume) {
            boundingVolume.setRegionData(this.getProjection(), ...tile.boundingVolume.region);
        }

        // Initialize cached data
        tile.cached = {
            transform,
            transformInverse,
            active: false,
            boundingVolume,
            debugBoundingVolume: null,
            scene: null,
            bytesUsed: 0,
            geometry: null,
            materials: null,
            textures: null
        };
    }

    private createPointsScene(content: Tiles3DTileContent): {
        scene: Scene
    } {
        const scene = new Scene();

        if (!content.attributes.positions) {
            return { scene };
        }

        const positions = new BufferAttribute(new Float32Array(content.attributes.positions), 3);

        const geometry = new BufferGeometry();
        geometry.setAttribute('position', positions);

        // Key fix point 2: Color processing
        if (content.attributes.colors) {
            let colors: BufferAttribute;
            const colorData = content.attributes.colors;

            if (Array.isArray(colorData)) {
                // If it's an RGB array [r, g, b, r, g, b, ...]
                colors = new BufferAttribute(new Float32Array(colorData), 3);
            } else if (colorData.value instanceof Uint8Array || colorData.value instanceof Uint8ClampedArray) {
                // Key fix point 3: Correctly handle Uint8 color data
                const colorArray = new Float32Array(colorData.value.length);
                for (let i = 0; i < colorData.value.length; i++) {
                    colorArray[i] = colorData.value[i] / 255.0;
                }
                colors = new BufferAttribute(colorArray, colorData.size || 3);
            } else {
                // Default white
                const defaultColors = new Float32Array(positions.count * 3);
                defaultColors.fill(1.0);
                colors = new BufferAttribute(defaultColors, 3);
            }

            geometry.setAttribute('color', colors);

            // Use shared material and ensure vertex colors are enabled
            this.m_pointsMaterial.vertexColors = true;
        } else {
            // Use shared material and ensure vertex colors are disabled
            this.m_pointsMaterial.vertexColors = false;
        }

        // Key fix point 6: Normal processing (if needed)
        if (content.attributes.normals) {
            const normalsData = content.attributes.normals;
            let normals: BufferAttribute | null = null;

            if (Array.isArray(normalsData)) {
                normals = new BufferAttribute(new Float32Array(normalsData), 3);
            } else if (normalsData && typeof normalsData === 'object' && 'value' in normalsData) {
                const typedNormals = normalsData as { value: Float32Array; size?: number };
                if (typedNormals.value instanceof Float32Array) {
                    normals = new BufferAttribute(typedNormals.value, typedNormals.size || 3);
                }
            } else if (normalsData instanceof Float32Array) {
                normals = new BufferAttribute(normalsData, 3);
            }

            if (normals) {
                geometry.setAttribute('normal', normals);
            }
        }

        // Key fix point 7: Calculate bounding box
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const points = new Points(geometry, this.m_pointsMaterial);
        scene.add(points);

        return { scene };
    }

    /**
     * Parses tile content based on file type
     *
     * This function handles parsing of different tile content types:
     * - B3DM (Batched 3D Model)
     * - I3DM (Instanced 3D Model)
     * - PNTS (Points)
     * - Subtree files
     *
     * It also handles coordinate transformations, up-axis alignment,
     * and resource management.
     *
     * @param metadata The tile content metadata
     * @param tile The tile being parsed
     * @param extension The file extension
     * @param uri The content URI
     * @param abortSignal Signal for aborting the operation
     * @returns Promise that resolves when parsing is complete
     */
    async parseTile(
        metadata: Tiles3DTileContent,
        tile: Tile,
        extension: string,
        uri: string,
        abortSignal: AbortSignal
    ): Promise<void> {
        if (super.parseTile(metadata, tile, extension, uri, abortSignal)) {
            return;
        }
        const res = extension === "pnts" ? this.createPointsScene(metadata) : createThreeSceneFromGLTF(metadata.gltf);

        const instances: InstancedMesh[] = [];
        const meshes: Array<Mesh | InstancedMesh> = [];
        const originalMatrices: Matrix4[] = [];
        let scene: Object3D = res.scene;

        if (metadata.type == "i3dm") {
            // Handle instanced models
            res.scene.traverse((child: Object3D) => {
                if (child instanceof Mesh || child instanceof InstancedMesh) {
                    meshes.push(child);
                    originalMatrices.push(child.matrixWorld.clone());


                    if (child instanceof InstancedMesh) {
                        // Expand existing InstancedMesh instances
                        const newInstancedMesh = new InstancedMesh(
                            child.geometry,
                            child.material,
                            metadata.instances.length
                        );
                        newInstancedMesh.updateMatrixWorld();
                        instances.push(newInstancedMesh);
                    } else {
                        // Convert regular Mesh to InstancedMesh
                        const instancedMesh = new InstancedMesh(
                            child.geometry,
                            child.material,
                            metadata.instances.length
                        );
                        instancedMesh.updateMatrixWorld();
                        instances.push(instancedMesh);
                    }
                }
            });

            // Use the position of the first instance as the origin
            const origin = new Vector3();
            if (metadata.instances.length > 0) {
                metadata.instances[0].modelMatrix.decompose(origin, tempQuaternion, tempVector3);
            }

            // Create origin transformation matrix
            const originMatrix = new Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z);

            // Apply instance transformations with origin normalization
            for (let i = 0; i < metadata.instances.length; i++) {
                for (let j = 0; j < meshes.length; j++) {
                    const mesh = meshes[j];
                    const instance = instances[j];
                    const originalMatrix = originalMatrices[j];

                    // Get the world matrix of the instance and convert to the origin coordinate system
                    const instanceWorldMatrix = metadata.instances[i].modelMatrix.clone();
                    instanceWorldMatrix.premultiply(originMatrix); // Convert to origin-relative coordinates

                    if (mesh instanceof InstancedMesh) {
                        // Handle original InstancedMesh expansion
                        const originalInstanceCount = mesh.count;
                        for (let k = 0; k < originalInstanceCount; k++) {
                            mesh.getMatrixAt(k, tempMat);

                            tempMat.multiplyMatrices(instanceWorldMatrix, tempMat);
                            tempMat.multiply(originalMatrix);

                            const instanceIndex = i * originalInstanceCount + k;
                            instance.setMatrixAt(instanceIndex, tempMat);
                        }
                    } else {
                        // Handle regular Mesh conversion
                        tempMat.copy(instanceWorldMatrix);
                        tempMat.multiply(originalMatrix);
                        instance.setMatrixAt(i, tempMat);
                    }
                    mesh.geometry.setAttribute("_batchId", new InstancedBufferAttribute(new Uint32Array(metadata.instances.length).fill(metadata.instances[i].batchId), 1));
                }
            }

            // Create a scene group containing all instances and set it to the origin position
            const instancesGroup = new Group();
            instances.forEach(instance => instancesGroup.add(instance));

            // Move the entire group to the origin position
            instancesGroup.position.copy(origin);
            instancesGroup.updateMatrixWorld(true);

            scene = instancesGroup;
        }

        const upAxis = (this.rootTileSet.asset && this.rootTileSet.asset.gltfUpAxis) || "y";

        switch (upAxis.toLowerCase()) {
            case "x":
                tempMat.makeRotationAxis(Y_AXIS, -Math.PI / 2);
                break;
            case "y":
                tempMat.makeRotationAxis(X_AXIS, Math.PI / 2);
                break;
            case "z":
                tempMat.identity();
                break;
        }

        const transformMatrix = metadata.rtcCenter ? new Matrix4().setPosition(new Vector3().fromArray(metadata.rtcCenter).applyMatrix4(tile.cached.transform)) : tile.cached.transform;

        // Apply matrix transformation callback if provided
        let finalTransformMatrix = transformMatrix;
        if (this.matrixTransformCallback) {
            finalTransformMatrix = this.matrixTransformCallback(transformMatrix.clone());
        }

        // Apply RTC center and transformations
        // scene.position.copy(projectedPos);
        scene.updateMatrix();

        if (extension !== "pnts") {
            scene.matrix.multiply(tempMat);
        }

        scene.matrix.premultiply(finalTransformMatrix);
        scene.matrix.decompose(scene.position, scene.quaternion, scene.scale);

        updateFrustumCulled(scene, !this.autoDisableRendererCulling);

        // Collect resources for disposal
        const materials: Material[] = [];
        const geometry: BufferGeometry[] = [];
        const textures: Texture[] = [];
        scene.traverse((c: Mesh) => {
            if (c.geometry) geometry.push(c.geometry);
            if (c.material) {
                if (Array.isArray(c.material)) {
                    c.material.forEach((m: Material) => {
                        materials.push(m);
                        for (const key in m) {
                            const value = m[key];
                            if (value?.isTexture) textures.push(value);
                        }
                    });
                } else {
                    materials.push(c.material);
                    for (const key in c.material) {
                        const value = c.material[key];
                        if (value?.isTexture) textures.push(value);
                    }
                }
                if (extension !== "pnts") {
                    c.castShadow = true;
                }
            }
        });

        // Handle abort case
        if (abortSignal.aborted) {
            textures.forEach(texture => {
                if (texture.image instanceof ImageBitmap) texture.image.close();
                texture.dispose();
            });
            return;
        }

        // Store parsed data
        tile.cached.materials = materials;
        tile.cached.geometry = geometry;
        tile.cached.textures = textures;
        tile.cached.scene = scene;
        tile.cached.bytesUsed = estimateBytesUsed(scene);

        tile["rebindTileContent"](metadata);

        // Attach batch length information
        if (tile.batchLength > 0) {
            (scene as any).batchLength = tile.batchLength;
        }
    }

    /**
     * Disposes of resources associated with a tile
     *
     * This function cleans up all resources associated with a tile,
     * including:
     * - Scene objects and their hierarchy
     * - Geometry buffers
     * - Materials and textures
     * - Special features (mesh features, structural metadata)
     *
     * @param tile The tile to dispose
     */
    disposeTile(tile: any): void {
        super.disposeTile(tile);

        const cached = tile.cached;
        if (!cached.scene) return;

        // Clean up scene and resources
        const parent = cached.scene.parent;
        if (parent) parent.remove(cached.scene);

        // Dispose of special features
        cached.scene.traverse((child: any) => {
            if (child.userData.meshFeatures) child.userData.meshFeatures.dispose();
            if (child.userData.structuralMetadata) child.userData.structuralMetadata.dispose();
        });

        // Dispose of geometry, materials, and textures
        cached.geometry?.forEach((g: any) => g.dispose());
        cached.materials?.forEach((m: any) => {
            if (Array.isArray(m)) {
                m.forEach((mm: any) => mm.dispose());
            } else {
                m.dispose();
            }
        });
        cached.textures?.forEach((t: any) => {
            if (t.image instanceof ImageBitmap) t.image.close();
            t.dispose();
        });

        // Dispatch event and clear references
        this.dispatchEvent({
            type: "dispose-model",
            scene: cached.scene,
            tile
        });

        cached.scene = null;
        cached.materials = null;
        cached.textures = null;
        cached.geometry = null;
        cached.metadata = null;
    }

    /**
     * Sets a tile's visibility state
     *
     * This function updates a tile's visibility by adding or removing
     * its scene from the renderer's group, and dispatches a visibility
     * change event.
     *
     * @param tile The tile to update
     * @param visible Whether the tile should be visible
     */
    setTileVisible(tile: Tile, visible: boolean): void {
        const scene = tile.cached.scene;
        const group = this.group;


        if (this.debugBoundingVolume) {
            if (visible) {
                if (!tile.cached.debugBoundingVolume) {
                    tile.cached.debugBoundingVolume = new Object3D()
                    tile.debugBoundingVolume("box", tile.cached.debugBoundingVolume);
                }
                group.add(tile.cached.debugBoundingVolume);
            } else {
                group.remove(tile.cached.debugBoundingVolume);
            }
        }

        if (visible) {
            if (scene) {
                group.add(scene);
                scene.updateMatrixWorld(true);
            }
        } else {
            if (scene) {
                group.remove(scene);
            }
        }

        super.setTileVisible(tile, visible);
        this.dispatchEvent({
            type: "tile-visibility-change",
            scene,
            tile,
            visible
        });
    }

    /**
     * Calculates the screen space error for a tile based on camera views
     *
     * This function calculates the screen space error for a tile from
     * the perspective of all tracked cameras, taking into account
     * frustum visibility and distance.
     *
     * @param tile The tile to calculate for
     * @param target Object to store the results
     */
    calculateTileViewError(tile: Tile, target: ViewErrorTarget): void {
        const cached = tile.cached;
        const boundingVolume = cached.boundingVolume;

        let inView = false;
        let inViewError = -Infinity;
        let inViewDistance = Infinity;
        let maxError = -Infinity;
        let minDistance = Infinity;

        // Calculate error from each camera
        for (let i = 0, l = this.cameras.length; i < l; i++) {
            const info = this.cameraInfo[i];
            let error: number, distance: number;

            if (info.isOrthographic) {
                error = tile.geometricError / info.pixelSize;
                distance = Infinity;
            } else {
                distance = boundingVolume.distanceToPoint(info.position);
                error =
                    distance === 0
                        ? Infinity
                        : tile.geometricError / (distance * info.sseDenominator);
            }

            // Check if in camera frustum
            if (boundingVolume.intersectsFrustum(info.frustum)) {
                inView = true;
                inViewError = Math.max(inViewError, error);
                inViewDistance = Math.min(inViewDistance, distance);
            }

            maxError = Math.max(maxError, error);
            minDistance = Math.min(minDistance, distance);
        }

        // Check plugin visibility calculations
        // this.calculateTileViewError(tile, viewErrorTarget);
        if (viewErrorTarget.inView) {
            inView = true;
            inViewError = Math.max(inViewError, viewErrorTarget.error);
        }
        maxError = Math.max(maxError, viewErrorTarget.error);

        // Set target values
        target.inView = inView;
        target.error = inView ? inViewError : maxError;
        target.distanceFromCamera = inView ? inViewDistance : minDistance;
    }

    /**
     * Disposes of all resources
     *
     * This function disposes of all resources managed by the renderer,
     * including tiles, scenes, and the group object.
     */
    dispose(): void {
        super.dispose();
        this.group.removeFromParent();
    }
}
