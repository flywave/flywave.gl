/* Copyright (C) 2025 flywave.gl contributors */

// height-map/HeightMapTerrainMesh.ts
import { type TileGeometryBuilder, type TileTransformation } from "@flywave/flywave-geometry";
import { GeoBox, type TilingScheme, ProjectionType, TileKey } from "@flywave/flywave-geoutils";
import { MapView, Tile } from "@flywave/flywave-mapview";
import {
    DataTexture,
    LinearFilter,
    Matrix4,
    Mesh,
    RGBAFormat,
    Vector2,
    Vector3,
    Vector4
} from "three/webgpu";
import * as THREE from "three/webgpu";

import { type HeightMapModifierManager } from "../ground-modification-manager";
import { type ProjectorState } from "../projector-overlay";
import { type WebTile } from "../WebImageryTileProvider";
import {
    emptyTexture as matEmptyTexture,
    emptyImageryTextures,
    defaultDEMTileMeshMaterial
} from "./DEMTileMeshMaterial";
import { ProjectionSwitchController } from "../ProjectionSwitchController";

const uDemUnpack0 = new Vector4(6553.6, 25.6, 0.1, 10000.0);
const uDemUnpack1 = new Vector4(0.0, 0.0, 0, 0);

const _identityImageryTransforms = [
    new Vector4(1, 1, 0, 0),
    new Vector4(1, 1, 0, 0),
    new Vector4(1, 1, 0, 0),
    new Vector4(1, 1, 0, 0),
    new Vector4(1, 1, 0, 0)
];

function computeHeightMapPos(tileKey: TileKey, demTileKey: TileKey, yDown: boolean): Vector3 {
    tileKey = TileKey.fromRowColumnLevel(
        !yDown ? tileKey.row : (1 << tileKey.level) - 1 - tileKey.row,
        tileKey.column,
        tileKey.level
    );
    let ah = 1;
    let H = tileKey.level;
    let ae = tileKey.row;
    let J = tileKey.column;

    for (; H > demTileKey.level; H--) {
        ah *= 2;
        ae >>= 1;
        J >>= 1;
    }
    const P = 1 / ah;

    return new Vector3(P, (tileKey.row - ae * ah) * P, (tileKey.column - J * ah) * P);
}

export class HeightMapTerrainMesh extends Mesh {
    public readonly isHeightMapTerrainMesh = true;

    // --- Exposed properties (read by onObjectUpdate in DEMTileMeshMaterial) ---
    public heightMapTexture: THREE.Texture = matEmptyTexture;
    public modifierTexture: THREE.Texture | null = null;
    public imageryTextures: THREE.Texture[] = [...emptyImageryTextures];
    public imageryTransforms: THREE.Vector4[] = _identityImageryTransforms.map(v => v.clone());
    public packCol0: Vector4 = new Vector4();
    public demUnpack: Vector4 = new Vector4();
    public heightMapPos: Vector4 = new Vector4(1, 0, 0, 0);
    public patchPos0: Vector4 = new Vector4();
    public patchPos1: Vector4 = new Vector4();
    public patchPos2: Vector4 = new Vector4();
    public patchPos3: Vector4 = new Vector4();
    public texSize: Vector2 = new Vector2(1, 1);
    public skirtHeight: number = 0;
    public projectionFactor: number = 0;
    public modifierUVBounds: Vector4 = new Vector4();
    public modifierOp: number = 0;
    public hasModifier: number = 0;
    public imageryCount: number = 0;

    /**
     * Per-source projector overlay state. Bound once at mesh creation to the
     * owning TerrainSource's ProjectorOverlayManager.state. The DEM tile
     * material reads this every frame via TSL onObjectUpdate so that layer
     * mutations (add / remove / update) and per-frame RTE camera-position
     * refreshes propagate to every tile automatically.
     */
    public projectorState?: ProjectorState = undefined;

    // --- Internal state ---
    private m_uPatchPos: Matrix4;
    private m_uHeightMapPos?: Vector3;
    private m_isSimplePatch: boolean = false;
    private m_uHeighMapTexture: THREE.Texture = matEmptyTexture;
    private m_selfGeoBox: GeoBox;
    public displacement: Vector3 = new Vector3();
    private m_transformation: TileTransformation;
    private m_targetZRotation: number;
    private m_skirtHeight: number;
    private readonly m_yDown: boolean;
    private m_modifierManager?: HeightMapModifierManager;
    private m_modifierVersion: number = -1;
    private m_modifierTexture: THREE.Texture | null = null;
    private m_modifierUVBounds: Vector4 = new Vector4();
    private m_modifierOp: number = 0;
    private m_mergedTexture: DataTexture | null = null;
    private m_modifiersDirty: boolean = true;
    private m_tile: Tile;
    private readonly m_terrainTilingScheme: TilingScheme;
    private readonly m_projectionSwitchController: ProjectionSwitchController;
    private readonly m_tilingSchemeTileGrid: TileGeometryBuilder;

