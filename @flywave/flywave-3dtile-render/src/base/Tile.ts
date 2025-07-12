import { BufferGeometry, Material, Matrix4, Object3D, Scene, Sphere, Texture } from "three";
import { GeoBox, OrientedBox3 } from "@flywave/flywave-geoutils";
import {
    ImplicitTilingData,
    TILE_REFINEMENT,
    Tiles3DTileContent,
    Tiles3DTileJSONPostprocessed,
    Tiles3DTilesetJSONPostprocessed
} from "../next/types";
import { OrientedBox3Visualizer } from "../renderer/OrientedBoxHelper";
import { SphereHelper } from "../renderer/SphereHelper";
import { TileBoundingVolume } from "../utilities/TileBoundingVolume";

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
    transform: Matrix4;
    transformInverse: Matrix4;
    active: boolean;
    boundingVolume: TileBoundingVolume;
    scene: Scene | Object3D;
    geometry?: BufferGeometry[];
    materials?: Material[];
    textures?: Texture[];
    bytesUsed: number;
};

export class Tile {
    /**
     * Hierarchy Depth from the TileGroup
     */
    __depth: number;
    /**
     * The screen space error for this tile
     */
    __error: number;
    /**
     * How far is this tiles bounds from the nearest active Camera.
     * Expected to be filled in during calculateError implementations.
     */
    __distanceFromCamera: number;
    /**
     * This tile is currently active if:
     *  1: Tile content is loaded and ready to be made visible if needed
     */
    __active: boolean;
    /**
     * This tile is currently visible if:
     *  1: Tile content is loaded
     *  2: Tile is within a camera frustum
     *  3: Tile meets the SSE requirements
     */
    __visible: boolean;
    /**
     * Whether or not the tile was visited during the last update run.
     */
    __used: boolean;

    /**
     * Whether or not the tile was within the frustum on the last update run.
     */
    __inFrustum: boolean;

    /**
     * The depth of the tiles that increments only when a child with geometry content is encountered
     */
    __depthFromRenderedParent: number;

    __lastFrameVisited: number;

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

    extensions?: Record<string, any>;

    get implicitTiling(): ImplicitTilingData | undefined {
        return this.tiles3DTileJSONPostprocessed.implicitTiling;
    }

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

    private __debugSphere: SphereHelper;
    private __debugBox: OrientedBox3Visualizer;

    debugBoundingVolume(type?: "sphere" | "box" | false) {
        switch (type) {
            case "sphere": {
                if (!this.__debugSphere) {
                    this.__debugSphere = new SphereHelper(this.cached.boundingVolume.sphere);
                    this.__debugSphere.position.sub(this.cached.scene.position);
                }
                this.cached.scene?.add(this.__debugSphere);
                break;
            }
            case "box": {
                if (!this.__debugBox) {
                    this.__debugBox = new OrientedBox3Visualizer(this.cached.boundingVolume.obb);
                    this.__debugBox.position.sub(this.cached.scene.position);
                }
                this.cached.scene?.add(this.__debugBox);
                break;
            }
            case false: {
                this.cached.scene?.remove(this.__debugSphere);
                this.cached.scene?.remove(this.__debugBox);
                break;
            }
        }
    }
}

export interface TileInternal extends Tile {
    // tile description
    __isLeaf: boolean;
    __hasContent: boolean;
    __hasRenderableContent: boolean;
    __hasUnrenderableContent: boolean;

    // resource tracking
    __usedLastFrame: boolean;
    __used: boolean;

    // Visibility tracking
    __allChildrenLoaded: boolean;
    __childrenWereVisible: boolean;
    __inFrustum: boolean;
    __wasSetVisible: boolean;

    // download state tracking
    /**
     * This tile is currently active if:
     *  1: Tile content is loaded and ready to be made visible if needed
     */
    __active: boolean;
    __loadIndex: number;
    __loadAbort: AbortController | null;
    __loadingState: number;
    __wasSetActive: boolean;

    __childrenProcessed: number;
    __basePath?: string;
}

export class TileSet {
    root: Tile;
    constructor(private meta: Tiles3DTilesetJSONPostprocessed) {
        this.root = new Tile(meta.root);
    }

    get asset() {
        return this.meta.asset;
    }

    get geometricError() {
        return this.meta.geometricError;
    }

    get extensionsUsed() {
        return this.meta.extensionsUsed;
    }

    get extensionsRequired() {
        return this.meta.extensionsRequired;
    }

    get properties() {
        return this.meta.properties;
    }

    get extensions() {
        return this.meta.extensions;
    }

    get extras() {
        return this.meta.extras;
    }
}
