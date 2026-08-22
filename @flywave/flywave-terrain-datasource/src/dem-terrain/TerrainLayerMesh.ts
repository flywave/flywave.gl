/* Copyright (C) 2025 flywave.gl contributors */

import {
    type TileGeometryBuilder,
    type TileTransformation,
    TileGeometryWithTransform
} from "@flywave/flywave-geometry";
import { GeoBox, type TilingScheme, TileKey } from "@flywave/flywave-geoutils";
import { type Tile } from "@flywave/flywave-mapview";
import { DataTexture, Mesh, Quaternion, RGBAFormat, Vector2, Vector3, Vector4 } from "three/webgpu";
import * as THREE from "three/webgpu";

import { type HeightMapModifierManager } from "../ground-modification-manager";
import { ProjectionSwitchController } from "../ProjectionSwitchController";
import { type DEMLayerKind, TerrainTileUniforms } from "./DEMTileLayerMaterial";

const uDemUnpack0 = new Vector4(6553.6, 25.6, 0.1, 10000.0);
const zAxis = new Vector3(0, 0, 1);

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

/**
 * Per-tile render state shared by all layer meshes of one
 * TerrainResourceTile.
 *
 * Owns the shared {@link TerrainTileUniforms} and performs the per-frame
 * frame-idempotent update (projection interpolation, RTE displacement,
 * modifier refresh). All layer meshes' materials reference the same uniform
 * node instances, so one write here drives every layer.
 */
export class TerrainTileState {
    readonly uniforms: TerrainTileUniforms = new TerrainTileUniforms();
    readonly quaternion: Quaternion = new Quaternion();

    private readonly m_tile: Tile;
    private readonly m_geometry: THREE.BufferGeometry;
    private readonly m_transformation: TileTransformation;
    private readonly m_targetZRotation: number;
    private readonly m_skirtHeight: number;
    private readonly m_isSimplePatch: boolean;
    private readonly m_yDown: boolean;
    private readonly m_terrainTilingScheme: TilingScheme;
    private readonly m_tilingSchemeTileGrid: TileGeometryBuilder;
    private readonly m_projectionSwitchController: ProjectionSwitchController;
    private readonly m_selfGeoBox: GeoBox;
    private readonly m_uPatchPos: THREE.Matrix4 = new THREE.Matrix4();
    private readonly m_scratchInterpPos: Vector3 = new Vector3();
    private m_uHeightMapPos?: Vector3;

    private m_modifierManager?: HeightMapModifierManager;
    private m_modifierVersion: number = -1;
    private m_modifierTexture: THREE.Texture | null = null;
    private m_modifierUVBounds: Vector4 = new Vector4();
    private m_modifierOp: number = 0;
    private m_mergedTexture: DataTexture | null = null;

    private m_lastProjFactor: number = Number.NaN;

    constructor(
        tile: Tile,
        tilingScheme: TilingScheme,
        projectionSwitchController: ProjectionSwitchController,
        tilingSchemeTileGrid: TileGeometryBuilder,
        geometryWithTransform: TileGeometryWithTransform
    ) {
        this.m_tile = tile;
        this.m_geometry = geometryWithTransform.geometry;
        this.m_terrainTilingScheme = tilingScheme;
        this.m_projectionSwitchController = projectionSwitchController;
        this.m_tilingSchemeTileGrid = tilingSchemeTileGrid;
        this.m_transformation = geometryWithTransform.transformation;
        this.m_skirtHeight = geometryWithTransform.skirtHeight;
        this.m_isSimplePatch = geometryWithTransform.geometry.mode.is_simple_patch ?? false;
        this.m_yDown = tilingSchemeTileGrid.isYAxisDown();
        this.m_selfGeoBox = this.m_terrainTilingScheme.getGeoBox(tile.tileKey);

        this.m_targetZRotation =
            (Math.PI * 2 * tile.tileKey.column) /
            this.m_tilingSchemeTileGrid
                .getTilingScheme()
                .subdivisionScheme.getLevelDimensionX(tile.tileKey.level);

        this.applyStaticUniforms();
    }

    get tileKey(): TileKey {
        return this.m_tile.tileKey;
    }

    get geometryRef(): THREE.BufferGeometry {
        return this.m_geometry;
    }

    private applyStaticUniforms(): void {
        this.uniforms.packCol0.value.set(0, 0, 0, this.m_isSimplePatch ? 1 : 0);
        this.uniforms.skirtHeight.value = this.m_skirtHeight;
    }

    setModifierManager(manager: HeightMapModifierManager): void {
        this.m_modifierManager = manager;
        this.m_modifierVersion = -1;
        this.updateModifierState();
    }

