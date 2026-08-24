// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    type TilingScheme,
    GeoBox,
    geographicTerrainStandardTiling,
    ProjectionType
} from "@flywave/flywave-geoutils";
import { MapView } from "@flywave/flywave-mapview";
import { SurfaceType } from "@flywave/flywave-mapview";
import * as THREE from "three/webgpu";

import { type WebTile } from "../../WebImageryTileProvider";
import { type QuantizedTerrainMesh } from "./QuantizedTerrainMesh";
import { ProjectionSwitchController } from "../../ProjectionSwitchController";
import {
    QuantizedDecalMaterial,
    QuantizedMeshMaterial,
    emptyTexture
} from "./QuantizedMeshMaterial";

export class QuantizedMesh extends THREE.Mesh {
    // Draped-draw surface capture: this mesh provides ground surfaces.
    public readonly captureSurfaceType = SurfaceType.Terrain;
    public waterMaskTexture: THREE.Texture = emptyTexture;
    public waterMaskTranslationAndScale: THREE.Vector4 = new THREE.Vector4();
    public waterMaskNoisyTranslationAndScale: THREE.Vector4 = new THREE.Vector4();
    public normalSampler: THREE.Texture = emptyTexture;
    public frameNumber: number = 0;
    public clipUvTransform: THREE.Vector3 = new THREE.Vector3(1, 0, 0);

    /** Geographic extent of this tile mesh. */
    get geoBox(): GeoBox {
        return this.selfGeoBox;
    }

    constructor(
        private readonly selfGeoBox: GeoBox,
        private readonly quantizedTerrainMesh: QuantizedTerrainMesh,
        protected readonly projectionSwitchController: ProjectionSwitchController,
        protected readonly mapView?: MapView
    ) {
        // Per-mesh material (layer×mesh architecture): the first imagery
        // entry becomes this material's albedo; additional entries (and
        // projector decals) ride decal child meshes — see setupImageryTexture.
        super(undefined, new QuantizedMeshMaterial());
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

    /**
     * Layer×mesh imagery setup: the FIRST entry upgrades this mesh's own
     * material in place; every additional entry (cross-tile stitching
     * patches) becomes a decal child mesh sharing this geometry. The [0,1]
     * UV gate limits each patch to its own geoBox, so spatially disjoint
     * patches do not overlap.
     */
    public setupImageryTexture(
        webTiles: WebTile[],
        webTingScheme: TilingScheme,
        quantizedTilingScheme: TilingScheme
    ): void {
        const entries: Array<{ transform: THREE.Vector4; texture: THREE.Texture }> = [];
        for (const tile of webTiles) {
            const transform = this.computeTextureUvTransform(
                tile.geoBox,
                webTingScheme,
                quantizedTilingScheme
            );
            if (transform !== false) {
                entries.push({ texture: tile.texture, transform });
            }
        }
        if (entries.length === 0) return;

        const base = this.material as QuantizedMeshMaterial;
        base.imageryTexNode.value = entries[0].texture;
        base.uvTexTransform.value.copy(entries[0].transform);

        for (let i = 1; i < entries.length; i++) {
            const material = new QuantizedDecalMaterial();
            material.decalTexNode.value = entries[i].texture;
            material.uvTexTransform.value.copy(entries[i].transform);
            material.opacityUniform.value = 1;

            const decal = new THREE.Mesh(this.geometry, material);
            decal.castShadow = false;
            decal.receiveShadow = false;
            decal.frustumCulled = false;
            decal.raycast = () => {};
            this.add(decal);
        }
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

/**
 * Tile-UV → decal-UV transform for projector decals on quantized tiles.
 *
 * POSITIVE scales with the SIGNED y offset
 *   offsetY = (imgMax.y − quantMax.y) / texSize.y
 * (decal-south relative to tile-south, in the imagery scheme's projected
 * world) — the formula verified on the DEM path for arbitrary multi-tile
 * geoBoxes (TerrainTileState.computeTextureUvTransform, invertV = true).
 * ⚠️ Verified for web-mercator (y-down world) geometry where webMercatorY is
 * 1 at the tile's NORTH edge; the geographic-tiling variant is NOT yet
 * calibrated — if decals mirror under a geographic-scheme source, fix HERE
 * with the numeric log-reconciliation procedure used on the DEM path.
 */
export function computeDecalUvTransform(
    selfGeoBox: GeoBox,
    decalGeoBox: GeoBox,
    imageryTilingScheme: TilingScheme
): THREE.Vector4 | false {
    const quantizedWorldBox = new THREE.Box3(
        imageryTilingScheme.projection.projectPoint(selfGeoBox.southWest, new THREE.Vector3()),
        imageryTilingScheme.projection.projectPoint(selfGeoBox.northEast, new THREE.Vector3())
    );
    const imageryWorldBox = new THREE.Box3(
        imageryTilingScheme.projection.projectPoint(decalGeoBox.southWest, new THREE.Vector3()),
        imageryTilingScheme.projection.projectPoint(decalGeoBox.northEast, new THREE.Vector3())
    );

    const textureSize = new THREE.Vector2().subVectors(imageryWorldBox.max, imageryWorldBox.min);
    const tileSize = new THREE.Vector2().subVectors(quantizedWorldBox.max, quantizedWorldBox.min);

    const scaleX = Math.abs(tileSize.x / textureSize.x);
    const scaleY = Math.abs(tileSize.y / textureSize.y);
    const offsetX = (quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
    const offsetY = (imageryWorldBox.max.y - quantizedWorldBox.max.y) / textureSize.y;

    const transform = new THREE.Vector4(scaleX, scaleY, offsetX, offsetY);
    if (Number.isFinite(transform.length()) && Math.abs(scaleX) > 0 && Math.abs(scaleY) > 0) {
        return transform;
    }
    return false;
}
