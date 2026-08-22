/* Copyright (C) 2025 flywave.gl contributors */

import {
    type TileGeometryBuilder,
    TileGeometryWithTransform,
    type TileTransformation
} from "@flywave/flywave-geometry";
import { GeoBox, type TilingScheme, TileKey } from "@flywave/flywave-geoutils";
import { type Tile } from "@flywave/flywave-mapview";
import { DataTexture, Mesh, Quaternion, RGBAFormat, Vector2, Vector3, Vector4 } from "three/webgpu";
import * as THREE from "three/webgpu";

import { type HeightMapModifierManager } from "../ground-modification-manager";
import { ProjectionSwitchController } from "../ProjectionSwitchController";
import { type DEMLayerKind, emptyOpaqueTex } from "./DEMTileLayerMaterial";

const zAxis = new Vector3(0, 0, 1);
const ORIGIN = new Vector3();
const uDemUnpack0 = new Vector4(6553.6, 25.6, 0.1, 10000.0);

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
 * Per-tile render state shared by all layer meshes of one tile.
 *
 * Computes the per-frame tile state once (projection interpolation, RTE
 * displacement, modifier refresh — all change-guarded) and writes the results
 * into each layer mesh's plain properties, which the shared material graphs
 * read back at draw time via onObjectUpdate. One computation, N cheap copies.
 */
export class TerrainTileState {
    private readonly m_tileKey: TileKey;
    private m_currentTile?: Tile;
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

    private m_modifierManager?: HeightMapModifierManager;
    private m_modifierVersion: number = -1;
    private m_modifierTexture: THREE.Texture | null = null;
    private m_modifierUVBounds: Vector4 = new Vector4();
    private m_modifierOp: number = 0;
    private m_mergedTexture: DataTexture | null = null;

    private m_heightMapTexture: THREE.Texture | null = null;
    private m_heightMapPos: Vector4 = new Vector4(1, 0, 0, 0);
    private m_texSize: Vector2 = new Vector2(1, 1);

    private m_lastProjFactor: number = Number.NaN;
    private m_frameDirty: boolean = true;

    readonly quaternion: Quaternion = new Quaternion();
    readonly displacement: Vector3 = new Vector3();
    readonly packCol0: Vector4 = new Vector4();
    readonly patchPos0: Vector4 = new Vector4();
    readonly patchPos1: Vector4 = new Vector4();
    readonly patchPos2: Vector4 = new Vector4();
    readonly patchPos3: Vector4 = new Vector4();

    constructor(
        tileKey: TileKey,
        tilingScheme: TilingScheme,
        projectionSwitchController: ProjectionSwitchController,
        tilingSchemeTileGrid: TileGeometryBuilder,
        geometryWithTransform: TileGeometryWithTransform
    ) {
        this.m_tileKey = tileKey;
        this.m_geometry = geometryWithTransform.geometry;
        this.m_terrainTilingScheme = tilingScheme;
        this.m_projectionSwitchController = projectionSwitchController;
        this.m_tilingSchemeTileGrid = tilingSchemeTileGrid;
        this.m_transformation = geometryWithTransform.transformation;
        this.m_skirtHeight = geometryWithTransform.skirtHeight;
        this.m_isSimplePatch = geometryWithTransform.geometry.mode.is_simple_patch ?? false;
        this.m_yDown = tilingSchemeTileGrid.isYAxisDown();
        this.m_selfGeoBox = this.m_terrainTilingScheme.getGeoBox(tileKey);

        this.m_targetZRotation =
            (Math.PI * 2 * tileKey.column) /
            this.m_tilingSchemeTileGrid
                .getTilingScheme()
                .subdivisionScheme.getLevelDimensionX(tileKey.level);

        this.packCol0.set(0, 0, 0, this.m_isSimplePatch ? 1 : 0);
    }

    get tileKey(): TileKey {
        return this.m_tileKey;
    }

    /**
     * Bind the CURRENT shadow tile incarnation. The displacement must be
     * computed against the very same tile whose center the renderer adds
     * back (TileObjectsRenderer does `position = tile.center + displacement`
     * live) — replicating the legacy mesh, which read `tile.center` every
     * frame instead of snapshotting it.
     */
    attachTile(tile: Tile): void {
        this.m_currentTile = tile;
    }

