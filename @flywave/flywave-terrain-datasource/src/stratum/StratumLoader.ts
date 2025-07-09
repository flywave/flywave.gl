import { GeoCoordinates, TileKey, TilingScheme } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { DataSource, Tile, TileLoaderState } from "@flywave/flywave-mapview";
import { TileLoader } from "@flywave/flywave-mapview-decoder";
import { encode } from "@vitaly-z/hilbert-geohash";
import * as THREE from "three";

import { HeightMap } from "../terrain/RenderHeightmap";
import { StratumSource } from "./StratumSource";

interface StratumData {
    mesh: {
        vertices: Float32Array;
        normals?: Float32Array;
        indices: Uint8Array | Uint16Array | Uint32Array;
        bounds: THREE.Box3;
        center: THREE.Vector3;
        indexCountWithoutSkirts?: number;
    };
    heightMap?: HeightMap;
    metadata?: {
        minHeight: number;
        maxHeight: number;
    };

    upsample?(
        tilingScheme: TilingScheme,
        sourceX: number,
        sourceY: number,
        sourceLevel: number,
        targetX: number,
        targetY: number,
        targetLevel: number
    ): Promise<StratumData>;

    wasCreatedByUpsampling?(): boolean;
}

export class StratumLoader extends TileLoader {
    private readonly parentTile: StratumResourceTile | null;
    private readonly tile: StratumResourceTile;
    private _decodedData?: StratumData;

    constructor(
        dataSource: StratumSource,
        tileKey: TileKey,
        tile: StratumResourceTile,
        decoder: any,
        parentTile: StratumResourceTile | null
    ) {
        super(dataSource, tileKey, dataSource.dataProvider(), decoder);
        this.parentTile = parentTile;
        this.tile = tile;
    }

    protected async loadStratumData(): Promise<StratumData> {
        const dataProvider = (this.dataSource as StratumSource).dataStratumProvider;
        return await dataProvider.requestTileGeometry(this.tileKey);
    }

    protected async upsampleData(): Promise<StratumData> {
        if (!this.parentTile || !this.parentTile.stratumData?.upsample) {
            throw new Error("Parent tile required for upsampling");
        }

        const parentData = this.parentTile.stratumData;
        const tilingScheme = (this.dataSource as StratumSource).dataStratumProvider.tilingScheme;

        return await parentData.upsample(
            tilingScheme,
            this.parentTile.tileKey.column,
            this.parentTile.tileKey.row,
            this.parentTile.tileKey.level,
            this.tileKey.column,
            this.tileKey.row,
            this.tileKey.level
        );
    }

    loadImpl(
        abortSignal: AbortSignal,
        onDone: (state: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        const loadTask = this.parentTile?.isReady ? this.upsampleData() : this.loadStratumData();

        loadTask
            .then(data => {
                if (abortSignal.aborted) return;

                this._decodedData = data;
                this.tile.buildGeometry(data);
                onDone(TileLoaderState.Loaded);
            })
            .catch(err => {
                if (err.name !== "AbortError") onError(err);
            });
    }
}

export class StratumResourceTile extends Tile {
    private readonly heightCache = new LRUCache<string, number>(100);
    private _stratumData?: StratumData;
    private _geometry?: THREE.BufferGeometry;
    private _boundingBox?: THREE.Box3;
    private _localCenter?: THREE.Vector3;

    constructor(
        readonly dataSource: DataSource,
        readonly tileKey: TileKey,
        offset: number = 0,
        localTangentSpace: boolean = false
    ) {
        super(dataSource, tileKey, offset, localTangentSpace);
    }

    // 新增就绪状态检查
    get isReady(): boolean {
        return !!this._stratumData;
    }

    get stratumData() {
        return this._stratumData;
    }

    buildGeometry(data: StratumData) {
        this._stratumData = data;
        this._geometry = new THREE.BufferGeometry();

        // 设置顶点属性
        this._geometry.setAttribute("position", new THREE.BufferAttribute(data.mesh.vertices, 3));

        // 设置法线（如果存在）
        if (data.mesh.normals) {
            this._geometry.setAttribute("normal", new THREE.BufferAttribute(data.mesh.normals, 3));
        }

        // 设置索引
        this._geometry.setIndex(new THREE.BufferAttribute(data.mesh.indices, 1));

        // 计算包围盒
        this._boundingBox = data.mesh.bounds.clone();
        this._localCenter = data.mesh.center.clone();
    }

    rayTest(ray: THREE.Ray, target?: THREE.Vector3): boolean {
        if (!this._stratumData || !this._geometry) return false;

        // 创建临时网格进行射线检测
        const tempMesh = new THREE.Mesh(this._geometry);
        if (this._localCenter) {
            tempMesh.position.copy(this._localCenter);
        }

        const raycaster = new THREE.Raycaster(ray.origin, ray.direction);
        const intersects = raycaster.intersectObject(tempMesh);

        if (intersects.length > 0 && target) {
            target.copy(intersects[0].point);
            return true;
        }
        return false;
    }

    getHeight(coord: GeoCoordinates): number | false {
        const hash = encode(coord.latitude, coord.longitude);
        if (this.heightCache.has(hash)) {
            return this.heightCache.get(hash)!;
        }

        const rayOrigin = this.dataSource.mapView.projection.projectPoint(coord);
        const ray = new THREE.Ray(rayOrigin as THREE.Vector3, new THREE.Vector3(0, 0, -1));

        const hitPoint = new THREE.Vector3();
        if (this.rayTest(ray, hitPoint)) {
            const geo = this.dataSource.mapView.projection.unprojectPoint(hitPoint);
            this.heightCache.set(hash, geo.altitude);
            return geo.altitude;
        }
        return false;
    }

    get geometry() {
        return this._geometry;
    }

    get heightMap(): HeightMap | undefined {
        return this._stratumData?.heightMap;
    }

    get minimumHeight(): number | undefined {
        return this._stratumData?.metadata?.minHeight;
    }

    get maximumHeight(): number | undefined {
        return this._stratumData?.metadata?.maxHeight;
    }

    wasCreatedByUpsampling(): boolean {
        return this._stratumData?.wasCreatedByUpsampling?.() || false;
    }

    onDispose() {
        if (this._geometry) this._geometry.dispose();
        this.heightCache.clear();
    }
}
