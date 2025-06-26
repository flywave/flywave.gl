import { TilesRendererBase } from "../base/TilesRendererBase";
import { B3DMLoader } from "./B3DMLoader";
import { PNTSLoader } from "./PNTSLoader";
import { I3DMLoader } from "./I3DMLoader";
import { CMPTLoader } from "./CMPTLoader";
import { GLTFExtensionLoader } from "./GLTFExtensionLoader";
import { TilesGroup } from "./TilesGroup";
import { EllipsoidRegion } from "./math/EllipsoidRegion";
import { WGS84_HEIGHT, WGS84_RADIUS } from "../base/constants";

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
    Mesh
} from "three";
import { raycastTraverse, raycastTraverseFirstHit } from "./raycastTraverse";
import { Tile, TileCache } from "../base/Tile";
import { GeoBox, GeoCoordinates, OrientedBox3, Projection } from "@flywave/flywave-geoutils";
import { Description, TileGLTF } from "../base/LoaderBase";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";

const INITIAL_FRUSTUM_CULLED = Symbol("INITIAL_FRUSTUM_CULLED");
const tempMat = new Matrix4();
const tempVector = new Vector3();
const vecX = new Vector3();
const vecY = new Vector3();
const vecZ = new Vector3();

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);

function updateFrustumCulled(object: Object3D, toInitialValue: boolean): void {
    object.traverse((c: Object3D) => {
        c.frustumCulled = c[INITIAL_FRUSTUM_CULLED] && toInitialValue;
    });
}

class TilesLoadingManager extends LoadingManager {
    private dracoLoader: DRACOLoader = new DRACOLoader();

    setDracoDecoderPath(path: string) {
        this.dracoLoader.setDecoderPath(path);
    }

    getDracoLoader() {
        return this.dracoLoader;
    }
}

interface CameraInfo {
    frustum: Frustum;
    isOrthographic: boolean;
    sseDenominator: number;
    position: Vector3;
    invScale: number;
    pixelSize: number;
}

export abstract class TilesRenderer extends TilesRendererBase {
    private _autoDisableRendererCulling: boolean;
    private _overridenRaycast: (raycaster: Raycaster, intersects: Intersection[]) => void;

    public group: TilesGroup;
    public cameras: PerspectiveCamera[];
    public cameraMap: Map<PerspectiveCamera, Vector2>;
    public cameraInfo: CameraInfo[];
    public activeTiles: Set<Tile>;
    public visibleTiles: Set<Tile>;
    public optimizeRaycast: boolean;

    public onLoadTileSet: ((json: any, url: string) => void) | null;
    public onLoadModel: ((scene: Object3D, tile: Tile) => void) | null;
    public onDisposeModel: ((scene: Object3D, tile: Tile) => void) | null;
    public onTileVisibilityChange: ((scene: Object3D, tile: Tile, visible: boolean) => void) | null;
    public manager: TilesLoadingManager;
    public preprocessURL: ((url: string) => string) | null;

    protected abstract getProjection(): Projection;

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

        this.onLoadTileSet = null;
        this.onLoadModel = null;
        this.onDisposeModel = null;
        this.onTileVisibilityChange = null;
        this.preprocessURL = null;

        const manager = new TilesLoadingManager();
        manager.setURLModifier((url: string) => {
            if (this.preprocessURL) {
                return this.preprocessURL(url);
            } else {
                return url;
            }
        });
        this.manager = manager;

