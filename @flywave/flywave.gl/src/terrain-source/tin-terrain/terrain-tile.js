import * as THREE from "three";
import { Tile } from "@flywave/flywave-mapview";
import { TileFactory } from "@flywave/flywave-mapview-decoder";

// import {
//   GeoCoordinates,
//   TileKey,
//   webMercatorProjection
// } from "@flywave/flywave-geoutils";
import "./shader"
import normalJPEG from "./normal-water-jpg";
import { Material } from "three";

var waterNormal = new THREE.Texture();
const areaTextureImage = new Image();
areaTextureImage.src = normalJPEG;
areaTextureImage.onload = function () {
  waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
  waterNormal.needsUpdate = true;
};
waterNormal.image = areaTextureImage;

const emptyTexture = new THREE.DataTexture();
export class TinTileFactory extends TileFactory {
  create(dataSource, tileKey) {
    return new TerrainTile(dataSource, tileKey);
  }
}

// var debugBoxGeometry = new THREE.BoxGeometry(100, 100, 100, 1, 1, 1);
class TerrainTile extends Tile {

  maxHeight = 0;
  minHeight = 0;

  constructor(dataSource, tileKey) {
    super(dataSource, tileKey);

    // if (this.tileKey.level == 3 && this.tileKey.column==7&&this.tileKey.row==2) {
    this.dataSource.dataProvider().loadTile(tileKey);
    // }
    // this.dataSource.dataProvider().loadTile(new TileKey(2886,6777,13));

    var tinTile = this.dataSource.dataProvider().getBestAvailableTile(tileKey);

    if (!tinTile) return;

    this.bindedTinTile = tinTile;

    this.geoBox.southWest.altitude = tinTile.minimumHeight;
    this.geoBox.northEast.altitude = tinTile.maximumHeight;
    this.updateBoundingBox();

    var materialProvders = dataSource.getMaterialProviders();

    var objects = new THREE.Object3D;
    objects.position.copy(this.center).multiplyScalar(-1);

    //debugTmesh 

    // if (this.tileKey.mortonCode() !== 389600670 && this.tileKey.mortonCode() !== 389600667){
    //   return;
    // }
    // if (this.tileKey.level == 3 && this.tileKey.column==7&&this.tileKey.row==2) {
    // objects.add(this.builderDebugMesh(tinTile));
    this.objects.push(objects);
    // }
    // return;

    this.rayTestMesh = this.builderRayTestMesh(tinTile);

    materialProvders.forEach(provider => {
      this.builderMeshByMaterialProvider(provider, objects);
    });

  }

  shaders = [];

  materialTiles = [];

  willRender = () => {
    this.shaders.forEach(shader => {
      if (shader.uniforms) {
        shader.uniforms.frameNumber.value = this.dataSource.mapView.frameNumber;
      }
    });
    this.bindedTinTile.frameNumber = this.mapView.frameNumber;
    this.materialTiles.forEach(mtl => mtl.frameNumber = this.mapView.frameNumber);

    if (this.dataSource.wireframe != this.wireframe) {
      this.materialTiles.forEach(mtl => mtl.wireframe = this.dataSource.wireframe);
      this.wireframe = this.dataSource.wireframe;
    } 
    return true;
  }

  // bindMaterialTileOwnerTexture(materialTile) {
  //   if (materialTile && materialTile.tileKey.mortonCode() == this.tileKey.mortonCode()) {
  //     this.addOwnedTexture(materialTile.material);
  //   }
  // }

  memoryUsage() {
    return 0;
  }

