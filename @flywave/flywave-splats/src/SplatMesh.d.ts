import { type BufferGeometry, type Camera, type Group, type Material, type Scene, type WebGLRenderer, Box3, DataTexture, Mesh, Sphere, Vector3, Raycaster } from "three";
/** Alias type for value that can be null */
export type Nullable<T> = T | null;
export interface DelayedTextureUpdate {
    covA: Uint16Array;
    covB: Uint16Array;
    colors: Uint8Array;
    centers: Float32Array;
    sh?: Uint8Array[];
}
export interface SplatIntersection {
    distance: number;
    point: Vector3;
    index: number;
    splatMesh: SplatMesh;
}
/**
 * Class used to render a gaussian splatting mesh
 */
export declare class SplatMesh extends Mesh {
    private _vertexCount;
    private _worker;
    private _frameIdLastUpdate;
    private _frameIdThisUpdate;
    private _cameraMatrix;
    private _modelViewMatrix;
    private _canPostToWorker;
    private _readyToDisplay;
    private _covariancesATexture;
    private _covariancesBTexture;
    private _centersTexture;
    private _colorsTexture;
    private _splatPositions;
    private _splatPositions2;
    private _splatIndex;
    private readonly _splatIndex2;
    private _shTextures;
    private _splatsData;
    private _sh;
    private readonly _keepInRam;
    private readonly _oldDirection;
    private readonly _useRGBACovariants;
    private readonly _tmpCovariances;
    private _sortIsDirty;
    private static readonly _RowOutputLength;
    private static readonly _SH_C0;
    private static readonly _SplatBatchSize;
    private static readonly _PlyConversionBatchSize;
    private _shDegree;
    boundingBox: Box3;
    boundingSphere: Sphere;
    /**
     * SH degree. 0 = no sh (default). 1 = 3 parameters. 2 = 8 parameters. 3 = 15 parameters.
     */
    get shDegree(): number;
    /**
     * returns the splats data array buffer that contains in order : postions (3 floats), size (3 floats), color (4 bytes), orientation quaternion (4 bytes)
     */
    get splatsData(): ArrayBuffer;
    /**
     * Gets the covariancesA texture
     */
    get covariancesATexture(): DataTexture;
    /**
     * Gets the covariancesB texture
     */
    get covariancesBTexture(): DataTexture;
    /**
     * Gets the centers texture
     */
    get centersTexture(): DataTexture;
    /**
     * Gets the colors texture
     */
    get colorsTexture(): DataTexture;
    /**
     * Gets the SH textures
     */
    get shTextures(): DataTexture[];
    /**
     * Creates a new gaussian splatting mesh
     * @param name defines the name of the mesh
     * @param url defines the url to load from (optional)
     * @param scene defines the hosting scene (optional)
     * @param keepInRam keep datas in ram for editing purpose
     */
    constructor();
    readonly isSplatMesh: true;
    /**
     * @override
     * @defaultValue `Mesh`
     */
    readonly type: "SplatMesh";
    setEnabled(enabled: boolean): void;
    /** @internal */
    _postToWorker(forced?: boolean): Promise<void> | undefined;
    onBeforeRender(renderer: WebGLRenderer, scene: Scene, camera: Camera, geometry: BufferGeometry, material: Material, group: Group): void;
    /**
     * Loads a .splat Gaussian Splatting array buffer asynchronously
     * @param data arraybuffer containing splat file
     * @returns a promise that resolves when the operation is complete
     */
    loadDataAsync(data: ArrayBuffer): Promise<void>;
    /**
     * Releases resources associated with this mesh.
     * @param doNotRecurse Set to true to not recurse into each children (recurse into each children by default)
     */
    dispose(): void;
    private _copyTextures;
    /**
     * Returns a new Mesh object generated from the current mesh properties.
     * @param name is a string, the name given to the new mesh
     * @returns a new Gaussian Splatting Mesh
     */
    clone(recursive?: boolean): SplatMesh;
    private readonly _tempQuaternion;
    private readonly _tempPosition;
    private readonly _tempScale;
    private readonly _tempColor;
    private readonly _tempMatrix;
    private _makeSplatFromComonents;
    private _makeSplatFromAttribute;
    private _makeSplatFromBuffer;
    private _updateTextures;
    private _updateBoundingInfo;
    private _updateData;
    /**
     * Update asynchronously the buffer
     * @param data array buffer containing center, color, orientation and scale of splats
     * @param sh optional array of uint8 array for SH data
     * @returns a promise
     */
    updateDataAsync(data: ArrayBuffer, sh?: Uint8Array[]): Promise<void>;
    /**
     * @experimental
     * Update data from GS (position, orientation, color, scaling)
     * @param data array that contain all the datas
     * @param sh optional array of uint8 array for SH data
     */
    updateData(data: ArrayBuffer, sh?: Uint8Array[]): void;
    private _updateDataFromGeometry;
    /**
     * Update asynchronously the buffer from geometry
     * @param geometry array buffer containing center, color, orientation and scale of splats
     * @returns a promise
     */
    updateDataFromGeometryAsync(geometry: BufferGeometry): Promise<void>;
    sortDataAsync(camera: Camera, forced?: boolean): Promise<void>;
    /**
     * @experimental
     * Update data from geometry (position, orientation, color, scaling)
     * @param geometry array that contain all the datas
     */
    updateDataFromGeometry(geometry: BufferGeometry): void;
    private _updateSplatIndexBuffer;
    private _instanciateWorker;
    private _getTextureSize;
    /**
     * 射线检测实现
     * @param raycaster 射线投射器
     * @param intersects 相交结果数组
     */
    raycast(raycaster: Raycaster, intersects: any[]): void;
    /**
     * 射线与高斯椭球体相交检测（简化方法）
     * 将高斯椭球体近似为球体进行检测
     */
    private _raycastGaussianSplat;
    /**
     * 获取最近的高斯椭球体索引
     * 用于交互选择
     * @param point 世界坐标系中的点
     * @param threshold 距离阈值
     * @returns 高斯椭球体索引或null
     */
    getSplatAtPoint(point: Vector3, threshold?: number): number | null;
    /**
     * 批量射线检测优化版本
     * 使用空间加速结构提高性能（待实现）
     */
    raycastOptimized(raycaster: Raycaster, intersects: any[]): void;
}