    constructor(
        tile: Tile,
        tilingScheme: TilingScheme,
        projectionSwitchController: ProjectionSwitchController,
        tilingSchemeTileGrid: TileGeometryBuilder
    ) {
        const geometryWithTransform = tilingSchemeTileGrid.getTileGeometryWithTransform(
            tile.tileKey
        );

        super(geometryWithTransform.geometry, defaultDEMTileMeshMaterial);

        this.m_tile = tile;
        this.m_terrainTilingScheme = tilingScheme;
        this.m_projectionSwitchController = projectionSwitchController;
        this.m_tilingSchemeTileGrid = tilingSchemeTileGrid;
        this.m_yDown = tilingSchemeTileGrid.isYAxisDown();
        this.m_selfGeoBox = this.m_terrainTilingScheme.getGeoBox(tile.tileKey);
        this.m_isSimplePatch = geometryWithTransform.geometry.mode.is_simple_patch;
        this.m_transformation = geometryWithTransform.transformation;
        this.m_skirtHeight = geometryWithTransform.skirtHeight;

        this.m_targetZRotation =
            (Math.PI * 2 * tile.tileKey.column) /
            this.m_tilingSchemeTileGrid
                .getTilingScheme()
                .subdivisionScheme.getLevelDimensionX(tile.tileKey.level);

        this._initializeMesh();

        this.frustumCulled = false;

        this.onBeforeRender = () => {
            this.updateProjectionTransform();
            this.updateModifierUniforms();
        };
    }

    private _initializeMesh() {
        this.receiveShadow = true;

        this.updateProjectionTransform();
    }

    setModifierManager(manager: HeightMapModifierManager): void {
        this.m_modifierManager = manager;
        this.m_modifierVersion = -1;
    }

    private updateModifierUniforms(): void {
        if (!this.m_modifierManager) return;

        if (this.m_modifierVersion !== this.m_modifierManager.version) {
            this.m_modifierVersion = this.m_modifierManager.version;
            this.refreshModifierQuery();
            this.m_modifiersDirty = true;
        }

        if (!this.m_modifiersDirty) return;
        this.m_modifiersDirty = false;

        if (this.m_modifierTexture) {
            this.hasModifier = 1;
            this.modifierTexture = this.m_modifierTexture;
            this.modifierUVBounds.copy(this.m_modifierUVBounds);
            this.modifierOp = this.m_modifierOp;
        } else {
            this.hasModifier = 0;
            this.modifierTexture = null;
        }
    }

    private refreshModifierQuery(): void {
        if (this.m_mergedTexture) {
            this.m_mergedTexture.dispose();
            this.m_mergedTexture = null;
        }

        const mods = this.m_modifierManager!.findIntersectingModifiers(this.m_selfGeoBox);

        if (mods.length === 0) {
            this.m_modifierTexture = null;
            return;
        }

        if (mods.length === 1) {
            this.m_modifierTexture = mods[0].texture;
            this.m_modifierOp = mods[0].heightOperation === "replace" ? 1 : 0;
            this.computeModifierUVBounds(mods[0].geoBox);
            return;
        }

        const ref = mods[0].texture!;
        const w = ref.image.width;
        const h = ref.image.height;
        const merged = new Uint8Array(w * h * 4);

        for (const mod of mods) {
            if (!mod.texture) continue;
            const src = mod.texture.image.data as Uint8Array;
            for (let i = 0; i < src.length && i < merged.length; i += 4) {
                const a = src[i + 3];
                if (a === 0) continue;
                const w0 = merged[i + 3] / 255;
                const w1 = a / 255;
                const totalW = w0 + w1;
                if (totalW === 0) continue;
                merged[i] = (merged[i] * w0 + src[i] * w1) / totalW;
                merged[i + 1] = (merged[i + 1] * w0 + src[i + 1] * w1) / totalW;
                merged[i + 2] = (merged[i + 2] * w0 + src[i + 2] * w1) / totalW;
                merged[i + 3] = Math.max(merged[i + 3], a);
            }
        }

        const tex = new DataTexture(merged, w, h, RGBAFormat);
        tex.minFilter = LinearFilter;
        tex.magFilter = LinearFilter;
        tex.needsUpdate = true;
        this.m_mergedTexture = tex;
        this.m_modifierTexture = tex;
        this.m_modifierOp = mods[0].heightOperation === "replace" ? 1 : 0;

        const unionSW = mods[0].geoBox.southWest.clone();
        const unionNE = mods[0].geoBox.northEast.clone();
        for (let i = 1; i < mods.length; i++) {
            unionSW.latitude = Math.min(unionSW.latitude, mods[i].geoBox.southWest.latitude);
            unionSW.longitude = Math.min(unionSW.longitude, mods[i].geoBox.southWest.longitude);
            unionNE.latitude = Math.max(unionNE.latitude, mods[i].geoBox.northEast.latitude);
            unionNE.longitude = Math.max(unionNE.longitude, mods[i].geoBox.northEast.longitude);
        }
        this.computeModifierUVBounds(new GeoBox(unionSW, unionNE));
    }

