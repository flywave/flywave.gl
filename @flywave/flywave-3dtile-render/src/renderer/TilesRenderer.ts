import { TilesRendererBase } from "../base/TilesRendererBase";
import { TilesGroup } from "./TilesGroup";

import {
    Matrix4,
    Box3,
    Sphere,
    Vector3,
    Vector2,
    Frustum,
    LoadingManager,
    Object3D,
    WebGLRenderer,
    Raycaster,
    Intersection,
    BufferGeometry,
    Material,
    Texture,
    PerspectiveCamera,
    Mesh,
    InstancedMesh,
    Quaternion,
    Group
} from "three";
import { raycastTraverse, raycastTraverseFirstHit } from "./raycastTraverse";
import { Tile, TileCache } from "../base/Tile";
import { GeoBox, GeoCoordinates, OrientedBox3, Projection } from "@flywave/flywave-geoutils";
import { Tiles3DTileContent } from "../next";
import { createThreeSceneFromGLTF } from "@flywave/flywave-gltf";
import { transformECEFToProjection } from "../utilities/ecefToSphere";

const INITIAL_FRUSTUM_CULLED = Symbol("INITIAL_FRUSTUM_CULLED");
const tempVector = new Vector3();

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);

const tempPos = new Vector3();
const tempQuat = new Quaternion();
const tempSca = new Vector3();
const tempMat = new Matrix4();
const tempMat2 = new Matrix4();

/**
 * Updates frustum culling state for an object and its children
 * @param object - The object to update
 * @param toInitialValue - Whether to restore initial frustum culling state
 */
function updateFrustumCulled(object: Object3D, toInitialValue: boolean): void {
    object.traverse((c: Object3D) => {
        c.frustumCulled = c[INITIAL_FRUSTUM_CULLED] && toInitialValue;
    });
}

/**
 * Intersection information with additional tile context
 */
export type TileIntersection = Intersection & {
    /** The tile that was intersected */
    tile: Tile;
};

/**
 * A 3D Tiles renderer implementation for Three.js
 *
 * This class extends TilesRendererBase to provide concrete rendering functionality
 * for 3D Tiles in Three.js, including tile loading, frustum culling, and LOD management.
 */
export abstract class TilesRenderer extends TilesRendererBase {
    private _autoDisableRendererCulling: boolean;
    private _overridenRaycast: (raycaster: Raycaster, intersects: Intersection[]) => void;

    /** Group containing all visible tiles */
    public group: TilesGroup;
    /** Array of cameras used for view frustum culling */
    public cameras: PerspectiveCamera[];
    /** Map of cameras to their resolution */
    public cameraMap: Map<PerspectiveCamera, Vector2>;
    /** Camera information for view calculations */
    public cameraInfo: CameraInfo[];
    /** Set of currently active tiles */
    public activeTiles: Set<Tile>;
    /** Set of currently visible tiles */
    public visibleTiles: Set<Tile>;
    /** Whether to optimize raycasting performance */
    public optimizeRaycast: boolean;

    /** Callback when tileset JSON is loaded */
    public onLoadTileSet: ((json: any, url: string) => void) | null;
    /** Callback when a tile's model is loaded */
    public onLoadModel: ((scene: Object3D, tile: Tile) => void) | null;
    /** Callback when a tile's model is disposed */
    public onDisposeModel: ((scene: Object3D, tile: Tile) => void) | null;
    /** Callback when a tile's visibility changes */
    public onTileVisibilityChange: ((scene: Object3D, tile: Tile, visible: boolean) => void) | null;
    /** Loading manager for tile resources */
    public manager: LoadingManager;
    /** URL preprocessor function */
    public preprocessURL: ((url: string) => string) | null;

    /**
     * Creates a new TilesRenderer instance
     * @param url - The URL of the tileset.json file to load
     */
    constructor(url: string) {
        super(url);
        this.group = new TilesGroup(this);
        this.cameras = [];
        this.cameraMap = new Map();
        this.cameraInfo = [];
        this.activeTiles = new Set();
        this.visibleTiles = new Set();
        this._autoDisableRendererCulling = true;
        this.optimizeRaycast = true;

        this.onLoadModel = null;
        this.onDisposeModel = null;
        this.onTileVisibilityChange = null;
        this.preprocessURL = null;

        this.manager = new LoadingManager();
        this.manager.setURLModifier((url: string) => {
            if (this.preprocessURL) {
                return this.preprocessURL(url);
            } else {
                return url;
            }
        });

        const tilesRenderer = this;
        this._overridenRaycast = function (raycaster: Raycaster, intersects: Intersection[]) {
            if (!tilesRenderer.optimizeRaycast) {
                Object.getPrototypeOf(this).raycast.call(this, raycaster, intersects);
            }
        };
    }

