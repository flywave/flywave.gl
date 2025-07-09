import { TileKey } from "@flywave/flywave-geoutils";
import { Tile } from "@flywave/flywave-mapview";
import * as THREE from "three";

import { StratumMaterial, StratumMaterialParams } from "./StratumMaterial";
import { StratumTerrainSource } from "./StratumTerrainSource";

export class StratumTile extends Tile {
    private _materialParams: StratumMaterialParams;
    private _stratumMaterial?: StratumMaterial;

    constructor(dataSource: StratumTerrainSource, tileKey: TileKey) {
        super(dataSource, tileKey);

        // 初始化材质参数
        this._materialParams = {
            satelliteTextures: [],
            satelliteUvTransforms: [
                new THREE.Vector4(1, 1, 0, 0),
                new THREE.Vector4(1, 1, 0, 0),
                new THREE.Vector4(1, 1, 0, 0),
                new THREE.Vector4(1, 1, 0, 0)
            ]
        };

        // 加载地形数据
        const dataProvider = dataSource.dataProvider();
        dataProvider.loadTile(tileKey);
        const stratumData = dataProvider.getTileData(tileKey);

        if (!stratumData) return;

        // 创建Three.js对象
        const objects = new THREE.Object3D();
        objects.position.copy(this.center).multiplyScalar(-1);
        this.objects.push(objects);

        // 构建网格
        objects.add(this._builderMesh(stratumData));
    }

    private _builderMesh(data: any): THREE.Object3D {
        const geometry = this._createGeometry(data);
        this._stratumMaterial = new StratumMaterial(this._materialParams);

        const mesh = new THREE.Mesh(geometry, this._stratumMaterial);
        mesh.receiveShadow = true;
        return mesh;
    }

    private _createGeometry(data: any): THREE.BufferGeometry {
        // 根据实际数据结构创建几何体
        const geometry = new THREE.BufferGeometry();

        // 示例：设置顶点数据
        geometry.setAttribute("position", new THREE.BufferAttribute(data.vertices, 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));

        // 设置面类型（如果使用）
        if (data.faceTypes) {
            geometry.setAttribute("facetype", new THREE.BufferAttribute(data.faceTypes, 1));
        }

        return geometry;
    }

    // 暴露材质参数配置方法
    configureMaterial(params: Partial<StratumMaterialParams>) {
        this._materialParams = { ...this._materialParams, ...params };

        // 动态更新材质
        if (this._stratumMaterial) {
            if (params.satelliteTextures) {
                this._stratumMaterial.satelliteTextures = params.satelliteTextures;
            }
            if (params.texture) {
                this._stratumMaterial.texture = params.texture;
            }
            // 其他参数更新...
        }
    }

    // UV变换配置代理方法
    setSatelliteUVTransform(
        index: number,
        scaleX: number,
        scaleY: number,
        offsetX: number,
        offsetY: number
    ) {
        if (this._stratumMaterial) {
            this._stratumMaterial.setSatelliteUVTransform(index, scaleX, scaleY, offsetX, offsetY);
        }
    }

    // 渲染模式控制
    set renderMode(mode: number) {
        if (this._stratumMaterial) {
            this._stratumMaterial.renderMode = mode;
        }
    }
}
