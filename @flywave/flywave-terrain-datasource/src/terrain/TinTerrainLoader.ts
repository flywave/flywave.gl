import { GeoCoordinates, TilingScheme } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { DataSource, Tile, TileLoaderState } from "@flywave/flywave-mapview";
import { TileLoader } from "@flywave/flywave-mapview-decoder";
import { encode } from "@vitaly-z/hilbert-geohash";
import * as THREE from "three";

import QuantizedMeshTerrainData from "./quantized-mesh/TerrainData";
import { HeightMap } from "./RenderHeightmap";

interface TinData {
    _mesh: {
        position3DAndHeight: Float32Array;
        textureCoordAndEncodedNormals: Float32Array;
        indices: Uint16Array | Uint32Array;
        center: THREE.Vector3;
        color?: Float32Array;
        indexCountWithoutSkirts?: number;
        maximumHeight?: number;
        minimumHeight?: number;
        _horizonOcclusionPoint?: THREE.Vector3;
    };
    heightMap?: HeightMap;
    waterMask?: THREE.DataTexture;

    upsample(
        tilingScheme: TilingScheme,
        sourceX: number,
        sourceY: number,
        sourceLevel: number,
        targetX: number,
        targetY: number,
        targetLevel: number,
        task: (data: any) => Promise<any>
    ): Promise<QuantizedMeshTerrainData>;

    wasCreatedByUpsampling(): boolean;
}

export class TinMeshLoader extends TileLoader {
    private readonly parentTile: TinMeshResourceTile | null;
    private readonly tile: TinMeshResourceTile;
    private _decodedTile?: QuantizedMeshTerrainData;

    constructor(
        dataSource: DataSource,
        tileKey: any,
        tile: TinMeshResourceTile,
        decoder: any,
        parentTile: TinMeshResourceTile | null
    ) {
        super(dataSource, tileKey, dataSource.dataProvider(), decoder);
        this.parentTile = parentTile;
        this.tile = tile;
    }

    private createMesh(
        quantizedMeshTerrainData: QuantizedMeshTerrainData,
        task: (data: any) => Promise<any>
    ): Promise<void> {
        return quantizedMeshTerrainData.createMesh(
            {
                x: this.tileKey.column,
                y: this.tileKey.row,
                level: this.tileKey.level,
                tilingScheme: this.dataSource.dataTerrainProvider.tilingScheme
            },
            task
        );
    }

    private createUpSampleMesh(
        task: (data: any) => Promise<any>
    ): Promise<QuantizedMeshTerrainData> {
        if (!this.parentTile) {
            throw new Error("Parent tile is required for upsampling");
        }
        const { tileKey } = this.parentTile;
        return this.parentTile.tinData.upsample(
            this.dataSource.dataTerrainProvider.tilingScheme,
            tileKey.column,
            tileKey.row,
            tileKey.level,
            this.tileKey.column,
            this.tileKey.row,
            this.tileKey.level,
            task
        );
    }

    loadImpl(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        if (!this.parentTile) {
            this.loadQuantizedMesh(abortSignal, onDone, onError);
        } else {
            this.loadQuantizedUpSampleMesh(abortSignal, onDone, onError);
        }
    }

    private loadQuantizedMesh(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        this.dataSource.dataTerrainProvider
            .requestTileGeometry(this.tileKey, abortSignal)
            .then((quantizedData: QuantizedMeshTerrainData | undefined) => {
                if (!quantizedData) {
                    const err = new Error("Aborted");
                    err.name = "AbortError";
                    throw err;
                }

                let _resolve: (value: any) => void;
                let _reject: (reason?: any) => void;
                const promise = new Promise<any>((resolve, reject) => {
                    _resolve = resolve;
                    _reject = reject;
                });

                let doneState: TileLoaderState;
                this.createMesh(quantizedData, (data: any) => {
                    this.onLoaded(
                        data,
                        (_doneState: TileLoaderState) => {
                            _resolve(this._decodedTile?.tileTerrain);
                            doneState = _doneState;
                        },
                        (err: Error) => {
                            onError(err);
                            _reject(err);
                        }
                    );
                    return promise;
                }).then(() => {
                    this._decodedTile = quantizedData;
                    onDone(doneState);
                });
            })
            .catch((error: Error) => {
                if (error.name === "AbortError" || error.message === "AbortError: Aborted") {
                    return;
                }
                onError(error);
            });
    }

    private loadQuantizedUpSampleMesh(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        let _reqResolve: (value: any) => void;
        let _reject: (reason?: any) => void;
        const promise = new Promise<any>((resolve, reject) => {
            _reqResolve = resolve;
            _reject = reject;
        });

        let doneState: TileLoaderState;
        this.createUpSampleMesh((data: any) => {
            this.onLoaded(
                data,
                () => {
                    _reqResolve(this._decodedTile?.tileTerrain);
                    return doneState;
                },
                (err: Error) => {
                    onError(err);
                    _reject(err);
                }
            );
            return promise;
        }).then((quantizedData: QuantizedMeshTerrainData) => {
            let _resolve: (value: any) => void;
            let _reject: (reason?: any) => void;
            const promise = new Promise<any>((resolve, reject) => {
                _resolve = resolve;
                _reject = reject;
            });

            this.createMesh(quantizedData, (data: any) => {
                this.onLoaded(
                    data,
                    (_doneState: TileLoaderState) => {
                        _resolve(this._decodedTile?.tileTerrain);
                        doneState = _doneState;
                    },
                    (err: Error) => {
                        onError(err);
                        _reject(err);
                    }
                );
                return promise;
            }).then(() => {
                this._decodedTile = quantizedData;
                onDone(doneState);
            });
        });
    }
}