    get geometryRef(): THREE.BufferGeometry {
        return this.m_geometry;
    }

    setModifierManager(manager: HeightMapModifierManager): void {
        this.m_modifierManager = manager;
        this.m_modifierVersion = -1;
        this.m_frameDirty = true;
    }

    setHeightMap(texture: THREE.Texture, demTileKey: TileKey): void {
        const pos = computeHeightMapPos(
            this.m_tileKey,
            demTileKey,
            this.m_tilingSchemeTileGrid.isYAxisDown()
        );
        texture.flipY = this.m_yDown;
        this.m_heightMapTexture = texture;
        const img = texture.image as { width?: number; height?: number } | undefined;
        if (img && img.width) {
            this.m_texSize.set(img.width, img.height);
        }
        this.m_heightMapPos.set(pos.x, pos.y, pos.z, 0);
        this.m_frameDirty = true;
    }

    /**
     * Drop the elevation texture reference (e.g. when the owning tile is
     * evicted from the terrain LRU and resourceManager.dispose() frees the
     * DEM texture). Sampling a destroyed GPU texture yields undefined
     * elevation (~1.6M m garbage) — the state must fall back to the
     * "no DEM" branch until a fresh texture arrives via setHeightMap.
     * Layer meshes/materials stay alive for warm-cache adoption.
     */
    invalidateElevation(): void {
        this.m_heightMapTexture = null;
        this.m_frameDirty = true;
    }

    /** Per-frame update — verbatim replica of the legacy updateProjectionTransform. */
    updateFrame(): void {
        const projectionFactor = this.m_projectionSwitchController.projectionFactor;

        const hasRotation = this.m_transformation.interpolateTo(
            projectionFactor,
            this.m_scratchInterpPos,
            this.m_uPatchPos
        );
        if (!hasRotation) {
            this.m_uPatchPos.identity();
        }
        const e = this.m_uPatchPos.elements;
        this.patchPos0.set(e[0], e[1], e[2], e[3]);
        this.patchPos1.set(e[4], e[5], e[6], e[7]);
        this.patchPos2.set(e[8], e[9], e[10], e[11]);
        this.patchPos3.set(e[12], e[13], e[14], e[15]);

        this.quaternion.identity();
        if (!this.m_isSimplePatch) {
            const currentZRotation = this.m_targetZRotation * (1 - projectionFactor);
            this.quaternion.setFromAxisAngle(zAxis, currentZRotation);
        }

        // Live tile center, read every frame — exactly like the legacy mesh
        // (`this.m_tile.center`), so displacement self-cancels against the
        // renderer's `tile.center + displacement` regardless of when/whether
        // the tile's center value is (re)computed.
        this.displacement
            .copy(this.m_scratchInterpPos)
            .sub(this.m_currentTile ? this.m_currentTile.center : ORIGIN);

        this.m_lastProjFactor = projectionFactor;
        this.updateModifierState();
    }

    /** Push the current tile state into one layer mesh's draw-time properties. */
    writeTo(mesh: TerrainLayerMesh): void {
        mesh.packCol0.copy(this.packCol0);
        mesh.patchPos0.copy(this.patchPos0);
        mesh.patchPos1.copy(this.patchPos1);
        mesh.patchPos2.copy(this.patchPos2);
        mesh.patchPos3.copy(this.patchPos3);
        mesh.skirtHeight = this.m_skirtHeight;
        mesh.projectionFactor = this.m_lastProjFactor;
        mesh.displacement.copy(this.displacement);
        mesh.quaternion.copy(this.quaternion);

        // Legacy parity (HeightMapTerrainMesh.updateUniforms): without a DEM
        // texture the unpack constants MUST be zero — decoding the 1×1 white
        // dummy with real unpack constants yields ~1.6M m elevation and the
        // tile launches into space.
        if (this.m_heightMapTexture) {
            mesh.heightMapTexture = this.m_heightMapTexture;
            mesh.demUnpack.copy(uDemUnpack0);
            mesh.heightMapPos.copy(this.m_heightMapPos);
            mesh.texSize.copy(this.m_texSize);
        } else {
            mesh.heightMapTexture = null;
            mesh.demUnpack.set(0, 0, 0, 0);
            mesh.heightMapPos.set(1, 0, 0, 0);
            mesh.texSize.set(1, 1);
        }

        if (this.m_modifierTexture) {
            mesh.hasModifier = 1;
            mesh.modifierTexture = this.m_modifierTexture;
            mesh.modifierUVBounds.copy(this.m_modifierUVBounds);
            mesh.modifierOp = this.m_modifierOp;
        } else {
            mesh.hasModifier = 0;
            mesh.modifierTexture = null;
        }
    }

