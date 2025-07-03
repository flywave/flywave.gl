import { Box3, BufferGeometry, Material, Matrix4, Object3D, Scene, Sphere, Texture } from "three";
import { LoadState } from "./constants";
import { EllipsoidRegion } from "../three/math/EllipsoidRegion";
import { GeoBox, OrientedBox3 } from "@flywave/flywave-geoutils";

export interface InnterTile {
    /** Last frame number this tile was accessed */
    __lastFrameVisited: number;
    /** Whether the tile is used in current frame */
    __used: boolean;
    /** Whether the tile is within view frustum */
    __inFrustum: boolean;
    /** Indicates if this tile is a leaf node */
    __isLeaf: boolean;
    /** Visibility state of the tile */
    __visible: boolean;
    /** Activation state of the tile */
    __active: boolean;
    /** Screen space error metric value */
    __error: number;
    /** Distance from camera to tile center */
    __distanceFromCamera: number;
    /** Whether any child was visible last frame */
    __childrenWereVisible: boolean;
    /** All children have finished loading */
    __allChildrenLoaded: boolean;
    /** Depth level in tile hierarchy */
    __depth: number;
    /** Load state enumeration from LoadState */
    __loadingState: LoadState;
    /** Depth relative to nearest rendered parent */
    __depthFromRenderedParent: number;
    /** Marks external tile set reference */
    __externalTileSet?: boolean;
    /** Indicates empty content node */
    __contentEmpty?: boolean;
    /** Child tile references */
    children?: Tile[];
    /** Refinement strategy: ADD or REPLACE */
    refine?: "ADD" | "REPLACE";
    /** Parent tile reference */
    parent?: Tile;
    /** Previous visibility state */
    __wasSetVisible?: boolean;
    /** Previous activation state */
    __wasSetActive?: boolean;
    /** Usage state in previous frame */
    __usedLastFrame?: boolean;

    __loadIndex: number;

    __loadAbort?: AbortController;
}

export type TileContext = {
    uri?: string;
    //old version
    url?: string;
};

export type BoundingVolume = {
    /** 轴对齐包围盒 (12元素数组) */
    box?: [
        centerX: number,
        centerY: number,
        centerZ: number,
        xAxisX: number,
        xAxisY: number,
        xAxisZ: number, // X轴方向
        yAxisX: number,
        yAxisY: number,
        yAxisZ: number, // Y轴方向
        zAxisX: number,
        zAxisY: number,
        zAxisZ: number // Z轴方向
    ];
    /** 球体包围体 (4元素数组) */
    sphere?: [number, number, number, number];
    /** 地理区域包围体 (6元素数组) */
    region?: [
        minLon: number, // 西经（弧度）
        minLat: number, // 南纬（弧度）
        maxLon: number, // 东经（弧度）
        maxLat: number, // 北纬（弧度）
        minHeight: number, // 最小高度（米）
        maxHeight: number // 最大高度（米）
    ];
};

export type TileCache = {
    loadIndex: number;
    transform: Matrix4;
    transformInverse: Matrix4;
    active: boolean;
    inFrustum: boolean[];
    sphere: Sphere;
    orientedBox: OrientedBox3;
    geoBox: GeoBox;
    scene: Scene | Object3D;
    geometry?: BufferGeometry[];
    materials?: Material[];
    textures?: Texture[];
};

export interface Tile extends InnterTile {
    /** Parent tile reference */
    parent?: Tile;
    content: TileContext;
    transform: number[];
    boundingVolume: BoundingVolume;
    cached: TileCache;
    geometricError?: number;
}