    /**
     * Gets the projection system used for geographic coordinates
     * @abstract
     * @returns The projection system instance
     */
    protected abstract getProjection(): Projection;

    /**
     * Gets the root position of the tileset in world coordinates
     * @abstract
     * @returns The root position vector or undefined if not available
     */
    public abstract getRootPosition(): Vector3 | undefined;

    /**
     * Whether to automatically disable frustum culling on loaded models
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
     * Gets the bounding sphere encompassing all tiles
     * @param sphere - The sphere to populate with bounds data
     * @returns True if bounds were successfully retrieved
     */
    getBoundingSphere(sphere: Sphere): boolean {
        if (!this.root) {
            return false;
        }

        const boundingSphere = this.root.cached.sphere;
        if (boundingSphere) {
            sphere.copy(boundingSphere);
            return true;
        } else {
            return false;
        }
    }

    /**
     * Executes a callback for each loaded model in the tileset
     * @param callback - Function to call for each loaded model
     */
    forEachLoadedModel(callback: (scene: Object3D, tile: Tile) => void): void {
        this.traverse((tile: Tile) => {
            const scene = tile.cached.scene;
            if (scene) {
                callback(scene, tile);
            }
        });
    }

    /**
     * Performs raycasting against visible tiles
     * @param raycaster - The raycaster to use
     * @param intersects - Array to store intersection results
     */
    raycast(
        raycaster: Raycaster & {
            firstHitOnly?: boolean;
        },
        intersects: TileIntersection[]
    ): void {
        if (!this.root) {
            return;
        }

        if (raycaster.firstHitOnly) {
            const hit = raycastTraverseFirstHit(this.root, this.group, this.activeTiles, raycaster);
            if (hit) {
                intersects.push(hit);
            }
        } else {
            raycastTraverse(this.root, this.group, this.activeTiles, raycaster, intersects);
        }
    }

    /**
     * Checks if a camera is being tracked by this renderer
     * @param camera - The camera to check
     * @returns True if the camera is being tracked
     */
    hasCamera(camera: PerspectiveCamera): boolean {
        return this.cameraMap.has(camera);
    }

    /**
     * Adds a camera to be used for view frustum culling and LOD selection
     * @param camera - The camera to add
     * @returns True if camera was added, false if already present
     */
    setCamera(camera: PerspectiveCamera): boolean {
        const cameras = this.cameras;
        const cameraMap = this.cameraMap;
        if (!cameraMap.has(camera)) {
            cameraMap.set(camera, new Vector2());
            cameras.push(camera);
            return true;
        }
        return false;
    }

    /**
     * Sets the resolution for a camera
     * @param camera - The camera to set resolution for
     * @param xOrVec - Either a Vector2 or x resolution value
     * @param y - The y resolution (if xOrVec is a number)
     * @returns True if resolution was set successfully
     */
    setResolution(camera: PerspectiveCamera, xOrVec: Vector2 | number, y?: number): boolean {
        const cameraMap = this.cameraMap;
        if (!cameraMap.has(camera)) {
            return false;
        }

        const resolution = cameraMap.get(camera)!;
        if (xOrVec instanceof Vector2) {
            resolution.copy(xOrVec);
        } else {
            resolution.set(xOrVec, y!);
        }
        return true;
    }

    /**
     * Sets camera resolution from renderer dimensions
     * @param camera - The camera to set resolution for
     * @param renderer - The WebGL renderer to get dimensions from
     * @returns True if resolution was set successfully
     */
    setResolutionFromRenderer(camera: PerspectiveCamera, renderer: WebGLRenderer): boolean {
        const cameraMap = this.cameraMap;
        if (!cameraMap.has(camera)) {
            return false;
        }

        const resolution = cameraMap.get(camera)!;
        renderer.getSize(resolution);
        resolution.multiplyScalar(renderer.getPixelRatio());
        return true;
    }

    /**
     * Removes a camera from tracking
     * @param camera - The camera to remove
     * @returns True if camera was removed, false if not found
     */
    deleteCamera(camera: PerspectiveCamera): boolean {
        const cameras = this.cameras;
        const cameraMap = this.cameraMap;
        if (cameraMap.has(camera)) {
            const index = cameras.indexOf(camera);
            cameras.splice(index, 1);
            cameraMap.delete(camera);
            return true;
        }
        return false;
    }

