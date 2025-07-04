import "./Shader";

import { sphereTileGridGeometry } from "@flywave/flywave-geometry";
import { TileKey } from "@flywave/flywave-geoutils";
import { DataSource, Tile, TileLoaderState } from "@flywave/flywave-mapview";
import { TileFactory, TileLoader } from "@flywave/flywave-mapview-decoder";
import { DataTexture, Matrix3, Matrix4, Mesh, MeshDepthMaterial, Vector3, Vector4 } from "three";

import DEMData from "./dem/DemData";
import { HeightMapProvider, HeightMapTextureResult } from "./HeightMapProvider";
import { HeightMapSource } from "./HeightMapSource";

declare module "three" {
    interface Mesh {
        displacement?: Vector3;
    }
}

interface MaterialTile {
    tileKey: TileKey;
    textElementGroups: Array<{ featureId: string }>;
    // Add other properties as needed
}

interface MaterialProvider {
    getNeareastMaterialTile(tileKey: TileKey): MaterialTile | undefined;
    loadNeareastTile(tileKey: TileKey): void;
    getMaterialByTile(materialTile: MaterialTile): any;
}

export class HeightMapDemTileLoader extends TileLoader {
    loadImpl(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        (this.dataProvider as HeightMapProvider)
            .fetchTileDem(this.tileKey, abortSignal)
            .then(payload => {
                if (this.dataSource.isDetached()) {
                    return;
                }
                if (abortSignal.aborted) {
                    const err = new Error("Aborted");
                    err.name = "AbortError";
                    throw err;
                }
                if (payload) {
                    this.onLoaded(payload, onDone, onError);
                } else {
                    throw new Error("Net error");
                }
            })
            .catch(error => {
                if (error.name === "AbortError" || error.message === "AbortError: Aborted") {
                    return;
                }
                onError(error);
            });
    }
}

export class HeightMapMeshTileFactory extends TileFactory<HeightMapMeshTile> {
    create(dataSource: DataSource, tileKey: TileKey) {
        return new HeightMapMeshTile(dataSource as HeightMapSource, tileKey);
    }
}

const uDemUnpack0 = new Vector4(6553.6, 25.6, 0.1, 10000.0);
const uDemUnpack1 = new Vector4(0.0, 0.0, 0, 0);
const emptyTexture = new DataTexture();

export class HeightMapMeshTile extends Tile {
    private uPatchPos?: Matrix4 | false;
    private uHeightMapPos?: Vector3;
    private uHeighMapTexture?: any;
    private is_simple_patch: boolean = false;
    private demTile?: DEMData;
    private _markClearTree?: boolean;
    private _neighboringTiles: Record<number, any>;
    needsHillshadePrepare: boolean | null | undefined;
    needsDEMTextureUpload: boolean | null | undefined;
    error?: Error;
    uvMatrix: Matrix3;

    get dem() {
        return this.demTile;
    }

    set dem(value: DEMData) {
        this.demTile = value;
    }

    get neighboringTiles() {
        return this._neighboringTiles;
    }

    set neighboringTiles(value: Record<number, any>) {
        this._neighboringTiles = value;
    }

    set markClearTree(value: boolean) {
        this._markClearTree = value;
    }

    constructor(dataSource: HeightMapSource, tileKey: TileKey) {
        super(dataSource, tileKey);

        const materialProviders = dataSource.getMaterialProviders();
        dataSource.dataProvider().touchData(tileKey);

        const demTile = dataSource.dataProvider().getNeareastDemTileTexture(tileKey);
        Object.assign(this, demTile);
        this.bindDemTileOwnerTexture(demTile || null);

        const textSet = new Set<string>();
        materialProviders.forEach(provider => {
            const materialTile = provider.getNeareastMaterialTile(tileKey);
            provider.loadNeareastTile(tileKey);

            if (materialTile) {
                this.builderMesh(materialTile, provider, tileKey, demTile || null);
                materialTile.textElementGroups.forEach(ele => {
                    if (!textSet.has(ele.featureId)) {
                        this.addTextElement(ele);
                        textSet.add(ele.featureId);
                    }
                });
            }
        });
    }