        const tilesRenderer = this;
        this._overridenRaycast = function (raycaster: Raycaster, intersects: Intersection[]) {
            if (!tilesRenderer.optimizeRaycast) {
                Object.getPrototypeOf(this).raycast.call(this, raycaster, intersects);
            }
        };
    }

    getBounds(box: Box3): boolean {
        if (!this.root) {
            return false;
        }

        const cached = this.root.cached;
        const boundingBox = cached.box;
        const obbMat = cached.boxTransform;

        if (boundingBox) {
            box.copy(boundingBox);
            box.applyMatrix4(obbMat);
            return true;
        } else {
            return false;
        }
    }

    getOrientedBounds(box: Box3, matrix: Matrix4): boolean {
        if (!this.root) {
            return false;
        }

        const cached = this.root.cached;
        const boundingBox = cached.box;
        const obbMat = cached.boxTransform;

        if (boundingBox) {
            box.copy(boundingBox);
            matrix.copy(obbMat);
            return true;
        } else {
            return false;
        }
    }

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

    forEachLoadedModel(callback: (scene: Object3D, tile: Tile) => void): void {
        this.traverse((tile: Tile) => {
            const scene = tile.cached.scene;
            if (scene) {
                callback(scene, tile);
            }
        });
    }

    raycast(
        raycaster: Raycaster & {
            firstHitOnly?: boolean;
        },
        intersects: Intersection[]
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

    hasCamera(camera: PerspectiveCamera): boolean {
        return this.cameraMap.has(camera);
    }

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

    fetchTileSet(url: string, fetchOptions: RequestInit, parent: Tile = null): Promise<any> {
        const pr = super.fetchTileSet(url, fetchOptions, parent);
        pr.then(json => {
            if (this.onLoadTileSet) {
                Promise.resolve().then(() => {
                    this.onLoadTileSet!(json, url);
                });
            }
        });
        return pr;
    }

    update(): void {
        const group = this.group;
        const cameras = this.cameras;
        const cameraMap = this.cameraMap;
        const cameraInfo = this.cameraInfo;

        if (cameras.length === 0) {
            console.warn("TilesRenderer: no cameras defined. Cannot update 3d tiles.");
            return;
        }

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

    preprocessNode(tile: Tile, parentTile: Tile | null, tileSetDir: string): void {
        super.preprocessNode(tile, parentTile, tileSetDir);

        const transform = new Matrix4();
        if (tile.transform) {
            const transformArr = tile.transform;
            for (let i = 0; i < 16; i++) {
                transform.elements[i] = transformArr[i];
            }
        } else {
            transform.identity();
        }

        if (parentTile) {
            transform.premultiply(parentTile.cached.transform);
        }

        const transformInverse = new Matrix4().copy(transform).invert();

        let box: Box3 | null = null;
        let boxTransform: Matrix4 | null = null;
        let boxTransformInverse: Matrix4 | null = null;

        let orientedBox: OrientedBox3 = null;

        if ("box" in tile.boundingVolume) {
            const data = tile.boundingVolume.box;
            box = new Box3();
            boxTransform = new Matrix4();
            boxTransformInverse = new Matrix4();

            vecX.set(data[3], data[4], data[5]);
            vecY.set(data[6], data[7], data[8]);
            vecZ.set(data[9], data[10], data[11]);

            const scaleX = vecX.length();
            const scaleY = vecY.length();
            const scaleZ = vecZ.length();

            vecX.normalize();
            vecY.normalize();
            vecZ.normalize();

            if (scaleX === 0) {
                vecX.crossVectors(vecY, vecZ);
            }

            if (scaleY === 0) {
                vecY.crossVectors(vecX, vecZ);
            }

            if (scaleZ === 0) {
                vecZ.crossVectors(vecX, vecY);
            }

            boxTransform.set(
                vecX.x,
                vecY.x,
                vecZ.x,
                data[0],
                vecX.y,
                vecY.y,
                vecZ.y,
                data[1],
                vecX.z,
                vecY.z,
                vecZ.z,
                data[2],
                0,
                0,
                0,
                1
            );
            boxTransform.premultiply(transform);
            boxTransformInverse.copy(boxTransform).invert();

            box.min.set(-scaleX, -scaleY, -scaleZ);
            box.max.set(scaleX, scaleY, scaleZ);

            orientedBox = OrientedBox3.fromArray(data);
        }

        let sphere: Sphere | null = null;
        if ("sphere" in tile.boundingVolume) {
            const data = tile.boundingVolume.sphere;
            sphere = new Sphere();
            sphere.center.set(data[0], data[1], data[2]);
            sphere.radius = data[3];
        }

        let region: EllipsoidRegion | null = null;
        if ("region" in tile.boundingVolume) {
            const data = tile.boundingVolume.region;
            const [west, south, east, north, minHeight, maxHeight] = data;

            region = new EllipsoidRegion(
                WGS84_RADIUS,
                WGS84_RADIUS,
                WGS84_HEIGHT,
                south,
                north,
                west,
                east,
                minHeight,
                maxHeight
            );

            if (sphere === null) {
                sphere = new Sphere();
                region.getBoundingSphere(sphere);
            }

            if (box === null) {
                box = new Box3();
                boxTransform = new Matrix4();
                boxTransformInverse = new Matrix4();

                region.getBoundingBox(box, boxTransform);
                boxTransformInverse.copy(boxTransform).invert();
            }

            if (!orientedBox) {
                const [milng, milat, mxlng, mxlat, miAlt, mxAlt] = tile.boundingVolume.region;
                let box = new GeoBox(
                    GeoCoordinates.fromRadians(milat, milng, miAlt),
                    GeoCoordinates.fromRadians(mxlat, mxlng, mxAlt)
                );
                orientedBox = this.getProjection().projectBox(box, new OrientedBox3());
            }
        }

        tile.cached = {
            loadIndex: 0,
            transform,
            transformInverse,
            active: false,
            inFrustum: [],
            box: box!,
            boxTransform: boxTransform!,
            boxTransformInverse: boxTransformInverse!,
            sphere: sphere!,
            region: region!,
            orientedBox,
            scene: null,
            geometry: null,
            material: null
        } as TileCache;
    }

    parseTile(buffer: ArrayBuffer, tile: Tile, extension: string): Promise<void> {
        tile.__loadIndex = tile.__loadIndex || 0;
        tile.__loadIndex++;

        const uri = tile.content.uri;
        const uriSplits = uri.split(/[\\\/]/g);
        uriSplits.pop();
        const workingPath = uriSplits.join("/");
        const fetchOptions = this.fetchOptions;

        const manager = this.manager;
        const loadIndex = tile.__loadIndex;
        let promise: Promise<TileGLTF> | null = null;

        switch (extension) {
            case "b3dm": {
                const loader = new B3DMLoader(manager, tile);
                loader.workingPath = workingPath;
                loader.fetchOptions = fetchOptions;
                promise = loader.parse(buffer);
                break;
            }
            case "pnts": {
                const loader = new PNTSLoader(manager);
                loader.workingPath = workingPath;
                loader.fetchOptions = fetchOptions;
                promise = loader.parse(buffer);
                break;
            }
            case "i3dm": {
                const loader = new I3DMLoader(manager, this);
                loader.workingPath = workingPath;
                loader.fetchOptions = fetchOptions;
                promise = loader.parse(buffer);
                break;
            }
            case "cmpt": {
                const loader = new CMPTLoader(manager);
                loader.workingPath = workingPath;
                loader.fetchOptions = fetchOptions;
                promise = loader.parse(buffer);
                break;
            }
            case "gltf":
            case "glb": {
                const loader = new GLTFExtensionLoader(manager);
                loader.workingPath = workingPath;
                loader.fetchOptions = fetchOptions;
                promise = loader.parse(buffer);
                break;
            }
            default:
                console.warn(`TilesRenderer: Content type "${extension}" not supported.`);
                promise = Promise.resolve({ scene: undefined } as TileGLTF);
                break;
        }

        return promise.then(res => {
            const scene = res.scene;
            if (tile.__loadIndex !== loadIndex) {
                return;
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

            scene.updateMatrix();

            if (extension !== "pnts") {
                scene.matrix.multiply(tempMat);
            }

            scene.matrix.premultiply(cachedTransform);
            scene.matrix.decompose(scene.position, scene.quaternion, scene.scale);
            scene.traverse((c: Object3D) => {
                c[INITIAL_FRUSTUM_CULLED] = c.frustumCulled;
            });

            cached.scene = scene;

            scene.traverse((c: Object3D) => {
                c.raycast = this._overridenRaycast;
            });

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
        });
    }

    disposeTile(tile: Tile): void {
        const cached = tile.cached;
        if (cached.scene) {
            const materials = cached.materials;
            const geometry = cached.geometry;
            const textures = cached.textures;

            for (let i = 0, l = geometry!.length; i < l; i++) {
                geometry![i].dispose();
            }

            for (let i = 0, l = materials!.length; i < l; i++) {
                materials![i].dispose();
            }

            for (let i = 0, l = textures!.length; i < l; i++) {
                const texture = textures![i];
                texture.dispose();
            }

            if (this.onDisposeModel) {
                this.onDisposeModel(cached.scene, tile);
            }

            cached.scene = null;
            cached.materials = null;
            cached.textures = null;
            cached.geometry = null;
        }

        tile.__loadIndex++;
    }

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

    setTileActive(tile: Tile, active: boolean): void {
        const activeTiles = this.activeTiles;
        if (active) {
            activeTiles.add(tile);
        } else {
            activeTiles.delete(tile);
        }
    }

    calculateError(tile: Tile): void {
        const cached = tile.cached;
        const inFrustum = cached.inFrustum;
        const cameras = this.cameras;
        const cameraInfo = this.cameraInfo;

        const boundingVolume = tile.boundingVolume;

        if ("box" in boundingVolume || "sphere" in boundingVolume) {
            const boundingSphere = cached.sphere;
            const boundingBox = cached.box;
            const boxTransformInverse = cached.boxTransformInverse;
            const transformInverse = cached.transformInverse;
            const useBox = boundingBox && boxTransformInverse;

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

                    let distance;
                    if (useBox) {
                        tempVector.applyMatrix4(boxTransformInverse!);
                        distance = boundingBox!.distanceToPoint(tempVector);
                    } else {
                        distance = Math.max(boundingSphere!.distanceToPoint(tempVector), 0.1);
                    }

                    const scaledDistance = distance * invScale;
                    const sseDenominator = info.sseDenominator;
                    error = (tile.geometricError * height) / (scaledDistance * sseDenominator);
                    minDistance = Math.min(minDistance, scaledDistance);
                }

                maxError = Math.max(maxError, error);
            }

            tile.__distanceFromCamera = minDistance;
            tile.__error = maxError;
        } else if ("region" in boundingVolume) {
            console.warn("ThreeTilesRenderer : Region bounds not supported.");
        }
    }

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