    setHeightMap(texture: THREE.Texture, demTileKey: TileKey): void {
        this.m_uHeightMapPos = computeHeightMapPos(
            this.m_tile.tileKey,
            demTileKey,
            this.m_tilingSchemeTileGrid.isYAxisDown()
        );
        texture.flipY = this.m_yDown;
        this.uniforms.setHeightMapTexture(texture);
        const img = texture.image as { width?: number; height?: number } | undefined;
        if (img && img.width) {
            this.uniforms.texSize.value.set(img.width, img.height);
        }
        this.uniforms.heightMapPos.value.set(
            this.m_uHeightMapPos.x,
            this.m_uHeightMapPos.y,
            this.m_uHeightMapPos.z,
            0
        );
        this.uniforms.demUnpack.value.copy(uDemUnpack0);
    }

    /** Idempotent per-frame update; cheap no-op when nothing changed. */
    updateFrame(): void {
        const projectionFactor = this.m_projectionSwitchController.projectionFactor;

        if (projectionFactor !== this.m_lastProjFactor) {
            this.m_lastProjFactor = projectionFactor;

            const hasRotation = this.m_transformation.interpolateTo(
                projectionFactor,
                this.m_scratchInterpPos,
                this.m_uPatchPos
            );
            if (!hasRotation) {
                this.m_uPatchPos.identity();
            }
            this.decomposePatchPos(this.m_uPatchPos);
            this.uniforms.projectionFactor.value = projectionFactor;

            this.quaternion.identity();
            if (!this.m_isSimplePatch) {
                const currentZRotation = this.m_targetZRotation * (1 - projectionFactor);
                this.quaternion.setFromAxisAngle(zAxis, currentZRotation);
            }

            this.uniforms.displacement
                .copy(this.m_scratchInterpPos)
                .sub(this.m_tile.center);
        }

        this.updateModifierState();
    }

    private decomposePatchPos(mat: THREE.Matrix4): void {
        const e = mat.elements;
        this.uniforms.patchPos0.value.set(e[0], e[1], e[2], e[3]);
        this.uniforms.patchPos1.value.set(e[4], e[5], e[6], e[7]);
        this.uniforms.patchPos2.value.set(e[8], e[9], e[10], e[11]);
        this.uniforms.patchPos3.value.set(e[12], e[13], e[14], e[15]);
    }

    private updateModifierState(): void {
        if (!this.m_modifierManager) return;

        if (this.m_modifierVersion === this.m_modifierManager.version) return;
        this.m_modifierVersion = this.m_modifierManager.version;

        this.refreshModifierQuery();

        if (this.m_modifierTexture) {
            this.uniforms.hasModifier.value = 1;
            this.uniforms.setModifierTexture(this.m_modifierTexture);
            this.uniforms.modifierUVBounds.value.copy(this.m_modifierUVBounds);
            this.uniforms.modifierOp.value = this.m_modifierOp;
        } else {
            this.uniforms.hasModifier.value = 0;
            this.uniforms.setModifierTexture(null);
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
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
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

    /**
     * UV transform mapping tile UV space into an imagery tile's texture space.
     * Returns false when the transform is not finite.
     */
    computeTextureUvTransform(
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

    dispose(): void {
        if (this.m_mergedTexture) {
            this.m_mergedTexture.dispose();
            this.m_mergedTexture = null;
        }
    }
}

/**
 * Thin layer mesh: shared tile geometry + one dedicated material instance.
 * Never owns its geometry (globally cached in TileGeometryBuilder); disposal
 * only releases the material.
 */
export class TerrainLayerMesh extends Mesh {
    public readonly isTerrainLayerMesh = true;
    public readonly layerKey: string;
    public readonly layerKind: DEMLayerKind;
    public displacement: Vector3;

    constructor(
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        tileState: TerrainTileState,
        layerKey: string,
        layerKind: DEMLayerKind
    ) {
        super(geometry, material);

        this.layerKey = layerKey;
        this.layerKind = layerKind;
        this.displacement = tileState.uniforms.displacement;

        this.userData.tileKey = tileState.tileKey;

        if (layerKind === "base") {
            this.receiveShadow = true;
        } else {
            this.castShadow = false;
            this.receiveShadow = false;
            this.raycast = () => {};
        }

        this.frustumCulled = false;

        this.onBeforeRender = () => {
            tileState.updateFrame();
            this.quaternion.copy(tileState.quaternion);
        };
    }

    dispose(): void {
        (this.material as THREE.Material).dispose();
    }

    clone(recursive?: boolean): this {
        return this;
    }
}
