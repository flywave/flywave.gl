import { TileKey } from "@flywave/flywave-geoutils";
import { Tile } from "@flywave/flywave-mapview";
import { TileFactory } from "@flywave/flywave-mapview-decoder";
import * as THREE from "three";
import { Material } from "three";

import { ElevationMaterial } from "./ElevationMaterial";
import normalJPEG from "./NormalWaterJpg";
import { TinTerrainProvider } from "./TinTerrainProvider";
import { TinTerrainSource } from "./TinTerrainSource";

// Texture loading helper
const loadWaterNormalTexture = (normalJPEG: string): THREE.Texture => {
    const texture = new THREE.Texture();
    const image = new Image();
    image.src = normalJPEG;
    image.onload = () => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
    };
    texture.image = image;
    return texture;
};

export class TerrainTileFactory extends TileFactory<TerrainTile> {
    create(dataSource: any, tileKey: TileKey): TerrainTile {
        return new TerrainTile(dataSource, tileKey);
    }
}

export class TerrainTile extends Tile {
    maxHeight: number = 0;
    minHeight: number = 0;
    shaders: THREE.ShaderMaterialParameters[] = [];
    materialTiles: any[] = [];
    wireframe: boolean = false;
    rayTestMesh?: THREE.Mesh;
    bindedTinTile?: any;

    private readonly waterNormalTexture: THREE.Texture;
    private readonly emptyTexture: THREE.DataTexture;
    private readonly elevationMaterials: ElevationMaterial[] = [];

    constructor(dataSource: TinTerrainSource, tileKey: TileKey) {
        super(dataSource, tileKey);

        this.waterNormalTexture = loadWaterNormalTexture(normalJPEG);
        this.emptyTexture = new THREE.DataTexture();

        const dataProvider = dataSource.dataProvider() as TinTerrainProvider;
        dataProvider.loadTile(tileKey);
        const tinTile = dataProvider.getBestAvailableTile(tileKey);

        if (!tinTile) return;

        this.bindedTinTile = tinTile;
        this.geoBox.southWest.altitude = tinTile.minimumHeight;
        this.geoBox.northEast.altitude = tinTile.maximumHeight;
        this.updateBoundingBox();

        const objects = new THREE.Object3D();
        objects.position.copy(this.center).multiplyScalar(-1);
        this.objects.push(objects);

        this.rayTestMesh = this.builderRayTestMesh(tinTile);

        dataSource.getMaterialProviders().forEach(provider => {
            this.builderMeshByMaterialProvider(provider, objects);
        });
    }

    willRender(): boolean {
        // Update frame numbers for animation
        this.elevationMaterials.forEach(material => {
            material.frameNumber = this.dataSource.mapView.frameNumber;
        });

        const dataSource = this.dataSource as TinTerrainSource;

        // Update wireframe state if changed
        if (dataSource.wireframe !== this.wireframe) {
            this.elevationMaterials.forEach(material => {
                material.wireframe = dataSource.wireframe;
            });
            this.wireframe = dataSource.wireframe;
        }

        return true;
    }

    private configureElevationMaterial(material: ElevationMaterial, tinTile: any): void {
        // Set up material properties based on tile data
        material.clipUvTransform = this.computeClipUvTransfrom(tinTile.tileKey, this.tileKey);

        const waterMaskTile = this.getWaterMaskTile();
        if (waterMaskTile) {
            material.waterMaskTexture = waterMaskTile.waterMask;
            material.normalTexture = this.waterNormalTexture;
            material.waterMaskTranslationAndScale = this.computeWaterMaskTransfrom(
                waterMaskTile,
                tinTile
            );
            material.waterMaskNoisyTranslationAndScale =
                this.computeWaterMaskNoisyTransfrom(tinTile);
        } else {
            material.waterMaskTexture = this.emptyTexture;
            material.normalTexture = this.emptyTexture;
        }

        this.elevationMaterials.push(material);
    }