export class TinMeshResourceTile extends Tile {
    private readonly lru: LRUCache<string, number> = new LRUCache(100);
    private _box?: THREE.Box3;
    private _tinData?: TinData;
    private _geometry?: THREE.BufferGeometry;
    private tinCenter?: THREE.Vector3;

    public get tinData() {
        return this._tinData;
    }

    async builderQuantized(tinData: TinData): Promise<void> {
        const { position3DAndHeight, textureCoordAndEncodedNormals, indices, center, color } =
            tinData._mesh;
        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.setAttribute("position", new THREE.BufferAttribute(position3DAndHeight, 3));
        if (color) geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
        geometry.setAttribute(
            "textureCoordAndEncodedNormals",
            new THREE.BufferAttribute(textureCoordAndEncodedNormals, 4)
        );
        this.tinCenter = new THREE.Vector3(center.x, center.y, center.z);

        const tempMesh = new THREE.Mesh(geometry);
        tempMesh.position.copy(this.tinCenter);
        tempMesh.updateMatrixWorld();
        this._box = new THREE.Box3();
        this._box.setFromObject(tempMesh);
        this._tinData = tinData;
        this._geometry = geometry;
    }

    get heightMap(): HeightMap | undefined {
        if (!this.tinData) return undefined;
        return this.tinData.heightMap;
    }

    get geometry(): THREE.BufferGeometry | undefined {
        if (!this.tinData) return undefined;
        return this._geometry;
    }

    rayTest(ray: THREE.Ray, target?: THREE.Vector3): boolean {
        if (!this.tinData || !this.tinCenter) return false;

        const { indices, position3DAndHeight } = this.tinData._mesh;
        const indicesLength = indices.length;
        const subIndices = indices; //.subarray(0, indexCountWithoutSkirts);

        let isRayed = false;
        const tri = new THREE.Triangle();
        if (!target) target = new THREE.Vector3();

        let preDistance = Number.MAX_SAFE_INTEGER;
        const testVector = new THREE.Vector3();
        for (let i = 0; i < indicesLength; i += 3) {
            const i0 = subIndices[i];
            const i1 = subIndices[i + 1];
            const i2 = subIndices[i + 2];

            tri.a
                .set(
                    position3DAndHeight[i0],
                    position3DAndHeight[i0 + 1],
                    position3DAndHeight[i0 + 2]
                )
                .add(this.tinCenter);

            tri.b
                .set(
                    position3DAndHeight[i1],
                    position3DAndHeight[i1 + 1],
                    position3DAndHeight[i1 + 2]
                )
                .add(this.tinCenter);

            tri.c
                .set(
                    position3DAndHeight[i2],
                    position3DAndHeight[i2 + 1],
                    position3DAndHeight[i2 + 2]
                )
                .add(this.tinCenter);

            isRayed = ray.intersectTriangle(tri.a, tri.b, tri.c, false, testVector) !== null;
            if (isRayed) {
                const distance = testVector.distanceTo(ray.origin);
                if (distance < preDistance) {
                    preDistance = distance;
                    target.copy(testVector);
                    break;
                }
            }
        }
        return target.length() !== 0;
    }

    getHeight(geocoord: GeoCoordinates): number | false {
        const code = encode(geocoord.latitude, geocoord.longitude);
        if (this.lru.has(code)) {
            return this.lru.get(code)!;
        }
        geocoord.altitude = 1000;
        const rayOrigin = this.dataSource.mapView.projection.projectPoint(geocoord);

        const ray = new THREE.Ray(
            rayOrigin as THREE.Vector3,
            new THREE.Vector3().copy(rayOrigin).normalize().multiplyScalar(-1)
        );

        const ret = new THREE.Vector3();
        if (this.rayTest(ray, ret)) {
            const geo = this.dataSource.mapView.projection.unprojectPoint(ret);
            this.lru.set(code, geo.altitude);
            return geo.altitude;
        }
        return false;
    }

    get waterMask(): THREE.DataTexture | undefined {
        return this.tinData?.waterMask;
    }

    wasCreatedByUpsampling(): boolean {
        return this.tinData?.wasCreatedByUpsampling() || false;
    }

    get maximumHeight(): number | undefined {
        return this.tinData?._mesh.maximumHeight;
    }

    get minimumHeight(): number | undefined {
        return this.tinData?._mesh.minimumHeight;
    }

    get horizonOcclusionPoint(): THREE.Vector3 | undefined {
        return this.tinData?._mesh._horizonOcclusionPoint;
    }

    onDispose = (tile: any): (() => void) => {
        return () => {};
    };
}
