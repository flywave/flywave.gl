import { DecodeResult, Header, LayerType } from "../decoder/types";
import { ColorMap } from "./ColorMap";
import { FaultProfile } from "./Fault";
import { Borehole } from "./Borehole";
import { StratumLayer } from "./Stratum";
import { CollapsePillar, CollapseProfile } from "./Collapse";
import { SectionLine } from "./Section";
import { BVH, BVHNode, HybridBuilder } from "../bvh";
import { StratumVoxel } from "./Voxel";
import { cross, dot, lengthV, lerp, minus, normalize, plus, times, Vector, Vector2D } from "../utils/vector";
import { Matrix } from "../utils/matrix";
import { FlatArray } from "../utils/flatarray";
import { weilerAthertonClip } from "../clipping";
import { triangulate } from "../triangulate";
import { toTileWorldBBox } from "./Project";
import * as THREE from 'three';
import { GeoBox } from "@flywave/flywave-geoutils";

export type BVHObject = CollapsePillar | StratumVoxel;

export type TileKey = any

// 新增类型定义
type ProjectionMatrix = {
    origin: Vector;
    xAxis: Vector;
    yAxis: Vector;
    normal: Vector;
};

// 地层剖面结构
export interface StratumProfile {
    stratumID: string;         // 地层唯一标识
    top: Vector[];            // 顶板交线点序列（沿剖切线有序排列）
    base: Vector[];           // 底板交线点序列
    crossSections: THREE.BufferGeometry[];  // 三角剖分后的TIN网格集合
    polys: Vector[][];       // 原始剖面多边形顶点序列
}

class StratumTile {
    private _id?: TileKey;
    private _header?: Header;
    private _bbox?: THREE.Box3;
    private _bboxEcef?: GeoBox;
    private _colorMap?: ColorMap;
    private _faultProfiles?: FaultProfile[];
    private _boreholes?: Borehole[];
    private _stratumLayers?: StratumLayer[];
    private _collapsePillars?: CollapsePillar[];
    private _sectionLines?: SectionLine[];
    private _vertices?: Float32Array;
    private _texCoords?: Float32Array;
    private _normals?: Float32Array;
    private _indices?: Uint16Array | Uint32Array;
    private _faceTypes?: Uint8Array;
    private _stratumBVH?: BVH<{}, CollapsePillar | StratumVoxel>;

    constructor(id?: TileKey, res?: DecodeResult, options?: any) {
        this._id = id;
        this.init(res);
    }

    get id() { return this._id; }
    get header() { return this._header; }
    get bbox() { return this._bbox; }
    get colorMap() { return this._colorMap; }
    get faultProfiles() { return this._faultProfiles; }
    get boreholes() { return this._boreholes; }
    get stratumLayers() { return this._stratumLayers; }
    get collapsePillars() { return this._collapsePillars; }
    get sectionLines() { return this._sectionLines; }

    // 在get geometries方法后添加BVH相关方法
    get stratumBVH(): BVH<{}, CollapsePillar | StratumVoxel> | undefined {
        return this._stratumBVH;
    }

    get geometries(): Record<string, Array<{ geometry: THREE.BufferGeometry, material: THREE.Material }>> {
        const groups = {
            stratum: [],
            fault: [],
            borehole: [],
            collapse: [],
            section: []
        } as Record<string, Array<{ geometry: THREE.BufferGeometry, material: THREE.Material }>>;

        // 收集地层体素几何及材质
        this._stratumLayers?.forEach(layer => {
            layer.voxels.forEach(voxel => {
                if (voxel.geometry && voxel.material) {
                    groups.stratum.push({
                        geometry: voxel.geometry,
                        material: voxel.material
                    });
                }
            });
        });

        // 收集断层几何及材质
        this._faultProfiles?.forEach(fault => {
            if (fault.geometry && fault.material) {
                groups.fault.push({
                    geometry: fault.geometry,
                    material: fault.material
                });
            }
        });

        // 收集钻孔几何及材质
        this._boreholes?.forEach(borehole => {
            borehole.geometries?.forEach((geom, index) => {
                const material = borehole.materials?.[index];
                if (geom && material) {
                    groups.borehole.push({
                        geometry: geom,
                        material: material
                    });
                }
            });
        });

        // 收集陷落柱几何及材质
        this._collapsePillars?.forEach(pillar => {
            if (pillar.geometry && pillar.material) {
                groups.collapse.push({
                    geometry: pillar.geometry,
                    material: pillar.material
                });
            }
        });

        // 收集剖切线几何及材质
        this._sectionLines?.forEach(section => {
            section.geometries?.forEach((geom, index) => {
                const material = section.materials?.[index];
                if (geom && material) {
                    groups.section.push({
                        geometry: geom,
                        material: material
                    });
                }
            });
        });

        return groups;
    }

