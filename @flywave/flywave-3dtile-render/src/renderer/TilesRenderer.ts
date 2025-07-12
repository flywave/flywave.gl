import {
    Matrix4,
    Vector3,
    Vector2,
    Euler,
    LoadingManager,
    EventDispatcher,
    Group,
    InstancedMesh,
    Mesh,
    Object3D,
    Quaternion,
    Material,
    BufferGeometry,
    Texture,
    Intersection
} from "three";
import { raycastTraverse, raycastTraverseFirstHit } from "./raycastTraverse";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { TilesRendererBase } from "../base/TilesRendererBase";
import { TilesGroup } from "./TilesGroup";
import { ExtendedFrustum } from "../utilities/ExtendedFrustum";
import { TileBoundingVolume } from "../utilities/TileBoundingVolume";
import { Tile, TileInternal } from "../base/Tile";
import { Projection } from "@flywave/flywave-geoutils";
import { Tiles3DTileContent } from "../next";
import { createThreeSceneFromGLTF } from "@flywave/flywave-gltf";
import { estimateBytesUsed } from "../utilities/estimateBytesUsed";
import { transformECEFToProjection } from "../utilities/ecefToSphere";
import { ViewErrorTarget } from "../base/traverseFunctions";

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
 * Handles loading, rendering, and managing 3D Tiles datasets with camera management and raycasting.
 */
export abstract class TilesRenderer extends TilesRendererBase {
    // Group containing all rendered tiles
    public group: TilesGroup;

    // Camera management
    public cameras: any[] = [];
    private cameraMap: Map<any, Vector2> = new Map();
    private cameraInfo: Array<{
        frustum: ExtendedFrustum;
        isOrthographic: boolean;
        sseDenominator: number;
        position: Vector3;
        invScale: number;
        pixelSize: number;
    }> = [];

    // Internal state
    private _optimizeRaycast: boolean = true;
    private _upRotationMatrix: Matrix4 = new Matrix4();
    private _autoDisableRendererCulling: boolean = true;
    public manager: LoadingManager;
    private _listeners: Record<string, any> = {};

    protected abstract getProjection(): Projection;

    /**
     * Whether to automatically disable Three.js frustum culling
     */
    get autoDisableRendererCulling(): boolean {
        return this._autoDisableRendererCulling;
    }

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

    set optimizeRaycast(v: boolean) {
        console.warn('TilesRenderer: The "optimizeRaycast" option has been deprecated.');
        this._optimizeRaycast = v;
    }

    /**
     * Creates a new TilesRenderer instance
     * @param args Arguments passed to the base class
     */
    constructor(...args: any[]) {
        super(...args);

        // Initialize core components
        this.group = new TilesGroup(this);

        // Configure LRU cache memory estimation
        this.lruCache.computeMemoryUsageCallback = (tile: any) => tile.cached.bytesUsed ?? null;

        // Set up loading manager with URL preprocessing
        this.manager = new LoadingManager();
        this.manager.setURLModifier((url: string) => {
            return this.preprocessURL ? this.preprocessURL(url) : url;
        });
    }

    // EventDispatcher methods
    addEventListener(...args: any[]): void {
        EventDispatcher.prototype.addEventListener.call(this, ...args);
    }

    hasEventListener(...args: any[]): void {
        EventDispatcher.prototype.hasEventListener.call(this, ...args);
    }

    removeEventListener(...args: any[]): void {
        EventDispatcher.prototype.removeEventListener.call(this, ...args);
    }

    dispatchEvent(...args: any[]): void {
        EventDispatcher.prototype.dispatchEvent.call(this, ...args);
    }

    /* Public API Methods */

    /**
     * Gets the bounding box of the root tile
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
     * @param camera The camera to check
     * @returns Whether the camera is being tracked
     */
    hasCamera(camera: any): boolean {
        return this.cameraMap.has(camera);
    }