  onBeforeMaterialCompile = (tinTile, tile, imageUv, isWebMercator) => {
    var _this = this;
    // const { width, height } = this.dataSource.mapView.getCanvasClientSize();
    return function (shader) {
      shader.vertexShader = shader.vertexShader.replace(
        `#include <beginnormal_vertex>`,
        `#include <beginnormal_vertex>
         #include <beginnormal_tinterrain_vertex>`
      );

      shader.vertexShader = shader.vertexShader.replace(
        `#include <uv_pars_vertex>`,
        `#include <uv_pars_vertex>
         #include <tinterrain_common>`)

      shader.vertexShader = shader.vertexShader.replace(
        `#include <begin_vertex>`,
        `#include <begin_vertex>
         #include <begin_tinterrain_vertex>`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <color_pars_fragment>`,
        `#include <color_pars_fragment>
         #include <tinterrain_color_pars_fragment>
         #include <water_mask_pars_fragment>`);

      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <premultiplied_alpha_fragment>`,
        `#include <premultiplied_alpha_fragment>
         #include <discard_out_range_frag>
         #include <water_mask_compute_color_fragment>`);

      shader.defines = {};
      shader.uniforms.clipUvTransfrom = { value: tile.computeClipUvTransfrom(tinTile.tileKey, tile.tileKey) };
      shader.uniforms.imageUvTransfrom = { value: imageUv };
      shader.uniforms.isWebMercator = { value: isWebMercator };

      var waterMaskTile = tile.getWaterMaskTile();
      shader.defines["SHOW_REFLECTIVE_OCEAN"] = true;

      shader.defines["USE_UV"] = false;
      if (parseInt(__THREE__) >= 151) {
          shader.defines["USE_GT_151"] = true;
          shader.defines["USE_UV"] = true;
      }

      if (waterMaskTile) {
        shader.uniforms.u_waterMask = { value: waterMaskTile.waterMask };
        shader.uniforms.normalSampler = { value: waterNormal };
        shader.uniforms.u_waterMaskTranslationAndScale = {
          value:
            tile.computeWaterMaskTransfrom(waterMaskTile, tinTile)
        };

        shader.uniforms.u_waterMaskNoisyTranslationAndScale = {
          value:
            tile.computeWaterMaskNoisyTransfrom(tinTile)
        };

        // shader.uniforms.tileCenter = { value: new THREE.Vector3(tinTile.center.x, tinTile.center.y, tinTile.center.z) };
        shader.uniforms.frameNumber = { value: _this.dataSource.mapView.frameNumber };

        // var rotationObj = new THREE.Object3D();
        // rotationObj.lookAt(new THREE.Vector3().copy(tinTile.tinCenter).multiplyScalar(1));
        // rotationObj.updateWorldMatrix();
        // shader.uniforms.rotationMat = { value: rotationObj.matrixWorld }; 

        _this.shaders.push(shader);
      } else {
        shader.uniforms.u_waterMaskTranslationAndScale = { value: new THREE.Vector3() };
        shader.uniforms.u_waterMask = { value: emptyTexture };
        shader.uniforms.normalSampler = { value: emptyTexture };
      }
    }
  };

  computeWaterMaskNoisyTransfrom(tile) {
    var tileRectangle = tile.geoBox;
    var tileWidth = tileRectangle.east - tileRectangle.west;
    var tileHeight = tileRectangle.north - tileRectangle.south;

    var scaleX = tileWidth / 180;
    var scaleY = tileHeight / 90;

    var result = new THREE.Vector4;
    result.x =
      (scaleX * (tileRectangle.west - 0)) / tileWidth;
    result.y =
      (scaleY * (tileRectangle.south - 0)) / tileHeight;
    result.z = scaleX;
    result.w = scaleY;

    return result;
  }

  computeWaterMaskTransfrom(sourceTile, tile) {
    var sourceTileRectangle = sourceTile.geoBox;
    var tileRectangle = tile.geoBox;
    var tileWidth = tileRectangle.east - tileRectangle.west;
    var tileHeight = tileRectangle.north - tileRectangle.south;

    var scaleX = tileWidth / (sourceTileRectangle.east - sourceTileRectangle.west);
    var scaleY = tileHeight / (sourceTileRectangle.north - sourceTileRectangle.south);

    var result = new THREE.Vector4;
    result.x =
      (scaleX * (tileRectangle.west - sourceTileRectangle.west)) / tileWidth;
    result.y =
      (scaleY * (tileRectangle.south - sourceTileRectangle.south)) / tileHeight;
    result.z = scaleX;
    result.w = scaleY;

    return result;
  }

  computeClipUvTransfrom(ptileKey, tileKey) {
    const tinTileKey = ptileKey;
    var ah = 1, P, M;
    var H = tileKey.level, ae = tileKey.row, J = tileKey.column;
    for (; H > tinTileKey.level + 1; H--) {
      ah *= 2;
      ae >>= 1;
      J >>= 1
    }
    P = 1 / ah;

    return new THREE.Vector3(P, (tileKey.row - ae * ah) * P, (tileKey.column - J * ah) * P)
  }

  computeTextureUvTransfrom(materialTile, provider) {
    const { geoBox: textuGeobox } = materialTile;
    const { geoBox: bindTinGeobox } = this.bindedTinTile;

    var textuProjGeobox = new THREE.Box3(
      provider.tileScheme.projection.projectPoint(textuGeobox.southWest, new THREE.Vector3),
      provider.tileScheme.projection.projectPoint(textuGeobox.northEast, new THREE.Vector3)
    );

    var tinProjGeoBox = new THREE.Box3(
      provider.tileScheme.projection.projectPoint(bindTinGeobox.southWest, new THREE.Vector3),
      provider.tileScheme.projection.projectPoint(bindTinGeobox.northEast, new THREE.Vector3)
    );

    var textuProjGeoboxSize = new THREE.Vector2().subVectors(textuProjGeobox.max, textuProjGeobox.min);
    var tinProjGeoBoxSize = new THREE.Vector2().subVectors(tinProjGeoBox.max, tinProjGeoBox.min);
    var w = Math.abs(tinProjGeoBoxSize.x / textuProjGeoboxSize.x);
    var h = Math.abs(tinProjGeoBoxSize.y / textuProjGeoboxSize.y);

    var offsetY = (tinProjGeoBox.min.y - textuProjGeobox.min.y) / textuProjGeoboxSize.y;
    var offsetX = (tinProjGeoBox.min.x - textuProjGeobox.min.x) / textuProjGeoboxSize.x;

    if (this.tileKey.level == 1) {
      console.log(w, h, offsetX, offsetY);
    }
    return new THREE.Vector4(w, h, offsetX, offsetY);
  }

  builderMeshByMaterialProvider = (provider, objects) => {
    provider.loadNeareastRectangleLevel(this.geoBox, this.tileKey.level);
    var textSet = new Set();
    provider.getNeareastRectangleByLevel(this.geoBox, this.tileKey.level).forEach(materialTile => {
      objects.add(this.builderMesh(this.builderMeshMaterial(provider, materialTile)));

      materialTile.textElementGroups.forEach((ele) => {
        if (!textSet.has(ele.featureId)) {
          this.addTextElement(ele);
          textSet.add(ele.featureId);
        }
      });
    });
  }

  builderMeshMaterial = (provider, materialTile) => {
    // this.bindMaterialTileOwnerTexture(materialTile);
    this.materialTiles.push(materialTile);
    var material:Material = provider.getMaterialByTile(materialTile);
    material.onBeforeCompile = this.onBeforeMaterialCompile(this.bindedTinTile, this, this.computeTextureUvTransfrom(materialTile, provider), provider.isWebMercator());
    return material;
  }

  builderMesh(material) {
    var wrap = new THREE.Object3D;
    wrap.position.copy(this.center).multiplyScalar(-1);

    const tileMesh = new THREE.Mesh(this.bindedTinTile.geometry, material);
    tileMesh.renderOrder = this.tileKey.level;
    tileMesh.position.copy(this.bindedTinTile.tinCenter);
    tileMesh.receiveShadow = true;
    wrap.add(tileMesh);
    return wrap;
  }

  builderRayTestMesh(tinTile) {
    const tileMesh = new THREE.Mesh(tinTile.geometry);
    tileMesh.position.copy(tinTile.tinCenter);
    return tileMesh;
  }

  getRayTestMesh(camPosition) {
    this.rayTestMesh.position.copy(new THREE.Vector3().copy(this.bindedTinTile.tinCenter).sub(camPosition));
    this.rayTestMesh.updateMatrixWorld();
    return this.rayTestMesh;
  }

  builderDebugMesh(tinTile) {
    var wrap = new THREE.Object3D;
    wrap.position.copy(this.center).multiplyScalar(-1);

    const tileMesh = new THREE.Mesh(tinTile.geometry, new THREE.MeshPhongMaterial({ wireframe: false }));
    tileMesh.material.onBeforeCompile = this.onBeforeMaterialCompile(tinTile, this);
    tileMesh.renderOrder = this.tileKey.level;
    tileMesh.position.copy(tinTile.tinCenter);

    wrap.add(tileMesh);

    // const debug = new THREE.Mesh(new THREE.BoxGeometry(10000, 10000, 10000, 1, 1, 1), new THREE.MeshPhongMaterial({ wireframe: false }));
    // debug.position.copy(this.dataSource.mapView.projection.projectPoint(new GeoCoordinates(this.geoBox.south, this.geoBox.west)));

    // wrap.add(debug);
    return wrap;
  }

  getWaterMaskTile() {
    const { tileKey } = this;
    var waterMaskTile = this.dataSource.dataProvider().findAncestorTileWithTerrainData(tileKey);

    if (!waterMaskTile || !waterMaskTile.waterMask) {
      return;
    }

    return waterMaskTile;
  }
}