    private computeModifierUVBounds(modGeoBox: GeoBox): void {
        const tileMinLon = this.m_selfGeoBox.southWest.longitude;
        const tileMinLat = this.m_selfGeoBox.southWest.latitude;
        const tileMaxLat = this.m_selfGeoBox.northEast.latitude;
        const tileW = this.m_selfGeoBox.northEast.longitude - tileMinLon;
        const tileH = this.m_selfGeoBox.northEast.latitude - tileMinLat;

        const minU = (modGeoBox.southWest.longitude - tileMinLon) / tileW;
        const maxU = (modGeoBox.northEast.longitude - tileMinLon) / tileW;

        const minV = (modGeoBox.southWest.latitude - tileMinLat) / tileH;
        const maxV = (modGeoBox.northEast.latitude - tileMinLat) / tileH;

        this.m_modifierUVBounds.set(minU, minV, maxU, maxV);
    }

    updateProjectionTransform() {
        const projectionFactor = this.m_projectionSwitchController.projectionFactor;

        const interpolatedTransform = this.m_transformation.interpolate(projectionFactor);

        if (interpolatedTransform.rotation) {
            this.m_uPatchPos = interpolatedTransform.rotation;
            this._decomposePatchPos(this.m_uPatchPos);
        } else {
            this.m_uPatchPos = new Matrix4();
            this._decomposePatchPos(this.m_uPatchPos);
        }
        this.skirtHeight = this.m_skirtHeight;

        this.quaternion.identity();
        if (!this.m_isSimplePatch) {
            const targetRotation = this.m_targetZRotation;
            const currentZRotation = targetRotation * (1 - projectionFactor);
            this.rotateZ(currentZRotation);
        }

        this.displacement.copy(interpolatedTransform.position).sub(this.m_tile.center);

        this.projectionFactor = projectionFactor;
    }

    updateUniforms() {
        const mat = new Matrix4();

        mat.elements[3] = this.m_isSimplePatch ? 1 : 0;

        if (this.m_uPatchPos) {
            this._decomposePatchPos(this.m_uPatchPos);
        }

        if (this.m_uHeightMapPos) {
            mat.elements[4] = uDemUnpack0.x;
            mat.elements[5] = uDemUnpack0.y;
            mat.elements[6] = uDemUnpack0.z;
            mat.elements[7] = uDemUnpack0.w;

            mat.elements[8] = this.m_uHeightMapPos.x;
            mat.elements[9] = this.m_uHeightMapPos.y;
            mat.elements[10] = this.m_uHeightMapPos.z;

            this.heightMapTexture = this.m_uHeighMapTexture;
            const img = this.m_uHeighMapTexture.image as
                | { width?: number; height?: number }
                | undefined;
            if (img && img.width) {
                this.texSize.set(img.width, img.height);
            }
        } else {
            this.heightMapTexture = matEmptyTexture;
            mat.elements[4] = uDemUnpack1.x;
            mat.elements[5] = uDemUnpack1.y;
            mat.elements[6] = uDemUnpack1.z;
            mat.elements[7] = uDemUnpack1.w;

            mat.elements[8] = 1;
            mat.elements[9] = 0;
            mat.elements[10] = 0;
        }

        this._decomposePack(mat);

        const controller = this.m_projectionSwitchController;
        if (controller) {
            this.projectionFactor = controller.projectionFactor;
        }
    }