    private updateModifierState(): void {
        if (!this.m_modifierManager) return;
        if (this.m_modifierVersion === this.m_modifierManager.version) return;
        this.m_modifierVersion = this.m_modifierManager.version;

        this.refreshModifierQuery();
        // values applied in writeTo()
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
 * Thin layer mesh: shared tile geometry + one dedicated material instance
 * (never shared between meshes). All per-mesh render data lives as PLAIN
 * PROPERTIES here — the shared material graphs read them at draw time via
 * onObjectUpdate, which is what lets every tile reuse ONE compiled pipeline.
 * Never owns its geometry (globally cached in TileGeometryBuilder).
 */
export class TerrainLayerMesh extends Mesh {
    public readonly isTerrainLayerMesh = true;
    public readonly layerKey: string;
    public readonly layerKind: DEMLayerKind;

    // --- Draw-time properties read by the shared material graphs ---
    public heightMapTexture: THREE.Texture | null = null;
    public modifierTexture: THREE.Texture | null = null;
    public layerTexture: THREE.Texture | null = null;
    public uvTransform: Vector4 = new Vector4(1, 1, 0, 0);
    public opacity: number = 1;
    public hasImagery: number = 0;
    public fallbackColor: THREE.Color = new THREE.Color(0.5, 0.5, 0.5);
    public packCol0: Vector4 = new Vector4();
    public patchPos0: Vector4 = new Vector4();
    public patchPos1: Vector4 = new Vector4();
    public patchPos2: Vector4 = new Vector4();
    public patchPos3: Vector4 = new Vector4();
    public demUnpack: Vector4 = new Vector4();
    public heightMapPos: Vector4 = new Vector4(1, 0, 0, 0);
    public texSize: Vector2 = new Vector2(1, 1);
    public skirtHeight: number = 0;
    public projectionFactor: number = 0;
    public modifierUVBounds: Vector4 = new Vector4();
    public modifierOp: number = 0;
    public hasModifier: number = 0;
    public displacement: Vector3 = new Vector3();
    // Projector overlay (world-space sampling): live references owned by
    // ProjectorOverlayManager — mutated in place (matrix recomputed on
    // geoBox change, cameraPos refreshed every frame), read at draw time via
    // the material's onObjectUpdate uniforms.
    public projectorMatrix?: THREE.Matrix4;
    public projectorCameraPos?: THREE.Vector3;

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
            tileState.writeTo(this);
        };
    }

    /** Swap albedo imagery in place (plain property write, zero rebuilds). */
    setImagery(tex: THREE.Texture | null, uvTransform?: THREE.Vector4) {
        this.layerTexture = tex;
        this.hasImagery = tex ? 1 : 0;
        if (uvTransform) {
            this.uvTransform.copy(uvTransform);
        }
        // Rebind the per-material texture node IN PLACE (module-level shared
        // texture nodes lose per-object values in this architecture — see
        // DEMTileLayerMaterial). Reference guard: these setters fire on every
        // tile-cache event; rebinding an unchanged texture would still
        // trigger a binding refresh.
        const mat = this.material as any;
        if (mat.imageryTexNode && mat.imageryTexNode.value !== (tex ?? emptyOpaqueTex)) {
            mat.imageryTexNode.value = tex ?? emptyOpaqueTex;
        }
    }

    /** Swap decal texture / params in place. */
    setLayerTexture(tex: THREE.Texture) {
        this.layerTexture = tex;
        this.hasImagery = 1;
        const mat = this.material as any;
        if (mat.decalTexNode && mat.decalTexNode.value !== tex) {
            mat.decalTexNode.value = tex;
        }
    }

    setLayerOpacity(value: number) {
        this.opacity = value;
    }

    setLayerUvTransform(transform: THREE.Vector4) {
        this.uvTransform.copy(transform);
    }

    dispose(): void {
        (this.material as THREE.Material).dispose();
    }

    clone(recursive?: boolean): this {
        return this;
    }
}