    public caclBBox() {
        if (this._vertices) {
            const positions = this._vertices;
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

            // 遍历顶点数组，步长为3（x,y,z坐标连续存储）
            for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i];
                const y = positions[i + 1];
                const z = positions[i + 2];

                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                minZ = Math.min(minZ, z);

                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                maxZ = Math.max(maxZ, z);
            }

            this._bbox = [
                [minX, minY, minZ],
                [maxX, maxY, maxZ]
            ];

            // 同时计算ECEF坐标系的包围盒
            if (this._bbox) {
                this._bboxEcef = toTileWorldBBox(this._header!, this._bbox);
            }
        }
    }

    public dispose() {
        // 释放BVH相关资源
        if (this._stratumBVH) {
            this._stratumBVH = undefined;
        }

        // 释放几何数据
        this._vertices = undefined;
        this._texCoords = undefined;
        this._normals = undefined;
        this._indices = undefined;
        this._faceTypes = undefined;

        // 递归释放子对象
        this._stratumLayers?.forEach(layer => layer.voxels.forEach(v => v.dispose?.()));
        this._collapsePillars?.forEach(pillar => pillar.dispose?.());
        this._faultProfiles?.forEach(fault => fault.dispose?.());
        this._boreholes?.forEach(borehole => borehole.dispose?.());
        this._sectionLines?.forEach(section => section.dispose?.());

        // 清空所有引用
        this._stratumLayers = undefined;
        this._collapsePillars = undefined;
        this._faultProfiles = undefined;
        this._boreholes = undefined;
        this._sectionLines = undefined;
        this._colorMap = undefined;
    }

    public rayIntersect(
        dir: Vector,  // 改为Vector类型
        origin: Vector,  // 改为Vector类型
        callback: (obj: StratumVoxel | CollapsePillar) => boolean
    ): boolean {
        if (!this._stratumBVH?.root) return false;
        // 将Vector转换为Float32Array
        return this._stratumBVH.intersectsRay(
            new Float32Array([dir.x, dir.y, dir.z]),
            new Float32Array([origin.x, origin.y, origin.z]),
            callback
        );
    }

    public boxIntersect(
        box: THREE.Box3,  // 改为BoundingBox类型
        callback: (obj: StratumVoxel | CollapsePillar) => boolean
    ): boolean {
        if (!this._stratumBVH?.root) return false;
        // 展开BoundingBox到FloatArray
        const floatBox = new Float32Array([
            box[0][0], box[0][1], box[0][2],
            box[1][0], box[1][1], box[1][2]
        ]);
        return this._stratumBVH.intersectsBox(floatBox, callback);
    }

    public closestPointQuery(
        point: Vector,  // 改为Vector类型
        callback?: (obj: StratumVoxel | CollapsePillar) => number
    ): number | undefined {
        if (!this._stratumBVH) return;
        // 转换点坐标
        return this._stratumBVH.closestPointToPoint(
            new Float32Array([point.x, point.y, point.z]),
            callback ? (obj) => callback(obj) : undefined
        );
    }

    // frustumCulling保持使用FloatArray类型参数
    public frustumCulling(
        projectionMatrix: Matrix,
        callback: (node: BVHNode<{}, StratumVoxel | CollapsePillar>) => void
    ) {
        if (!this._stratumBVH) return;

        // 将二维矩阵转换为一维Float32Array（列优先顺序）
        const matrixArray = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                matrixArray[i * 4 + j] = projectionMatrix[j][i];
            }
        }

        this._stratumBVH.frustumCulling(matrixArray, callback);
    }

    init(res?: DecodeResult) {
        if (!res) return;

        this._header = res.header;
        this._indices = res.triangleIndices;
        this._faceTypes = res.faceTypes;

        if (res.vertexData) {
            this.initVertexData(res);
        }

        if (res.extensions) {
            this.initExtensions(res);
        }

        if (res) {
            this.setupBVH(); // 添加这行
        }
    }

    private setupBVH() {
        // 添加类型断言解决类型不匹配问题
        const allObjects = [
            ...(this._stratumLayers?.flatMap(l => l.voxels) || []),
            ...(this._collapsePillars || [])
        ] as BVHObject[];

        // 添加几何体包围盒计算函数
        const getGeometryBBox = (geometry: THREE.BufferGeometry): THREE.Box3 => {
            const pos = geometry.attributes.POSITION.value;
            const min: [number, number, number] = [Infinity, Infinity, Infinity];
            const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

            for (let i = 0; i < pos.length; i += 3) {
                min[0] = Math.min(min[0], pos[i]);
                min[1] = Math.min(min[1], pos[i + 1]);
                min[2] = Math.min(min[2], pos[i + 2]);
                max[0] = Math.max(max[0], pos[i]);
                max[1] = Math.max(max[1], pos[i + 1]);
                max[2] = Math.max(max[2], pos[i + 2]);
            }
            return [min, max];
        };

        // 生成包围盒数组时添加类型保护
        const boxes = allObjects.map(obj => {
            const bbox = obj.bbox ? obj.bbox : getGeometryBBox(obj.geometry);

            return new Float32Array([
                bbox[0][0], bbox[0][1], bbox[0][2],
                bbox[1][0], bbox[1][1], bbox[1][2]
            ]);
        });

        // 创建并初始化BVH
        const builder = new HybridBuilder<{}, CollapsePillar | StratumVoxel>();
        builder.createFromArray(
            allObjects,
            boxes,
            (node: BVHNode<{}, CollapsePillar | StratumVoxel>) => {
            },
            0.01 // 包围盒margin
        );

        this._stratumBVH = new BVH<{}, CollapsePillar | StratumVoxel>(builder);
    }

    private initVertexData(res: DecodeResult) {
        if (!res.vertexData) return;
        const { minHeight = 0, maxHeight = 0 } = this._header ?? {};
        const [minX, minY] = this._bbox?.[0] ?? [0, 0];
        const [maxX, maxY] = this._bbox?.[1] ?? [0, 0];

        const xScale = maxX - minX;
        const yScale = maxY - minY;
        const zScale = maxHeight - minHeight;
        const nCoords = res.vertexData.u.length;

        // 批量处理顶点坐标
        const positions = new Float32Array(nCoords * 3);
        const uArr = res.vertexData.u;
        const vArr = res.vertexData.v;
        const hArr = res.vertexData.h;

        for (let i = 0; i < nCoords; i++) {
            const offset = i * 3;
            positions[offset] = (uArr[i] / 32767) * xScale + minX;
            positions[offset + 1] = (vArr[i] / 32767) * yScale + minY;
            positions[offset + 2] = (hArr[i] / 32767) * zScale + minHeight;
        }

        // 处理纹理坐标
        const texCoords = new Float32Array(nCoords * 2);
        for (let i = 0; i < nCoords; i++) {
            const offset = i * 2;
            texCoords[offset] = uArr[i] / 32767;
            texCoords[offset + 1] = vArr[i] / 32767;
        }

        // 直接引用法线数据（假设已经是Float32Array）
        const normals = res.vertexData.normals instanceof Float32Array
            ? res.vertexData.normals
            : new Float32Array(res.vertexData.normals);

        this._vertices = positions;
        this._texCoords = texCoords;
        this._normals = normals;
        this.caclBBox();
    }

    private initExtensions(res: DecodeResult) {
        const ext = res.extensions!;

        if (ext.colorMap) {
            this._colorMap = new ColorMap(ext.colorMap);
        }

        this._faultProfiles = this.initFaultProfiles(ext, res);
        this._boreholes = this.initBoreholes(ext, res);
        this._stratumLayers = this.initStratumLayers(ext, res);
        this._collapsePillars = this.initCollapsePillars(ext, res);
        this._sectionLines = this.initSectionLines(ext, res);
    }

    private initFaultProfiles(ext: NonNullable<DecodeResult["extensions"]>, res: DecodeResult) {
        return ext.faultProfiles?.map(fp => {
            const layer = this.findStratumLayer(res, fp.id, LayerType.Fault);
            if (!layer?.voxels?.length) return new FaultProfile(fp);

            const geometry = this.buildMeshGeometry(layer.voxels[0])?.geometry
            const material = this.buildMeshMaterial('fault', fp.id);
            return new FaultProfile(fp, geometry, material);
        }) ?? [];
    }

    private initBoreholes(ext: NonNullable<DecodeResult["extensions"]>, res: DecodeResult) {
        return ext.boreholes?.map(bh => {
            const layer = this.findStratumLayer(res, bh.id, LayerType.Borehole);
            if (!layer?.voxels?.length) return new Borehole(bh);

            const geometries = layer.voxels.map(voxel =>
                this.buildMeshGeometry(voxel)?.geometry as THREE.BufferGeometry
            );

            const materials: THREE.Material[] = [];
            bh.stratums?.forEach(stratum => {
                materials.push(this.buildMeshMaterial('stratum', stratum.id, stratum.lithology));
            });

            return new Borehole(bh, geometries, materials);
        }) ?? [];
    }

    private initStratumLayers(ext: NonNullable<DecodeResult["extensions"]>, res: DecodeResult) {
        return ext.stratumLayers?.map(sl => {
            const layer = this.findStratumLayer(res, sl.id, LayerType.Voxel);

            let lithology = '';
            if (res.extensions?.stratumLithology) {
                lithology = res.extensions?.stratumLithology[layer!.id];
            }

            const items = layer!.voxels.map(voxel => {
                const geomData = this.buildMeshGeometry(voxel);
                return {
                    id: voxel.id,
                    index: voxel.index,
                    start: voxel.start,
                    end: voxel.end,
                    bbox: voxel.bbox,
                    neighbors: voxel.neighbors,
                    geometry: geomData?.geometry,
                };
            });
            return new StratumLayer(sl, items, lithology, this.buildMeshMaterial('stratum', layer?.id, lithology));
        }) ?? [];
    }

    private initCollapsePillars(ext: NonNullable<DecodeResult["extensions"]>, res: DecodeResult) {
        return ext.collapsePillars?.map(cp => {
            const layer = this.findStratumLayer(res, cp.id, LayerType.Collapse);
            if (!layer?.voxels?.length) return new CollapsePillar(cp);

            const voxel = layer.voxels[0];
            const geomData = this.buildMeshGeometry(voxel);
            const material = this.buildMeshMaterial('collapse', cp.id, cp.lithology);
            return new CollapsePillar(cp, voxel.bbox, geomData?.geometry, material);
        }) ?? [];
    }

    private initSectionLines(ext: NonNullable<DecodeResult["extensions"]>, res: DecodeResult) {
        return ext.sectionLines?.map(sl => {
            const layer = this.findStratumLayer(res, sl.id, LayerType.Section);
            if (!layer?.voxels?.length) return new SectionLine(sl);

            const bbox: THREE.Box3 = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
            const geometries: THREE.BufferGeometry[] = [];
            const materials: THREE.Material[] = [];

            layer.voxels.forEach(voxel => {
                const geomData = this.buildMeshGeometry(voxel);
                if (!geomData?.geometry || !geomData.bbox) return;

                // 合并包围盒
                const [min, max] = geomData.bbox;
                bbox[0][0] = Math.min(bbox[0][0], min[0]);
                bbox[0][1] = Math.min(bbox[0][1], min[1]);
                bbox[0][2] = Math.min(bbox[0][2], min[2]);
                bbox[1][0] = Math.max(bbox[1][0], max[0]);
                bbox[1][1] = Math.max(bbox[1][1], max[1]);
                bbox[1][2] = Math.max(bbox[1][2], max[2]);

                geometries.push(geomData.geometry);

                let lithology = '';
                if (res.extensions?.stratumLithology) {
                    lithology = res.extensions?.stratumLithology[voxel.id];
                }

                const material = this.buildMeshMaterial('section', undefined, lithology);
                materials.push(material);
            });

            return new SectionLine(sl, bbox, geometries, materials);
        }) ?? [];
    }

    private findStratumLayer(res: DecodeResult, id: string, type?: LayerType) {
        return res.layers?.find(layer =>
            layer.id === id && (!type || layer.type === type)
        );
    }

    private buildMeshMaterial(
        layerType: 'stratum' | 'borehole' | 'section' | 'fault' | 'collapse',
        id?: string,
        lithology?: string
    ): THREE.Material {
        switch (layerType) {
            case 'fault': {
                const faultColor = this._colorMap?.getFaultColor(id || 'default') || { r: 255, g: 0, b: 0, a: 255 };
                return new THREE.MeshPhongMaterial({
                    color: new THREE.Color(faultColor.r / 255, faultColor.g / 255, faultColor.b / 255),
                    transparent: faultColor.a < 1.0,
                    opacity: faultColor.a / 255,
                    shininess: 100  // 增加高光效果
                });
            }

            case 'collapse': {
                const collapseColor = this._colorMap?.getCollapseColor(id || 'default') || { r: 128, g: 0, b: 128, a: 255 };
                const texture = this._colorMap?.getStratumTexture(lithology || 'default');
                return new THREE.MeshPhongMaterial({
                    color: new THREE.Color(collapseColor.r / 255, collapseColor.g / 255, collapseColor.b / 255),
                    transparent: true,  // 强制半透明
                    opacity: collapseColor.a / 255,
                    map: texture,
                    side: THREE.DoubleSide
                });
            }

            default: { // stratum
                const stratumColor = this._colorMap?.getStratumColor(lithology || id || 'default') || { r: 200, g: 200, b: 200, a: 255 };
                const texture = this._colorMap?.getStratumTexture(lithology || id || 'default');
                return new THREE.MeshPhongMaterial({
                    color: new THREE.Color(stratumColor.r / 255, stratumColor.g / 255, stratumColor.b / 255),
                    transparent: stratumColor.a < 1.0,
                    opacity: stratumColor.a / 255,
                    map: texture,
                    side: THREE.DoubleSide
                });
            }
        }
    }


    private buildMeshGeometry(geom: {
        start: number;
        end: number;
        bbox: THREE.Box3;
    }): { bbox: THREE.Box3, geometry?: THREE.BufferGeometry } | null {
        if (!this._indices || !this._vertices) return null;

        const subIndices = this._indices.subarray(geom.start, geom.end + 1);
        if (subIndices.length === 0) return null;

        // 创建Three.js原生几何体
        const geometry = new THREE.BufferGeometry();

        // 设置顶点属性
        geometry.setAttribute('position', new THREE.BufferAttribute(this._vertices, 3));

        // 设置索引（需要转换为Uint32Array）
        const indices = new Uint32Array(subIndices);
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        return {
            bbox: geom.bbox,
            geometry
        };
    }

    generateCrossSections(cutLines: Vector[][]): { stratumProfiles: StratumProfile[], collapseProfiles: CollapseProfile[] } {
        const collapseProfiles: CollapseProfile[] = [];
        const stratumProfiles: StratumProfile[] = [];

        // 处理陷落柱剖面
        this._collapsePillars?.forEach(collapse => {
            const profile: CollapseProfile = {
                collapseID: collapse.id,
                crossSections: [],
                polys: []
            };

            cutLines.forEach(line => {
                // 调用陷落柱的剖面生成方法
                const result = collapse.generateCrossSections([line[0], line[1]]);
                if (!result) return;

                // 转换三角剖分结果为网格几何体
                const geometry: THREE.BufferGeometry = {
                    indices: {
                        value: new Uint32Array(result.indices.flat()),
                        size: 1
                    },
                    attributes: {
                        POSITION: {
                            value: new Float32Array(
                                result.positions.flatMap(p => [p.x, p.y, p.z])
                            ),
                            size: 3
                        }
                    }
                };

                // 收集结果
                profile.crossSections.push(geometry);
                profile.polys.push(result.positions); // 直接使用有序顶点数组
            });

            if (profile.crossSections.length > 0) {
                collapseProfiles.push(profile);
            }
        });


        cutLines.forEach((line) => {
            // 新增线段方向计算
            const lineStart = line[0];
            const lineEnd = line[1];

            // 计算线段方向向量
            let lineDir = minus(lineEnd, lineStart);
            const lineLength = lengthV(lineDir);

            // 处理退化线段情况
            if (lineLength < 1e-6) {
                lineDir = { x: 1, y: 0, z: 0 }; // 默认X轴方向
            } else {
                lineDir = normalize(lineDir);

                // 确保方向一致性（X轴正方向）
                if (lineDir.x < 0) {
                    lineDir = times(lineDir, -1);
                }
            }

            // 遍历所有地层
            this._stratumLayers?.forEach(layer => {
                let stratumProfile = {
                    top: [],
                    base: [],
                    crossSections: [],
                    polys: [],
                    stratumID: layer.id,
                } as StratumProfile

                layer.voxels.forEach(voxel => {
                    // 获取顶部三角形数据
                    const topTris = voxel.getTopTriangles();
                    const topPoints = this.processTriangles(topTris, line);
                    const sortedTopPoints = this.sortPointsAlongLine(topPoints, line);

                    // 获取底部三角形数据
                    const baseTris = voxel.getBaseTriangles();
                    const basePoints = this.processTriangles(baseTris, line);
                    const sortedBasePoints = this.sortPointsAlongLine(basePoints, line);

                    if (sortedTopPoints.length < 2 || sortedBasePoints.length < 2) {
                        return;
                    }

                    // 添加剖面生成调用
                    const { meshes, polys } = this.generateStratumMesh(
                        sortedTopPoints,
                        sortedBasePoints,
                        lineDir,
                        collapseProfiles
                    );

                    stratumProfile.top.push(...topPoints);
                    stratumProfile.base.push(...basePoints);
                    stratumProfile.crossSections.push(...meshes);
                    stratumProfile.polys.push(...polys);
                });

                stratumProfiles.push(stratumProfile)
            });

        })


        return { stratumProfiles, collapseProfiles };
    }

    private processTriangles(triangles: Float32Array, line: Vector[]): Vector[] {
        // 将三角形数据转换为Vector数组
        const triVectors: Vector[][] = [];
        for (let i = 0; i < triangles.length; i += 9) {
            const tri = [
                { x: triangles[i], y: triangles[i + 1], z: triangles[i + 2] },
                { x: triangles[i + 3], y: triangles[i + 4], z: triangles[i + 5] },
                { x: triangles[i + 6], y: triangles[i + 7], z: triangles[i + 8] }
            ];
            triVectors.push(tri);
        }

        // 处理每条剖切线
        const lineStart = line[0];
        const lineEnd = line[1];
        const result: Vector[] = [];
        triVectors.forEach(tri => {
            // 线段与三角形相交检测
            const intersects = this.lineTriangleIntersection(lineStart, lineEnd, tri);
            if (intersects.length > 0) {
                result.push(...intersects);
            }
        });
        return result
    }


    private sortPointsAlongLine(points: Vector[], line: Vector[]): Vector[] {
        type ParamPoint = { totalDist: number; point: Vector };
        const paramPoints: ParamPoint[] = [];

        // 构建剖切线参数化长度
        const segDists: number[] = [0];
        for (let i = 1; i < line.length; i++) {
            const segLen = lengthV(minus(line[i], line[i - 1]));
            segDists.push(segDists[i - 1] + segLen);
        }

        // 计算每个点的投影参数
        for (const pt of points) {
            let minDist = Infinity;
            let bestSegmentIndex = 0;
            let bestParam = 0;
            let accumDist = 0;

            // 寻找最近线段
            for (let i = 1; i < line.length; i++) {
                const segStart = line[i - 1];
                const segEnd = line[i];
                const [proj, t] = this.projectPointToSegment(pt, segStart, segEnd);

                const d = lengthV(minus(pt, proj));
                if (d < minDist) {
                    minDist = d;
                    bestSegmentIndex = i - 1;
                    bestParam = t;
                    const segLen = segDists[i] - segDists[i - 1];
                    accumDist = segDists[bestSegmentIndex] + bestParam * segLen;
                }
            }

            if (minDist < Infinity) {
                paramPoints.push({ totalDist: accumDist, point: pt });
            }
        }

        // 按累计距离排序
        paramPoints.sort((a, b) => a.totalDist - b.totalDist);

        // 提取排序后的点
        return paramPoints.map(pp => pp.point);
    }

    private projectPointToSegment(pt: Vector, a: Vector, b: Vector): [Vector, number] {
        const ab = minus(b, a);
        const ap = minus(pt, a);
        const abSqrLen = dot(ab, ab);

        // 处理零长度线段
        if (abSqrLen < 1e-16) return [a, 0];

        const t = Math.max(0, Math.min(1, dot(ap, ab) / abSqrLen));
        const scaledAB = { x: ab.x * t, y: ab.y * t, z: ab.z * t };
        return [plus(a, scaledAB), t];
    }


    private lineTriangleIntersection(a: Vector, b: Vector, triangle: Vector[]): Vector[] {
        // 实现Möller–Trumbore射线三角形相交算法
        const epsilon = 1e-6;

        // 计算三角形边向量
        const edge1 = minus(triangle[1], triangle[0]);
        const edge2 = minus(triangle[2], triangle[0]);

        // 计算射线方向向量
        const rayDir = minus(b, a);

        // 计算行列式
        const h = cross(rayDir, edge2);
        const det = dot(edge1, h);

        // 处理接近平行的情况（避免除零）
        if (Math.abs(det) < epsilon) return [];

        const invDet = 1.0 / det;
        const s = minus(a, triangle[0]);

        // 计算u参数并验证范围
        const u = invDet * dot(s, h);
        if (u < 0.0 || u > 1.0) return [];

        // 计算q向量和v参数
        const q = cross(s, edge1);
        const v = invDet * dot(rayDir, q);
        if (v < 0.0 || u + v > 1.0) return [];

        // 计算t参数
        const t = invDet * dot(edge2, q);

        // 验证t在射线段范围内 [0, 1]
        if (t > epsilon && t < 1.0 + epsilon) {
            // 使用lerp函数计算交点
            return [lerp(a, b, t)];
        }

        return [];
    }


    // 新增地质剖面生成核心方法
    generateStratumMesh(top: Vector[], base: Vector[], lineDir: Vector, collapseProfiles: CollapseProfile[]): { meshes: THREE.BufferGeometry[], polys: Vector[][] } {
        const meshes: THREE.BufferGeometry[] = [];
        const polys: Vector[][] = [];

        if (top.length < 2) return { meshes, polys };

        // 分割连续地质段（处理尖灭现象）
        const segments = this.splitContinuousSegments(top, base);

        for (const seg of segments) {
            if (seg.top.length < 2) continue;

            // 构建地层多边形（顶板+逆序底板）
            const polygon = [...seg.top, ...[...seg.base].reverse()];

            // 执行三角剖分
            const subMesh = this.buildTriangulateMesh(polygon);
            if (subMesh) {
                meshes.push(subMesh);
                polys.push(polygon);
            }
        }

        // 陷落柱切割处理
        const finalMeshes: THREE.BufferGeometry[] = [];
        for (let i = 0; i < meshes.length; i++) {
            const matrix = this.calculateProjectionMatrix(polys[i], lineDir);

            const relevantCollapses = this.queryRelevantCollapses(polys[i], collapseProfiles);
            if (relevantCollapses.length === 0) {
                finalMeshes.push(meshes[i]);
                continue;
            }

            // 遍历所有陷落柱剖面
            relevantCollapses.forEach(collapse => {
                for (const collapsePoly of collapse.polys) {
                    const newMeshes = this.cutProfiles(polys[i], collapsePoly, matrix!);
                    finalMeshes.push(...newMeshes);
                }
            });

            const { attributes } = meshes[i];
            const vertices = attributes.POSITION?.value;

            // 保留原始未切割部分
            if (vertices.length > 2) {
                finalMeshes.push(meshes[i]);
            }
        }

        return { meshes: finalMeshes, polys };
    }

    // 空间查询方法
    private queryRelevantCollapses(poly: Vector[], allCollapses: CollapseProfile[]): CollapseProfile[] {
        const polyBounds = this.calculate3DBounds(poly);
        return allCollapses.filter(collapse =>
            collapse.polys.some(cp =>
                this.boundsIntersect(polyBounds, this.calculate3DBounds(cp))
            )
        );
    }

    // 三维包围盒计算
    private calculate3DBounds(poly: Vector[]): THREE.Box3 {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        poly.forEach(v => {
            min[0] = Math.min(min[0], v.x);
            min[1] = Math.min(min[1], v.y);
            min[2] = Math.min(min[2], v.z);
            max[0] = Math.max(max[0], v.x);
            max[1] = Math.max(max[1], v.y);
            max[2] = Math.max(max[2], v.z);
        });

        return [min as [number, number, number], max as [number, number, number]];
    }

    // 连续地质段分割（检测尖灭点）
    private splitContinuousSegments(top: Vector[], base: Vector[]): Array<{ top: Vector[], base: Vector[] }> {
        const segments: Array<{ top: Vector[], base: Vector[] }> = [];
        const thicknessThreshold = 1e-5;
        let start = 0;
        let prevIsPinch = false;

        for (let i = 1; i < top.length; i++) {
            const thickness = lengthV(minus(top[i], base[i]));

            // 检测尖灭点或终点
            if (thickness < thicknessThreshold || i === top.length - 1) {
                if (i - start >= 1 && !prevIsPinch) {
                    segments.push({
                        top: top.slice(start, i + 1),
                        base: base.slice(start, i + 1)
                    });
                    start = i;
                    prevIsPinch = true;
                } else {
                    start = i;
                }
                continue;
            }
            prevIsPinch = false;
        }

        return segments;
    }

    // 新增投影矩阵计算
    private calculateProjectionMatrix(poly: Vector[], xAxis: Vector): ProjectionMatrix | null {
        if (poly.length < 3) return null;

        const origin = poly[0];
        const normal = this.computePolygonNormal(poly);

        const u = normalize(xAxis);
        const v = normalize(cross(normal, u));

        return { origin, xAxis: u, yAxis: v, normal };
    }

    // 多边形法向量计算
    private computePolygonNormal(poly: Vector[]): Vector {
        let normal = { x: 0, y: 0, z: 0 };

        for (let i = 0; i < poly.length; i++) {
            const current = poly[i];
            const next = poly[(i + 1) % poly.length];

            normal.x += (current.y - next.y) * (current.z + next.z);
            normal.y += (current.z - next.z) * (current.x + next.x);
            normal.z += (current.x - next.x) * (current.y + next.y);
        }

        return normalize(normal);
    }

    // 剖面切割核心方法
    private cutProfiles(stratumPoly: Vector[], collapsePoly: Vector[], matrix: ProjectionMatrix): THREE.BufferGeometry[] {
        // 添加顶点顺序校验
        const orientedStratum = this.ensureClockwiseOrder(stratumPoly);
        const orientedCollapse = this.ensureCounterClockwiseOrder(collapsePoly);

        // 三维转二维投影
        const stratum2D = this.projectTo2D(orientedStratum, matrix);
        const collapse2D = this.projectTo2D(orientedCollapse, matrix);

        // 添加快速空检测
        if (!this.polygonsIntersect(stratum2D, collapse2D)) {
            return [this.buildTriangulateMesh(stratumPoly)];
        }

        // 执行二维多边形裁剪（示例实现）
        const clipped = this.weilerAthertonClip(stratum2D, collapse2D);

        // 转换回三维并生成网格
        return clipped.map(poly =>
            this.buildTriangulateMesh(this.projectTo3D(poly, matrix))
        ).filter(Boolean);
    }

    // 新增多边形方向校验方法
    private ensureClockwiseOrder(poly: Vector[]): Vector[] {
        const area = this.calculatePolygonArea(poly);
        return area > 0 ? poly.reverse() : poly;
    }

    private ensureCounterClockwiseOrder(poly: Vector[]): Vector[] {
        const area = this.calculatePolygonArea(poly);
        return area < 0 ? poly.reverse() : poly;
    }

    // 计算多边形面积（带符号）
    private calculatePolygonArea(poly: Vector[]): number {
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
            const current = poly[i];
            const next = poly[(i + 1) % poly.length];
            area += (next.x - current.x) * (next.y + current.y);
        }
        return area;
    }

    // 快速相交检测
    private polygonsIntersect(a: Vector2D[], b: Vector2D[]): boolean {
        const aBounds = this.calculateBounds(a);
        const bBounds = this.calculateBounds(b);

        // 包围盒快速排除
        if (aBounds.maxX < bBounds.minX || aBounds.minX > bBounds.maxX ||
            aBounds.maxY < bBounds.minY || aBounds.minY > bBounds.maxY) {
            return false;
        }

        // 精确相交检测（简化版）
        return a.some(p => this.pointInPolygon(p, b)) ||
            b.some(p => this.pointInPolygon(p, a));
    }

    // 三维到二维投影（保留核心实现）
    private projectTo2D(poly: Vector[], matrix: ProjectionMatrix): Vector2D[] {
        return poly.map(p => {
            const rel = minus(p, matrix.origin);
            return {
                x: dot(rel, matrix.xAxis),
                y: dot(rel, matrix.yAxis)
            };
        });
    }

    // 二维到三维逆投影
    private projectTo3D(points: Vector2D[], matrix: ProjectionMatrix): Vector[] {
        return points.map(p =>
            plus(
                matrix.origin,
                plus(
                    times(matrix.xAxis, p.x),
                    times(matrix.yAxis, p.y)
                )
            )
        );
    }

    // 二维包围盒计算
    private calculateBounds(points: Vector2D[]): { minX: number, minY: number, maxX: number, maxY: number } {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });

        return { minX, minY, maxX, maxY };
    }

    // 三维包围盒相交检测
    private boundsIntersect(a: THREE.Box3, b: THREE.Box3): boolean {
        // 三维AABB相交检测
        return (a[0][0] <= b[1][0] && a[1][0] >= b[0][0]) && // X轴
            (a[0][1] <= b[1][1] && a[1][1] >= b[0][1]) && // Y轴
            (a[0][2] <= b[1][2] && a[1][2] >= b[0][2]);   // Z轴
    }

    // 射线法判断点是否在多边形内
    private pointInPolygon(point: Vector2D, polygon: Vector2D[]): boolean {
        const epsilon = 1e-10;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i++) {
            const pi = polygon[i];
            const pj = polygon[j];

            // 排除在顶点上的情况
            if (Math.abs(pi.x - point.x) < epsilon &&
                Math.abs(pi.y - point.y) < epsilon) return true;

            // 检测线段与水平射线的交点
            const intersect = ((pi.y > point.y) !== (pj.y > point.y)) &&
                (point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y) + pi.x);

            if (intersect) inside = !inside;
        }

        return inside;
    }

    private buildTriangulateMesh(polygon: Vector[]): THREE.BufferGeometry {
        // 调用三角剖分算法
        const { positions, indices } = triangulate(polygon);

        // 转换顶点数据为FlatArray格式
        const vertices = new Float32Array(positions.flatMap(p => [p.x, p.y, p.z]));
        const triangleIndices = new Uint32Array(indices.flat());

        return {
            indices: {
                value: triangleIndices,
                size: 1
            },
            attributes: {
                POSITION: {
                    value: vertices,
                    size: 3
                },
                // 可选的纹理坐标和法线（根据实际需求添加）
                TEXCOORD_0: {
                    value: new Float32Array(positions.length * 2),
                    size: 2
                },
                NORMAL: {
                    value: new Float32Array(positions.length * 3),
                    size: 3
                }
            }
        };
    }

    // 二维多边形裁剪（示例实现）
    private weilerAthertonClip(subjectPolygon: Vector2D[], clipPolygon: Vector2D[]): Vector2D[][] {
        // 将Vector2D数组转换为FlatArray格式（修复参数结构）
        const subject = FlatArray.create({
            array: subjectPolygon.map(v => [v.x, v.y]).flat(), // 展平二维数组
            itemSize: 2 // 明确指定每个顶点的坐标数
        });
        const clip = FlatArray.create({
            array: clipPolygon.map(v => [v.x, v.y]).flat(),
            itemSize: 2
        });
        // 调用核心算法实现
        const resultPolygons = weilerAthertonClip(subject, clip);

        // 将结果转换回Vector2D数组
        return resultPolygons.map(poly => {
            return poly.array.reduce((acc: Vector2D[], _, i) => {
                if (i % poly.itemSize === 0) {
                    acc.push({
                        x: poly.array[i],
                        y: poly.array[i + 1]
                    });
                }
                return acc;
            }, []);
        });
    }
}

export { StratumTile };