    /**
     * Updates the renderer's view of the scene
     */
    update(): void {
        const group = this.group;
        const cameras = this.cameras;
        const cameraMap = this.cameraMap;
        const cameraInfo = this.cameraInfo;

        if (cameras.length === 0) {
            console.warn("TilesRenderer: no cameras defined. Cannot update 3d tiles.");
            return;
        }

        // Ensure camera info array matches cameras array length
        while (cameraInfo.length > cameras.length) {
            cameraInfo.pop();
        }

        while (cameraInfo.length < cameras.length) {
            cameraInfo.push({
                frustum: new Frustum(),
                isOrthographic: false,
                sseDenominator: -1,
                position: new Vector3(),
                invScale: -1,
                pixelSize: 0
            });
        }

        let invScale = 1;

        // Update camera information for each tracked camera
        for (let i = 0, l = cameraInfo.length; i < l; i++) {
            const camera = cameras[i];
            const info = cameraInfo[i];
            const frustum = info.frustum;
            const position = info.position;
            const resolution = cameraMap.get(camera)!;

            if (resolution.width === 0 || resolution.height === 0) {
                console.warn("TilesRenderer: resolution for camera error calculation is not set.");
            }

            const projection = camera.projectionMatrix.elements;
            info.isOrthographic = projection[15] === 1;

            if (info.isOrthographic) {
                const w = 2 / projection[0];
                const h = 2 / projection[5];
                info.pixelSize = Math.max(h / resolution.height, w / resolution.width);
            } else {
                info.sseDenominator = 2 / projection[5] / resolution.height;
                info.sseDenominator = 2.0 * Math.tan((0.5 * camera.fov * Math.PI) / 180);
            }

            info.invScale = invScale;

            tempMat.copy(group.matrixWorld);
            tempMat.premultiply(camera.matrixWorldInverse);
            tempMat.premultiply(camera.projectionMatrix);

            camera.updateProjectionMatrix();
            camera.updateMatrixWorld();
            frustum.setFromProjectionMatrix(
                new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
            );

            position.set(0, 0, 0);
            position.applyMatrix4(camera.matrixWorld);
        }

        super.update();
    }

    /**
     * Processes a tile node before it's loaded
     * @param tile - The tile to process
     * @param parentTile - The parent tile (if any)
     * @param tileSetDir - The directory containing the tileset
     */
    preprocessNode(tile: Tile, parentTile: Tile | null, tileSetDir: string): void {
        super.preprocessNode(tile, parentTile, tileSetDir);

        // Handle transform matrix
        const transform = new Matrix4();
        if (tile.transform) {
            transform.fromArray(tile.transform);
        } else {
            transform.identity();
        }

        if (parentTile) {
            transform.premultiply(parentTile.cached.transform);
        }

        const transformInverse = new Matrix4().copy(transform).invert();

        let sphere: Sphere | null = null;
        let orientedBox: OrientedBox3 | null = null;

        // Process bounding volume based on type
        const boundingVolume = tile.boundingVolume;
        if ("box" in boundingVolume) {
            // Process box volume
            const data = boundingVolume.box;

            // Create oriented box first
            orientedBox = OrientedBox3.fromArray(data);

            // Create sphere from box
            sphere = new Sphere();
            orientedBox.getBoundingSphere(sphere);
        } else if ("region" in boundingVolume) {
            // Process region volume using Projection
            const [west, south, east, north, minHeight, maxHeight] = boundingVolume.region;

            // Create GeoBox from region
            const geoBox = new GeoBox(
                GeoCoordinates.fromRadians(south, west, minHeight),
                GeoCoordinates.fromRadians(north, east, maxHeight)
            );

            // Project to world space using the Projection system
            orientedBox = this.getProjection().projectBox(geoBox, new OrientedBox3());

            sphere = new Sphere();
            orientedBox.getBoundingSphere(sphere);
        } else if ("sphere" in boundingVolume) {
            // Process sphere volume
            const data = boundingVolume.sphere;
            sphere = new Sphere(new Vector3(data[0], data[1], data[2]), data[3]);
        }

        // Ensure we have at least a sphere for all volume types
        if (!sphere) {
            sphere = new Sphere();
        }

        // Store cached values
        tile.cached = {
            loadIndex: 0,
            transform,
            transformInverse,
            active: false,
            inFrustum: [],
            geoBox: orientedBox?.toGeoBox(this.getProjection()),
            sphere: sphere || new Sphere(),
            orientedBox: orientedBox || new OrientedBox3(),
            scene: null,
            geometry: null,
            material: null
        } as TileCache;
    }