    private builderMeshByMaterialProvider(provider: any, objects: THREE.Object3D): void {
        provider.loadNeareastRectangleLevel(this.geoBox, this.tileKey.level);
        const textSet = new Set();

        provider
            .getNeareastRectangleByLevel(this.geoBox, this.tileKey.level)
            .forEach((materialTile: any) => {
                objects.add(this.builderMesh(this.builderMeshMaterial(provider, materialTile)));

                materialTile.textElementGroups.forEach((ele: any) => {
                    if (!textSet.has(ele.featureId)) {
                        this.addTextElement(ele);
                        textSet.add(ele.featureId);
                    }
                });
            });
    }

    private builderMeshMaterial(provider: any, materialTile: any): Material {
        this.materialTiles.push(materialTile);
        const material = provider.getMaterialByTile(materialTile);

        if (material instanceof ElevationMaterial) {
            this.configureElevationMaterial(material, this.bindedTinTile);
        } else {
            material.onBeforeCompile = this.createShaderModifier(
                this.bindedTinTile,
                this,
                this.computeTextureUvTransfrom(materialTile, provider),
                provider.isWebMercator()
            );
        }

        return material;
    }

    private createShaderModifier(
        tinTile: any,
        tile: TerrainTile,
        imageUv: THREE.Vector4,
        isWebMercator: boolean
    ) {
        return (shader: THREE.ShaderMaterialParameters) => {
            // Vertex shader modifications
            shader.vertexShader = shader.vertexShader
                .replace(
                    `#include <beginnormal_vertex>`,
                    `#include <beginnormal_vertex>
                     #include <beginnormal_tinterrain_vertex>`
                )
                .replace(
                    `#include <uv_pars_vertex>`,
                    `#include <uv_pars_vertex>
                     #include <tinterrain_common>`
                )
                .replace(
                    `#include <begin_vertex>`,
                    `#include <begin_vertex>
                     #include <begin_tinterrain_vertex>`
                );

            // Fragment shader modifications
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    `#include <color_pars_fragment>`,
                    `#include <color_pars_fragment>
                     #include <tinterrain_color_pars_fragment>
                     #include <water_mask_pars_fragment>`
                )
                .replace(
                    `#include <premultiplied_alpha_fragment>`,
                    `#include <premultiplied_alpha_fragment>
                     #include <discard_out_range_frag>
                     #include <water_mask_compute_color_fragment>`
                );

            // Set uniforms
            shader.uniforms.clipUvTransfrom = {
                value: tile.computeClipUvTransfrom(tinTile.tileKey, tile.tileKey)
            };
            shader.uniforms.imageUvTransfrom = { value: imageUv };
            shader.uniforms.isWebMercator = { value: isWebMercator };

            const waterMaskTile = tile.getWaterMaskTile();
            if (waterMaskTile) {
                shader.uniforms.u_waterMask = { value: waterMaskTile.waterMask };
                shader.uniforms.normalSampler = { value: this.waterNormalTexture };
                shader.uniforms.u_waterMaskTranslationAndScale = {
                    value: tile.computeWaterMaskTransfrom(waterMaskTile, tinTile)
                };
                shader.uniforms.u_waterMaskNoisyTranslationAndScale = {
                    value: tile.computeWaterMaskNoisyTransfrom(tinTile)
                };
                shader.uniforms.frameNumber = { value: this.dataSource.mapView.frameNumber };
                this.shaders.push(shader);
            } else {
                shader.uniforms.u_waterMask = { value: this.emptyTexture };
                shader.uniforms.normalSampler = { value: this.emptyTexture };
            }
        };
    }

    // Geometry builder methods remain largely the same with proper typing
    private builderMesh(material: Material): THREE.Object3D {
        const wrap = new THREE.Object3D();
        wrap.position.copy(this.center).multiplyScalar(-1);

        const tileMesh = new THREE.Mesh(this.bindedTinTile.geometry, material);
        tileMesh.renderOrder = this.tileKey.level;
        tileMesh.position.copy(this.bindedTinTile.tinCenter);
        tileMesh.receiveShadow = true;
        wrap.add(tileMesh);
        return wrap;
    }

    private builderRayTestMesh(tinTile: any): THREE.Mesh {
        return new THREE.Mesh(tinTile.geometry);
    }

    getRayTestMesh(camPosition: THREE.Vector3): THREE.Mesh | undefined {
        if (!this.rayTestMesh || !this.bindedTinTile) return;
        this.rayTestMesh.position.copy(
            new THREE.Vector3().copy(this.bindedTinTile.tinCenter).sub(camPosition)
        );
        this.rayTestMesh.updateMatrixWorld();
        return this.rayTestMesh;
    }

    getWaterMaskTile(): any | undefined {
        const dataSource = this.dataSource as TinTerrainSource;
        const waterMaskTile = (
            dataSource.dataProvider() as TinTerrainProvider
        ).findAncestorTileWithTerrainData(this.tileKey);
        return waterMaskTile?.waterMask ? waterMaskTile : undefined;
    }

    // Existing utility methods with proper typing
    computeWaterMaskNoisyTransfrom(tile: any): THREE.Vector4 {
        const tileRectangle = tile.geoBox;
        const tileWidth = tileRectangle.east - tileRectangle.west;
        const tileHeight = tileRectangle.north - tileRectangle.south;

        const scaleX = tileWidth / 180;
        const scaleY = tileHeight / 90;

        return new THREE.Vector4(
            (scaleX * (tileRectangle.west - 0)) / tileWidth,
            (scaleY * (tileRectangle.south - 0)) / tileHeight,
            scaleX,
            scaleY
        );
    }

    computeWaterMaskTransfrom(sourceTile: any, tile: any): THREE.Vector4 {
        const sourceTileRectangle = sourceTile.geoBox;
        const tileRectangle = tile.geoBox;
        const tileWidth = tileRectangle.east - tileRectangle.west;
        const tileHeight = tileRectangle.north - tileRectangle.south;

        const scaleX = tileWidth / (sourceTileRectangle.east - sourceTileRectangle.west);
        const scaleY = tileHeight / (sourceTileRectangle.north - sourceTileRectangle.south);

        return new THREE.Vector4(
            (scaleX * (tileRectangle.west - sourceTileRectangle.west)) / tileWidth,
            (scaleY * (tileRectangle.south - sourceTileRectangle.south)) / tileHeight,
            scaleX,
            scaleY
        );
    }

    computeClipUvTransfrom(ptileKey: TileKey, tileKey: TileKey): THREE.Vector3 {
        let ah = 1;
        let H = tileKey.level;
        let ae = tileKey.row;
        let J = tileKey.column;

        for (; H > ptileKey.level + 1; H--) {
            ah *= 2;
            ae >>= 1;
            J >>= 1;
        }

        const P = 1 / ah;
        return new THREE.Vector3(P, (tileKey.row - ae * ah) * P, (tileKey.column - J * ah) * P);
    }

    computeTextureUvTransfrom(materialTile: any, provider: any): THREE.Vector4 {
        const { geoBox: textuGeobox } = materialTile;
        const { geoBox: bindTinGeobox } = this.bindedTinTile;

        const textuProjGeobox = new THREE.Box3(
            provider.tileScheme.projection.projectPoint(textuGeobox.southWest, new THREE.Vector3()),
            provider.tileScheme.projection.projectPoint(textuGeobox.northEast, new THREE.Vector3())
        );

        const tinProjGeoBox = new THREE.Box3(
            provider.tileScheme.projection.projectPoint(
                bindTinGeobox.southWest,
                new THREE.Vector3()
            ),
            provider.tileScheme.projection.projectPoint(
                bindTinGeobox.northEast,
                new THREE.Vector3()
            )
        );

        const textuProjGeoboxSize = new THREE.Vector2().subVectors(
            textuProjGeobox.max,
            textuProjGeobox.min
        );
        const tinProjGeoBoxSize = new THREE.Vector2().subVectors(
            tinProjGeoBox.max,
            tinProjGeoBox.min
        );
        const w = Math.abs(tinProjGeoBoxSize.x / textuProjGeoboxSize.x);
        const h = Math.abs(tinProjGeoBoxSize.y / textuProjGeoboxSize.y);

        const offsetY = (tinProjGeoBox.min.y - textuProjGeobox.min.y) / textuProjGeoboxSize.y;
        const offsetX = (tinProjGeoBox.min.x - textuProjGeobox.min.x) / textuProjGeoboxSize.x;

        return new THREE.Vector4(w, h, offsetX, offsetY);
    }
}