    setHeightMap(texture: THREE.Texture, demTileKey: TileKey) {
        this.m_uHeightMapPos = computeHeightMapPos(
            this.m_tile.tileKey,
            demTileKey,
            this.m_tilingSchemeTileGrid.isYAxisDown()
        );
        texture.flipY = this.m_yDown;
        this.m_uHeighMapTexture = texture;
        this.heightMapTexture = texture;
        const img = texture.image as { width?: number; height?: number } | undefined;
        if (img && img.width) {
            this.texSize.set(img.width, img.height);
        }
    }

    public setupImageryTexture(webTiles: WebTile[], webTingScheme: TilingScheme): void {
        const webTilesUnifrom: Array<{
            transform: THREE.Vector4;
            texture: THREE.Texture;
        }> = [];
        webTiles.map(tile => {
            const transform = this.computeTextureUvTransform(tile.geoBox, webTingScheme);
            if (transform !== false) {
                tile.texture.flipY = this.m_yDown;
                webTilesUnifrom.push({
                    texture: tile.texture,
                    transform
                });
            }
        });
        for (let i = 0; i < 5; i++) {
            this.imageryTextures[i] = null;
        }
        webTilesUnifrom.forEach((item, index) => {
            this.imageryTextures[index] = item.texture;
            this.imageryTransforms[index].copy(item.transform);
        });
        this.imageryCount = webTilesUnifrom.length;
    }

    private computeTextureUvTransform(
        imageryGeoBox: GeoBox,
        imageryTilingScheme: TilingScheme
    ): THREE.Vector4 | false {
        const quantizedWorldBox = new THREE.Box3();
        quantizedWorldBox.expandByPoint(
            imageryTilingScheme.projection.projectPoint(
                this.m_selfGeoBox.southWest,
                new THREE.Vector3()
            )
        );
        quantizedWorldBox.expandByPoint(
            imageryTilingScheme.projection.projectPoint(
                this.m_selfGeoBox.northEast,
                new THREE.Vector3()
            )
        );

        const imageryWorldBox = new THREE.Box3();
        imageryWorldBox.expandByPoint(
            imageryTilingScheme.projection.projectPoint(
                imageryGeoBox.southWest,
                new THREE.Vector3()
            )
        );
        imageryWorldBox.expandByPoint(
            imageryTilingScheme.projection.projectPoint(
                imageryGeoBox.northEast,
                new THREE.Vector3()
            )
        );

        const textureSize = new THREE.Vector2().subVectors(
            imageryWorldBox.max,
            imageryWorldBox.min
        );
        const tileSize = new THREE.Vector2().subVectors(
            quantizedWorldBox.max,
            quantizedWorldBox.min
        );

        const scaleX = Math.abs(tileSize.x / textureSize.x);
        const scaleY = Math.abs(tileSize.y / textureSize.y);

        let offsetX;
        let offsetY;
        if (this.m_tilingSchemeTileGrid.isYAxisDown()) {
            offsetX = Math.abs(quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
            offsetY = Math.abs(quantizedWorldBox.max.y - imageryWorldBox.max.y) / textureSize.y;
        } else {
            offsetX = (quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
            offsetY = (quantizedWorldBox.min.y - imageryWorldBox.min.y) / textureSize.y;
        }

        const transform = new THREE.Vector4(scaleX, scaleY, offsetX, offsetY);

        if (Number.isFinite(transform.length())) {
            return transform;
        }
        return false;
    }

    private _decomposePack(mat: Matrix4): void {
        const e = mat.elements;
        this.packCol0.set(e[0], e[1], e[2], e[3]);
        this.demUnpack.set(e[4], e[5], e[6], e[7]);
        this.heightMapPos.set(e[8], e[9], e[10], e[11]);
    }

    private _decomposePatchPos(mat: Matrix4): void {
        const e = mat.elements;
        this.patchPos0.set(e[0], e[1], e[2], e[3]);
        this.patchPos1.set(e[4], e[5], e[6], e[7]);
        this.patchPos2.set(e[8], e[9], e[10], e[11]);
        this.patchPos3.set(e[12], e[13], e[14], e[15]);
    }

    setDepthPacking(value: number) {}

    dispose() {
        this.geometry.dispose();
        if (this.m_mergedTexture) {
            this.m_mergedTexture.dispose();
            this.m_mergedTexture = null;
        }
    }

    clone(recursive?: boolean): this {
        return this;
    }
}
