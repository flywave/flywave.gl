// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    type TilingScheme,
    GeoBox,
    geographicTerrainStandardTiling,
    ProjectionType
} from "@flywave/flywave-geoutils";
import { MapView } from "@flywave/flywave-mapview";
import * as THREE from "three/webgpu";

import { type WebTile } from "../../WebImageryTileProvider";
import { type ProjectorTileEntry } from "../../projector-overlay";
import { type QuantizedTerrainMesh } from "./QuantizedTerrainMesh";
import { ProjectionSwitchController } from "../../ProjectionSwitchController";
import {
    defaultQuantizedMeshMaterial,
    emptyTexture,
    emptyTransparentTex,
    emptyImageryTextures
} from "./QuantizedMeshMaterial";

export class QuantizedMesh extends THREE.Mesh {
    // --- Exposed properties (read by onObjectUpdate in QuantizedMeshMaterial) ---
    public imageryTextures: THREE.Texture[] = [...emptyImageryTextures];
    public imageryTransforms: THREE.Vector4[] = [
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0)
    ];
    public imageryCount: number = 0;
    // --- Projector overlay decals (read by QuantizedMeshMaterial via
    // onObjectUpdate; populated by setupProjectorTextures) ---
    public projectorTextures: Array<THREE.Texture | null> = [];
    public projectorTransforms: THREE.Vector4[] = [];
    public projectorOpacities: number[] = [];
    public projectorCount: number = 0;
    public waterMaskTexture: THREE.Texture = emptyTexture;
    public waterMaskTranslationAndScale: THREE.Vector4 = new THREE.Vector4();
    public waterMaskNoisyTranslationAndScale: THREE.Vector4 = new THREE.Vector4();
    public normalSampler: THREE.Texture = emptyTexture;
    public frameNumber: number = 0;
    public clipUvTransform: THREE.Vector3 = new THREE.Vector3(1, 0, 0);

    constructor(
        private readonly selfGeoBox: GeoBox,
        private readonly quantizedTerrainMesh: QuantizedTerrainMesh,
        protected readonly projectionSwitchController: ProjectionSwitchController,
        protected readonly mapView?: MapView
    ) {
        super(undefined, defaultQuantizedMeshMaterial);
        this.receiveShadow = true;

        this.setupFromQuantizedTerrainMesh(quantizedTerrainMesh);
    }

    private setupFromQuantizedTerrainMesh(quantizedData: QuantizedTerrainMesh): void {
        this.geometry = quantizedData.quantizedGeometry;
        this.position.copy(quantizedData.position);
        this.scale.copy(quantizedData.scale);
        this.quaternion.copy(quantizedData.quaternion);

        this.setupParentTileKey(quantizedData.geoBox);
        this.setupWaterMask(quantizedData);
    }

    public setupImageryTexture(
        webTiles: WebTile[],
        webTingScheme: TilingScheme,
        quantizedTilingScheme: TilingScheme
    ): void {
        const webTilesUnifrom: Array<{
            transform: THREE.Vector4;
            texture: THREE.Texture;
        }> = [];
        webTiles.map(tile => {
            const transform = this.computeTextureUvTransform(
                tile.geoBox,
                webTingScheme,
                quantizedTilingScheme
            );
            if (transform !== false) {
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

    /**
     * Populate the projector decal slots from the intersecting projector
     * layers of this tile.
     *
     * Uses computeProjectorUvTransform — the SIGNED-offset variant verified
     * on the DEM path for arbitrary (multi-tile) geoBoxes. The imagery
     * variant (computeTextureUvTransform) is only correct for tile-aligned
     * imagery boxes and mirrors decals that span multiple tiles.
     *
     * NOTE: never touch texture.needsUpdate here — tile rebuilds run this on
     * every cache event and would re-upload the texture each pass.
     */
    public setupProjectorTextures(
        entries: ProjectorTileEntry[],
        projectorTilingScheme: TilingScheme,
        quantizedTilingScheme: TilingScheme
    ): void {
        this.projectorTextures = [];
        this.projectorTransforms = [];
        this.projectorOpacities = [];
        let count = 0;
        for (const entry of entries) {
            const transform = this.computeProjectorUvTransform(
                entry.geoBox,
                projectorTilingScheme,
                quantizedTilingScheme
            );
            if (transform === false) continue;
            // Same flipY convention as the DEM projector path (canvas/image
            // textures, upload-time flip; the signed-offset transform pairs
            // with v = 1 = image top).
            entry.texture.flipY = true;
            this.projectorTextures.push(entry.texture);
            this.projectorTransforms.push(transform);
            this.projectorOpacities.push(entry.opacity);
            count++;
        }
        this.projectorCount = count;
    }

    /**
     * Projector decal UV transform — POSITIVE scales with the SIGNED
     * y offset (imgMax.y − quantMax.y)/texSize.y (tile-south to decal-south
     * distance), the formula verified on the DEM path
     * (TerrainTileState.computeTextureUvTransform with invertV = true).
     */
    private computeProjectorUvTransform(
        imageryGeoBox: GeoBox,
        imageryTilingScheme: TilingScheme,
        quantizedTilingScheme: TilingScheme
    ): THREE.Vector4 | false {
        const quantizedWorldBox = new THREE.Box3(
            imageryTilingScheme.projection.projectPoint(
                this.quantizedTerrainMesh.geoBox.southWest,
                new THREE.Vector3()
            ),
            imageryTilingScheme.projection.projectPoint(
                this.quantizedTerrainMesh.geoBox.northEast,
                new THREE.Vector3()
            )
        );
        const imageryWorldBox = new THREE.Box3(
            imageryTilingScheme.projection.projectPoint(
                imageryGeoBox.southWest,
                new THREE.Vector3()
            ),
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

        const offsetX = (quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
        // SIGNED south-anchor offset — verified on the DEM path's
        // web-mercator (y-down world) geometry, where webMercatorY is 1 at
        // the tile's NORTH edge. ⚠️ RISK: the GEOGRAPHIC tiling variant has
        // a different geometry v convention (see TileGeometryBuilder's
        // non-simple-patch path) and is NOT yet calibrated — if decals
        // mirror under a geographic-scheme source, fix HERE with the same
        // numeric log-reconciliation procedure used on the DEM path; do not
        // change the material. The imagery variant's (quantMin − imgMin)
        // mercator anchor is only correct for tile-aligned boxes.
        const offsetY = (imageryWorldBox.max.y - quantizedWorldBox.max.y) / textureSize.y;

        const transform = new THREE.Vector4(scaleX, scaleY, offsetX, offsetY);

        if (Number.isFinite(transform.length()) && Math.abs(scaleX) > 0 && Math.abs(scaleY) > 0) {
            return transform;
        }
        return false;
    }

    private setupWaterMask(waterResource: QuantizedTerrainMesh): void {
        if (!waterResource.waterMask) return;

        this.waterMaskTexture = waterResource.waterMaskTexture;

        const waterGeoBox = GeoBox.fromArray(waterResource.waterMask.geoBox);
        this.waterMaskTranslationAndScale = this._computeWaterMaskTransform(waterGeoBox);
        this.waterMaskNoisyTranslationAndScale = this._computeWaterMaskNoisyTransform(
            this.selfGeoBox
        );
    }

    private setupParentTileKey(parentGeobox: GeoBox): void {
        this.clipUvTransform = this._computeClipUvTransform(parentGeobox);
    }

    override updateMatrixWorld(force?: boolean): void {
        super.updateMatrixWorld(force);
        if (this.mapView) {
            this.frameNumber = this.mapView.frameNumber ?? 0;
        }
    }

    private computeTextureUvTransform(
        imageryGeoBox: GeoBox,
        imageryTilingScheme: TilingScheme,
        quantizedTilingScheme: TilingScheme
    ): THREE.Vector4 | false {
        const quantizedWorldBox = new THREE.Box3(
            imageryTilingScheme.projection.projectPoint(
                this.quantizedTerrainMesh.geoBox.southWest,
                new THREE.Vector3()
            ),
            imageryTilingScheme.projection.projectPoint(
                this.quantizedTerrainMesh.geoBox.northEast,
                new THREE.Vector3()
            )
        );
        const imageryWorldBox = new THREE.Box3(
            imageryTilingScheme.projection.projectPoint(
                imageryGeoBox.southWest,
                new THREE.Vector3()
            ),
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

        const scaleX = tileSize.x / textureSize.x;
        const scaleY = tileSize.y / textureSize.y;

        let offsetX;
        let offsetY;
        if (quantizedTilingScheme == geographicTerrainStandardTiling) {
            offsetX = (quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
            offsetY = (imageryWorldBox.max.y - quantizedWorldBox.max.y) / textureSize.y;
        } else {
            offsetX = (quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
            offsetY = (quantizedWorldBox.min.y - imageryWorldBox.min.y) / textureSize.y;
        }

        const transform = new THREE.Vector4(scaleX, scaleY, offsetX, offsetY);

        if (Number.isFinite(transform.length()) && Math.abs(scaleX) > 0 && Math.abs(scaleY) > 0) {
            return transform;
        }
        return false;
    }

    private _computeClipUvTransform(parentGeobox: GeoBox): THREE.Vector3 {
        const currentGeobox = this.selfGeoBox;
        const parentWidth = parentGeobox.longitudeSpan;
        const parentHeight = parentGeobox.latitudeSpan;

        const uScale = currentGeobox.longitudeSpan / parentWidth;
        const vScale = currentGeobox.latitudeSpan / parentHeight;

        const uOffset = (currentGeobox.west - parentGeobox.west) / parentWidth;
        const vOffset = (currentGeobox.south - parentGeobox.south) / parentHeight;

        const scale = uScale * vScale;

        return new THREE.Vector3(scale, uOffset, vOffset);
    }

    private _computeWaterMaskTransform(waterGeoBox: GeoBox): THREE.Vector4 {
        const quantizedGeoBox = this.quantizedTerrainMesh.geoBox;

        const tileWidth = quantizedGeoBox.longitudeSpan;
        const tileHeight = quantizedGeoBox.latitudeSpan;

        const scaleX = tileWidth / waterGeoBox.longitudeSpan;
        const scaleY = tileHeight / waterGeoBox.latitudeSpan;

        return new THREE.Vector4(
            (scaleX * (quantizedGeoBox.west - waterGeoBox.west)) / tileWidth,
            (scaleY * (quantizedGeoBox.south - waterGeoBox.south)) / tileHeight,
            scaleX,
            scaleY
        );
    }

    private _computeWaterMaskNoisyTransform(quantizedGeoBox: GeoBox): THREE.Vector4 {
        const tileWidth = quantizedGeoBox.longitudeSpan;
        const tileHeight = quantizedGeoBox.latitudeSpan;

        const scaleX = tileWidth / 180;
        const scaleY = tileHeight / 90;

        return new THREE.Vector4(
            (scaleX * (quantizedGeoBox.west - 0)) / tileWidth,
            (scaleY * (quantizedGeoBox.south - 0)) / tileHeight,
            scaleX,
            scaleY
        );
    }
}