    onMeshBeforeRender = (material: any, materialTile: MaterialTile, tileKey: TileKey) => {
        const uUvTransform = this.computeUvTransfrom(tileKey, materialTile);
        const dataSource = this.dataSource as HeightMapSource;
        const overlayerHeightMap = dataSource.overlayerHeightMapTexture.getBindTexture(this);

        return (renderer: any, scene: any, camera: any, geometry: any) => {
            const { commonUniform } = material;

            if (scene.overrideMaterial && scene.overrideMaterial instanceof MeshDepthMaterial) {
                commonUniform.depth_packing_value.value = scene.overrideMaterial.depthPacking;
            } else {
                commonUniform.depth_packing_value.value = 0;
            }

            if (this.uPatchPos) commonUniform.uPatchPos.value.copy(this.uPatchPos);

            const mat = new Matrix4();
            mat.elements[0] = uUvTransform.x;
            mat.elements[1] = uUvTransform.y;
            mat.elements[2] = uUvTransform.z;
            mat.elements[3] = this.is_simple_patch ? 1 : 0;

            if (this.uHeighMapTexture) {
                const uHeightMapPos = this.uHeightMapPos!;

                mat.elements[4] = uDemUnpack0.x;
                mat.elements[5] = uDemUnpack0.y;
                mat.elements[6] = uDemUnpack0.z;
                mat.elements[7] = uDemUnpack0.w;

                mat.elements[8] = uHeightMapPos.x;
                mat.elements[9] = uHeightMapPos.y;
                mat.elements[10] = uHeightMapPos.z;
                commonUniform.uHeighMapTexture.value = this.uHeighMapTexture;
            } else {
                commonUniform.uHeighMapTexture.value = emptyTexture;
                mat.elements[4] = uDemUnpack1.x;
                mat.elements[5] = uDemUnpack1.y;
                mat.elements[6] = uDemUnpack1.z;
                mat.elements[7] = uDemUnpack1.w;
            }

            commonUniform.pack.value.copy(mat);
            if (overlayerHeightMap) {
                const [texture, transform] = overlayerHeightMap;
                commonUniform.overlayerHeightMapUvTransform.value = transform;
                commonUniform.overlayerHeightMap.value = texture;
            }

            commonUniform.uDigTexture.value = dataSource.overlayerHeightMapTexture.digTexture;
            commonUniform.digColor.value = dataSource.overlayerHeightMapTexture.digColor;
        };
    };

    clearTextElements(): void {
        // Implementation goes here
    }

    shouldDisposeObjectMaterial(): boolean {
        return false;
    }

    shouldDisposeObjectGeometry(): boolean {
        return false;
    }

    computeUvTransfrom(tileKey: TileKey, materialTile: MaterialTile): Vector3 {
        tileKey = TileKey.fromRowColumnLevel(
            (1 << tileKey.level) - 1 - tileKey.row,
            tileKey.column,
            tileKey.level
        );
        let ah = 1;
        let H = tileKey.level;
        let ae = tileKey.row;
        let J = tileKey.column;

        for (; H > materialTile.tileKey.level; H--) {
            ah *= 2;
            ae >>= 1;
            J >>= 1;
        }
        const P = 1 / ah;

        return new Vector3(P, (tileKey.row - ae * ah) * P, (tileKey.column - J * ah) * P);
    }

    builderMesh(
        materialTile: MaterialTile,
        materialProvider: MaterialProvider,
        tileKey: TileKey,
        demTile?: HeightMapTextureResult
    ): void {
        const { uHeighMapTexture, uHeightMapPos } = demTile || {};
        tileKey = TileKey.fromRowColumnLevel(
            (1 << tileKey.level) - 1 - tileKey.row,
            tileKey.column,
            tileKey.level
        );
        const basePost = sphereTileGridGeometry.computeSphereTileBasePosition(tileKey);

        const geometry = sphereTileGridGeometry.getTileModel(tileKey);
        const tileMesh = new Mesh(geometry, materialProvider.getMaterialByTile(materialTile));

        this.is_simple_patch = geometry.mode.is_simple_patch;
        if (!geometry.mode.is_simple_patch) {
            tileMesh.rotateZ((Math.PI * 2 * tileKey.column) / (1 << tileKey.level));
        } else {
            this.uPatchPos = sphereTileGridGeometry.computeSimpleROT(tileKey, basePost);
        }

        tileMesh.onBeforeRender = this.onMeshBeforeRender(
            tileMesh.material,
            materialTile,
            this.tileKey
        );

        if (uHeighMapTexture) {
            this.uHeightMapPos = uHeightMapPos;
            this.uHeighMapTexture = uHeighMapTexture;
        }

        tileMesh.scale.copy(new Vector3(6378137, 6378137, 6378137));
        tileMesh.displacement = this.center
            .clone()
            .multiplyScalar(-1)
            .add(basePost.multiplyScalar(6378137));
        tileMesh.receiveShadow = true;
        this.objects.push(tileMesh);
    }

    bindMaterialTileOwnerTexture(materialTile: MaterialTile): void {
        // Implementation goes here
    }

    bindDemTileOwnerTexture(demTile?: HeightMapTextureResult): void {
        if (demTile && demTile.tile.tileKey.mortonCode() === this.tileKey.mortonCode()) {
            this.addOwnedTexture(demTile.uHeighMapTexture);
        }
    }
}