    /**
     * Parses tile content and creates Three.js objects
     * @param children - The tile content data
     * @param tile - The tile being loaded
     * @param extension - The file extension of the tile content
     */
    async parseTile(children: Tiles3DTileContent, tile: Tile, extension: string): Promise<void> {
        const res = createThreeSceneFromGLTF(children.gltf);

        const instances: InstancedMesh[] = [];
        const meshes: (Mesh | InstancedMesh)[] = [];
        const originalMatrices: Matrix4[] = [];
        let scene: Object3D = res.scene;

        if (children.type == "i3dm") {
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
                            children.instances.length
                        );
                        newInstancedMesh.updateMatrixWorld();
                        instances.push(newInstancedMesh);
                    } else {
                        // Convert regular Mesh to InstancedMesh
                        const instancedMesh = new InstancedMesh(
                            child.geometry,
                            child.material,
                            children.instances.length
                        );
                        instancedMesh.updateMatrixWorld();
                        instances.push(instancedMesh);
                    }
                }
            });

            // Apply instance transformations
            for (let i = 0; i < children.instances.length; i++) {
                for (let j = 0; j < meshes.length; j++) {
                    const mesh = meshes[j];
                    const instance = instances[j];
                    const originalMatrix = originalMatrices[j];
                    children.instances[i].modelMatrix.decompose(tempPos, tempQuat, tempSca);

                    if (mesh instanceof InstancedMesh) {
                        // Handle original InstancedMesh expansion
                        const originalInstanceCount = mesh.count;
                        for (let k = 0; k < originalInstanceCount; k++) {
                            mesh.getMatrixAt(k, tempMat2);
                            tempMat.compose(tempPos, tempQuat, tempSca);
                            tempMat.multiply(originalMatrix);
                            tempMat.multiply(tempMat2);

                            const instanceIndex = i * originalInstanceCount + k;
                            instance.setMatrixAt(instanceIndex, tempMat);
                        }
                    } else {
                        // Handle regular Mesh conversion
                        tempMat.compose(tempPos, tempQuat, tempSca);
                        tempMat.multiply(originalMatrix);
                        instance.setMatrixAt(i, tempMat);
                    }
                }
            }

            scene = new Group();
            instances.forEach(instance => scene.add(instance));
        }

        // Handle GLTF up axis conversion
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
            new Vector3().fromArray(children.rtcCenter),
            this.getProjection()
        );

        // Apply RTC center and transformations
        // scene.position.copy(projectedPos);
        scene.updateMatrix();

        if (extension !== "pnts") {
            scene.matrix.multiply(tempMat);
        }

        scene.matrix.premultiply(cachedTransform).premultiply(transformMatrix);
        scene.matrix.decompose(scene.position, scene.quaternion, scene.scale);

        // Store initial frustum culling state
        scene.traverse((c: Object3D) => {
            c[INITIAL_FRUSTUM_CULLED] = c.frustumCulled;
        });

        cached.scene = scene;

        // Override raycast behavior if optimized
        scene.traverse((c: Object3D) => {
            c.raycast = this._overridenRaycast;
        });

        // Collect resources for disposal
        const materials: Material[] = [];
        const geometry: BufferGeometry[] = [];
        const textures: Texture[] = [];

        scene.traverse((c: Object3D) => {
            if (c instanceof Mesh) {
                if (c.geometry) {
                    geometry.push(c.geometry);
                }

                if (c.material) {
                    const material = c.material;
                    material.alphaTest = 0;
                    materials.push(material);
                    for (const key in material) {
                        const value = (material as any)[key];
                        if (value && value.isTexture) {
                            textures.push(value);
                        }
                    }
                }
            }
        });

        cached.materials = materials;
        cached.geometry = geometry;
        cached.textures = textures;

        if (this.onLoadModel) {
            this.onLoadModel(scene, tile);
        }
    }

    /**
     * Disposes of resources used by a tile
     * @param tile - The tile to dispose
     */
    disposeTile(tile: Tile): void {
        const cached = tile.cached;
        if (cached.scene) {
            const materials = cached.materials;
            const geometry = cached.geometry;
            const textures = cached.textures;

            // Dispose of geometry
            for (let i = 0, l = geometry!.length; i < l; i++) {
                geometry![i].dispose();
            }

            // Dispose of materials
            for (let i = 0, l = materials!.length; i < l; i++) {
                materials![i].dispose();
            }

            // Dispose of textures
            for (let i = 0, l = textures!.length; i < l; i++) {
                const texture = textures![i];
                texture.dispose();
            }

            if (this.onDisposeModel) {
                this.onDisposeModel(cached.scene, tile);
            }

            // Clear cached references
            cached.scene = null;
            cached.materials = null;
            cached.textures = null;
            cached.geometry = null;
        }

        tile.__loadIndex++;
    }

    /**
     * Sets a tile's visibility state
     * @param tile - The tile to modify
     * @param visible - Whether the tile should be visible
     */
    setTileVisible(tile: Tile, visible: boolean): void {
        const scene = tile.cached.scene;
        const visibleTiles = this.visibleTiles;
        const group = this.group;

        if (visible) {
            group.add(scene);
            visibleTiles.add(tile);
            scene.updateMatrixWorld(true);
        } else {
            group.remove(scene);
            visibleTiles.delete(tile);
        }

        if (this.onTileVisibilityChange) {
            this.onTileVisibilityChange(scene, tile, visible);
        }
    }

    /**
     * Sets a tile's active state (whether it should be considered for rendering)
     * @param tile - The tile to modify
     * @param active - Whether the tile should be active
     */
    setTileActive(tile: Tile, active: boolean): void {
        const activeTiles = this.activeTiles;
        if (active) {
            activeTiles.add(tile);
        } else {
            activeTiles.delete(tile);
        }
    }

    /**
     * Calculates the screen space error for a tile
     * @param tile - The tile to calculate error for
     */
    calculateError(tile: Tile): void {
        const cached = tile.cached;
        const inFrustum = cached.inFrustum;
        const cameras = this.cameras;
        const cameraInfo = this.cameraInfo;

        const orientedBox = cached.orientedBox;
        let maxError = -Infinity;
        let minDistance = Infinity;

        for (let i = 0, l = cameras.length; i < l; i++) {
            var height = this.cameraMap.get(cameras[i])!.y;
            if (!inFrustum[i]) {
                continue;
            }

            const info = cameraInfo[i];
            const invScale = info.invScale;

            let error;
            if (info.isOrthographic) {
                const pixelSize = info.pixelSize;
                error = tile.geometricError / (pixelSize * invScale);
            } else {
                tempVector.copy(info.position);
                let distance = Math.max(orientedBox!.distanceToPoint(tempVector), 0.1);

                const scaledDistance = distance * invScale;
                const sseDenominator = info.sseDenominator;
                error = (tile.geometricError * height) / (scaledDistance * sseDenominator);
                minDistance = Math.min(minDistance, scaledDistance);
            }

            maxError = Math.max(maxError, error);
        }

        tile.__distanceFromCamera = minDistance;
        tile.__error = maxError;
    }

    /**
     * Checks if a tile is within any camera's view frustum
     * @param tile - The tile to check
     * @returns True if the tile is in view of any camera
     */
    tileInView(tile: Tile): boolean {
        const cached = tile.cached;
        const sphere = cached.sphere;
        const inFrustum = cached.inFrustum;
        const orientedBox = cached.orientedBox;

        if (sphere) {
            const cameraInfo = this.cameraInfo;
            let inView = false;

            for (let i = 0, l = cameraInfo.length; i < l; i++) {
                const frustum = cameraInfo[i].frustum;
                if (
                    frustum.intersectsSphere(sphere) &&
                    (!orientedBox ? true : orientedBox.intersects(frustum))
                ) {
                    inView = true;
                    inFrustum[i] = true;
                } else {
                    inFrustum[i] = false;
                }
            }
            return inView;
        }
        return true;
    }
}

/**
 * Information about a camera used for view frustum culling and LOD selection
 */
interface CameraInfo {
    /** The camera's view frustum */
    frustum: Frustum;
    /** Whether the camera is orthographic */
    isOrthographic: boolean;
    /** Denominator for screen space error calculation */
    sseDenominator: number;
    /** Camera position in world space */
    position: Vector3;
    /** Inverse scale factor for error calculation */
    invScale: number;
    /** Pixel size for orthographic cameras */
    pixelSize: number;
}
