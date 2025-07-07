import { BufferGeometry, Material, Matrix4, Object3D, Scene, Sphere, Texture } from "three";
import { LoadState } from "./constants";
import { GeoBox, OrientedBox3 } from "@flywave/flywave-geoutils";
import {
    TILE_REFINEMENT,
    TileRefinement,
    Tiles3DTileContent,
    Tiles3DTileJSONPostprocessed,
    Tiles3DTilesetJSONPostprocessed
} from "../next/types";

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

export class Tile {
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

    /** Indicates empty content node */
    __contentEmpty?: boolean;
    /** Previous visibility state */
    __wasSetVisible?: boolean;
    /** Previous activation state */
    __wasSetActive?: boolean;
    /** Usage state in previous frame */
    __usedLastFrame?: boolean;

    __loadIndex: number;

    __loadAbort?: AbortController;

    __implicitTiles?: boolean;
    __externalTileSet?: boolean;
    __contentGroup?: boolean;

    private _children: Tile[] = [];
    constructor(private metadata: Tiles3DTileContent | Tiles3DTileJSONPostprocessed) {
        this.__lastFrameVisited = 0;
        this.__used = false;
        this.__inFrustum = false;

        this._children = this.tiles3DTileJSONPostprocessed.children?.map(e => {
            return new Tile(e);
        });
    }

    get tiles3DTileContent(): Tiles3DTileContent {
        return this.metadata as Tiles3DTileContent;
    }

    get tiles3DTileJSONPostprocessed(): Tiles3DTileJSONPostprocessed {
        return this.metadata as Tiles3DTileJSONPostprocessed;
    }

    /** Child tile references */
    get children() {
        return this._children || [];
    }
    /** Parent tile reference */
    parent?: Tile;

    get content() {
        return this.tiles3DTileJSONPostprocessed.content;
    }

    get transform() {
        return this.tiles3DTileJSONPostprocessed.transform;
    }

    get boundingVolume() {
        return this.tiles3DTileJSONPostprocessed.boundingVolume as BoundingVolume;
    }

    cached: TileCache;
    get geometricError() {
        return this.tiles3DTileJSONPostprocessed.geometricError;
    }

    get refine() {
        return this.tiles3DTileJSONPostprocessed.refine as TILE_REFINEMENT;
    }

    set refine(value: TILE_REFINEMENT) {
        this.tiles3DTileJSONPostprocessed.refine = value;
    }
}

export class TileSet {
    root: Tile;
    constructor(private meta: Tiles3DTilesetJSONPostprocessed) {
        this.root = new Tile(meta.root);
    }

    get asset() {
        return this.meta.asset;
    }
}