    /**
     * Adds a camera to be tracked by the renderer
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
     * @param args Arguments passed to the base implementation
     * @returns Promise that resolves with the loaded tileset
     */
    async loadRootTileSet(): Promise<any> {
        return super.loadRootTileSet().then((root: any) => {
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
     */
    update(): void {
        // Check if plugins require an update
        let needsUpdate: boolean | null = null;
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
            console.warn(
                "ThreeTilesRenderer: Non-uniform scale may cause issues with screen space error calculation."
            );
        }

        // Update camera info for each tracked camera
        for (let i = 0, l = cameraInfo.length; i < l; i++) {
            const camera = cameras[i];
            const info = cameraInfo[i];
            const resolution = cameraMap.get(camera);

            if (resolution?.x === 0 || resolution?.y === 0) {
                console.warn("TilesRenderer: Camera resolution not set for error calculation.");
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

            camera.updateProjectionMatrix();
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
            boundingVolume.setSphereData(...tile.boundingVolume.sphere, transform);
        } else if ("box" in tile.boundingVolume) {
            boundingVolume.setObbData(tile.boundingVolume.box, transform);
        } else if ("region" in tile.boundingVolume) {
            boundingVolume.setRegionData(this.getProjection(), ...tile.boundingVolume.region);
        }

        // Initialize cached data
        tile.cached = {
            transform,
            transformInverse,
            active: false,
            boundingVolume,
            scene: null,
            bytesUsed: 0,
            geometry: null,
            materials: null,
            textures: null
        };
    }

    /**
     * Parses tile content based on file type
     * @param buffer The content buffer
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
        const res = createThreeSceneFromGLTF(metadata.gltf);

        const instances: InstancedMesh[] = [];
        const meshes: (Mesh | InstancedMesh)[] = [];
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

            // Apply instance transformations
            for (let i = 0; i < metadata.instances.length; i++) {
                for (let j = 0; j < meshes.length; j++) {
                    const mesh = meshes[j];
                    const instance = instances[j];
                    const originalMatrix = originalMatrices[j];
                    metadata.instances[i].modelMatrix.decompose(
                        tempVector,
                        tempQuaternion,
                        tempVector3
                    );

                    if (mesh instanceof InstancedMesh) {
                        // Handle original InstancedMesh expansion
                        const originalInstanceCount = mesh.count;
                        for (let k = 0; k < originalInstanceCount; k++) {
                            mesh.getMatrixAt(k, tempMat);
                            tempMat.compose(tempVector, tempQuaternion, tempVector3);
                            tempMat.multiply(originalMatrix);
                            tempMat.multiply(tempMat);

                            const instanceIndex = i * originalInstanceCount + k;
                            instance.setMatrixAt(instanceIndex, tempMat);
                        }
                    } else {
                        // Handle regular Mesh conversion
                        tempMat.compose(tempVector, tempQuaternion, tempVector3);
                        tempMat.multiply(originalMatrix);
                        instance.setMatrixAt(i, tempMat);
                    }
                }
            }

            scene = new Group();
            instances.forEach(instance => scene.add(instance));
        }

        const upAxis = (this.rootTileSet.asset && this.rootTileSet.asset.gltfUpAxis) || "y";
        const cached = tile.cached;
        const cachedTransform = cached.transform;

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

        const { transformMatrix } = transformECEFToProjection(
            new Vector3().fromArray(metadata.rtcCenter),
            this.getProjection()
        );

        // Apply RTC center and transformations
        // scene.position.copy(projectedPos);
        scene.updateMatrix();

        if (extension !== "pnts") {
            scene.matrix.multiply(tempMat);
        }

        scene.matrix.premultiply(tile.cached.transform).premultiply(transformMatrix);
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
    }

    /**
     * Disposes of resources associated with a tile
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
        cached.materials?.forEach((m: any) => m.dispose());
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
     * @param tile The tile to update
     * @param visible Whether the tile should be visible
     */
    setTileVisible(tile: any, visible: boolean): void {
        const scene = tile.cached.scene;
        const group = this.group;

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
     */
    dispose(): void {
        super.dispose();
        this.group.removeFromParent();
    }
}
