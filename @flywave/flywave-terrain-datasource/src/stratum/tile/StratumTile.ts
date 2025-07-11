import {
    BVH,
    BVHNode,
    HybridBuilder,
    triangulate,
    weilerAthertonClip
} from "@flywave/flywave-geometry";
import { GeoBox, Projection, TileKey } from "@flywave/flywave-geoutils";
import { FlatArray } from "@flywave/flywave-utils";
import * as THREE from "three";

import { DecodeResult, Header, LayerType } from "../decoder";
import { Borehole } from "./Borehole";
import { CollapsePillar, CollapseProfile } from "./Collapse";
import { ColorMap } from "./ColorMap";
import { FaultProfile } from "./Fault";
import { toTileLocalLines, toTileWorld, toTileWorldBBox } from "./Project";
import { SectionLine } from "./Section";
import { StratumLayer } from "./Stratum";
import { StratumVoxel } from "./Voxel";

export type BVHObject = CollapsePillar | StratumVoxel;

// 新增类型定义
interface ProjectionMatrix {
    origin: THREE.Vector3;
    xAxis: THREE.Vector3;
    yAxis: THREE.Vector3;
    normal: THREE.Vector3;
}

// 地层剖面结构
export interface StratumProfile {
    stratumID: string; // 地层唯一标识
    top: THREE.Vector3[]; // 顶板交线点序列（沿剖切线有序排列）
    base: THREE.Vector3[]; // 底板交线点序列
    crossSections: THREE.BufferGeometry[]; // 三角剖分后的TIN网格集合
    polys: THREE.Vector3[][]; // 原始剖面多边形顶点序列
}

class StratumTile {
    private readonly _id?: TileKey;
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
    private readonly _materialCache = new Map<string, THREE.Material>();
    private readonly _project?: Projection;

    constructor(id?: TileKey, res?: DecodeResult, project?: Projection) {
        this._id = id;
        this.init(res);
        this._project = project;
    }

    get id() {
        return this._id;
    }

    get header() {
        return this._header;
    }

    get bbox() {
        return this._bbox;
    }

    get colorMap() {
        return this._colorMap;
    }

    get faultProfiles() {
        return this._faultProfiles;
    }

    get boreholes() {
        return this._boreholes;
    }

    get stratumLayers() {
        return this._stratumLayers;
    }

    get collapsePillars() {
        return this._collapsePillars;
    }

    get sectionLines() {
        return this._sectionLines;
    }

    // 在get geometries方法后添加BVH相关方法
    get stratumBVH(): BVH<{}, CollapsePillar | StratumVoxel> | undefined {
        return this._stratumBVH;
    }

    get geometries(): Record<
        string,
        Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }>
    > {
        const groups = {
            stratum: [],
            fault: [],
            borehole: [],
            collapse: [],
            section: []
        } as Record<string, Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }>>;

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
            const box = new THREE.Box3();
            const positions = this._vertices;

            for (let i = 0; i < positions.length; i += 3) {
                box.expandByPoint(
                    new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2])
                );
            }

            this._bbox = box;
            if (box) {
                this._bboxEcef = toTileWorldBBox(this._header!, box);
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
        dir: THREE.Vector3, // 改为THREE.Vector3类型
        origin: THREE.Vector3, // 改为THREE.Vector3类型
        callback: (obj: StratumVoxel | CollapsePillar) => boolean
    ): boolean {
        if (!this._stratumBVH?.root) return false;
        // 将THREE.Vector3转换为Float32Array
        return this._stratumBVH.intersectsRay(
            new Float32Array([dir.x, dir.y, dir.z]),
            new Float32Array([origin.x, origin.y, origin.z]),
            callback
        );
    }

    public boxIntersect(
        box: THREE.Box3, // 改为BoundingBox类型
        callback: (obj: StratumVoxel | CollapsePillar) => boolean
    ): boolean {
        if (!this._stratumBVH?.root) return false;
        // 展开BoundingBox到FloatArray
        const floatBox = new Float32Array([
            box[0][0],
            box[0][1],
            box[0][2],
            box[1][0],
            box[1][1],
            box[1][2]
        ]);
        return this._stratumBVH.intersectsBox(floatBox, callback);
    }

    public closestPointQuery(
        point: THREE.Vector3, // 改为THREE.Vector3类型
        callback?: (obj: StratumVoxel | CollapsePillar) => number
    ): number | undefined {
        if (!this._stratumBVH) return;
        // 转换点坐标
        return this._stratumBVH.closestPointToPoint(
            new Float32Array([point.x, point.y, point.z]),
            callback ? obj => callback(obj) : undefined
        );
    }

    // frustumCulling保持使用FloatArray类型参数
    public frustumCulling(
        projectionMatrix: THREE.Matrix4,
        callback: (node: BVHNode<{}, StratumVoxel | CollapsePillar>) => void
    ) {
        if (!this._stratumBVH) return;

        const matrixArray = new Float32Array(16);
        projectionMatrix.toArray(matrixArray);
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
            const pos = geometry.getAttribute("position").array;
            const box = new THREE.Box3();

            for (let i = 0; i < pos.length; i += 3) {
                box.expandByPoint(new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]));
            }
            return box;
        };

        const boxes = allObjects.map(obj => {
            const bbox = obj.bbox ? obj.bbox : getGeometryBBox(obj.geometry);
            return new Float32Array([
                bbox.min.x,
                bbox.min.y,
                bbox.min.z,
                bbox.max.x,
                bbox.max.y,
                bbox.max.z
            ]);
        });

        const builder = new HybridBuilder<{}, CollapsePillar | StratumVoxel>();
        builder.createFromArray(
            allObjects,
            boxes,
            (node: BVHNode<{}, CollapsePillar | StratumVoxel>) => {},
            0.01
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
        const normals =
            res.vertexData.normals instanceof Float32Array
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
        return (
            ext.faultProfiles?.map(fp => {
                const layer = this.findStratumLayer(res, fp.id, LayerType.Fault);
                if (!layer?.voxels?.length) return new FaultProfile(fp);

                const geometry = this.buildMeshGeometry(layer.voxels[0])?.geometry;
                const material = this.buildMeshMaterial("fault", fp.id);
                return new FaultProfile(fp, geometry, material);
            }) ?? []
        );
    }

    private initBoreholes(ext: NonNullable<DecodeResult["extensions"]>, res: DecodeResult) {
        return (
            ext.boreholes?.map(bh => {
                const layer = this.findStratumLayer(res, bh.id, LayerType.Borehole);
                if (!layer?.voxels?.length) return new Borehole(bh);

                const geometries = layer.voxels.map(
                    voxel => this.buildMeshGeometry(voxel)?.geometry as THREE.BufferGeometry
                );

                const materials: THREE.Material[] = [];
                bh.stratums?.forEach(stratum => {
                    materials.push(
                        this.buildMeshMaterial("stratum", stratum.id, stratum.lithology)
                    );
                });

                return new Borehole(bh, geometries, materials);
            }) ?? []
        );
    }

    private initStratumLayers(ext: NonNullable<DecodeResult["extensions"]>, res: DecodeResult) {
        return (
            ext.stratumLayers?.map(sl => {
                const layer = this.findStratumLayer(res, sl.id, LayerType.Voxel);

                let lithology = "";
                if (res.extensions?.stratumLithology) {
                    lithology = res.extensions?.stratumLithology[layer!.id];
                }

                const items = layer!.voxels.map(voxel => {
                    const geomData = this.buildMeshGeometry(voxel);
                    const bbox = new THREE.Box3(
                        new THREE.Vector3(voxel.bbox[0][0], voxel.bbox[0][1], voxel.bbox[0][2]),
                        new THREE.Vector3(voxel.bbox[1][0], voxel.bbox[1][1], voxel.bbox[1][2])
                    );
                    return {
                        id: voxel.id,
                        index: voxel.index,
                        start: voxel.start,
                        end: voxel.end,
                        bbox: bbox,
                        neighbors: voxel.neighbors,
                        geometry: geomData?.geometry
                    };
                });
                return new StratumLayer(
                    sl,
                    items,
                    lithology,
                    this.buildMeshMaterial("stratum", layer?.id, lithology)
                );
            }) ?? []
        );
    }

    private initCollapsePillars(ext: NonNullable<DecodeResult["extensions"]>, res: DecodeResult) {
        return (
            ext.collapsePillars?.map(cp => {
                const layer = this.findStratumLayer(res, cp.id, LayerType.Collapse);
                if (!layer?.voxels?.length) return new CollapsePillar(cp);

                const voxel = layer.voxels[0];
                const geomData = this.buildMeshGeometry(voxel);
                const material = this.buildMeshMaterial("collapse", cp.id, cp.lithology);
                const bbox = new THREE.Box3(
                    new THREE.Vector3(voxel.bbox[0][0], voxel.bbox[0][1], voxel.bbox[0][2]),
                    new THREE.Vector3(voxel.bbox[1][0], voxel.bbox[1][1], voxel.bbox[1][2])
                );
                return new CollapsePillar(cp, bbox, geomData?.geometry, material);
            }) ?? []
        );
    }

    private initSectionLines(ext: NonNullable<DecodeResult["extensions"]>, res: DecodeResult) {
        return (
            ext.sectionLines?.map(sl => {
                const layer = this.findStratumLayer(res, sl.id, LayerType.Section);
                if (!layer?.voxels?.length) return new SectionLine(sl);

                const bbox = new THREE.Box3();
                const geometries: THREE.BufferGeometry[] = [];
                const materials: THREE.Material[] = [];

                layer.voxels.forEach(voxel => {
                    const geomData = this.buildMeshGeometry(voxel);
                    if (!geomData?.geometry || !geomData.bbox) return;

                    // 合并包围盒
                    const { min, max } = geomData.bbox;
                    bbox[0][0] = Math.min(bbox[0][0], min[0]);
                    bbox[0][1] = Math.min(bbox[0][1], min[1]);
                    bbox[0][2] = Math.min(bbox[0][2], min[2]);
                    bbox[1][0] = Math.max(bbox[1][0], max[0]);
                    bbox[1][1] = Math.max(bbox[1][1], max[1]);
                    bbox[1][2] = Math.max(bbox[1][2], max[2]);

                    geometries.push(geomData.geometry);

                    let lithology = "";
                    if (res.extensions?.stratumLithology) {
                        lithology = res.extensions?.stratumLithology[voxel.id];
                    }

                    const material = this.buildMeshMaterial("section", undefined, lithology);
                    materials.push(material);
                });

                return new SectionLine(sl, bbox, geometries, materials);
            }) ?? []
        );
    }

    private findStratumLayer(res: DecodeResult, id: string, type?: LayerType) {
        return res.layers?.find(layer => layer.id === id && (!type || layer.type === type));
    }

    private buildMeshMaterial(
        layerType: "stratum" | "borehole" | "section" | "fault" | "collapse",
        id?: string,
        lithology?: string
    ): THREE.Material {
        const cacheKey = `${layerType}_${id || ""}_${lithology || ""}`;

        // 检查缓存
        if (this._materialCache.has(cacheKey)) {
            return this._materialCache.get(cacheKey)!;
        }
        let material: THREE.Material;
        switch (layerType) {
            case "fault": {
                const faultColor = this._colorMap?.getFaultColor(id || "default") || {
                    r: 255,
                    g: 0,
                    b: 0,
                    a: 255
                };
                material = new THREE.MeshPhongMaterial({
                    color: new THREE.Color(
                        faultColor.r / 255,
                        faultColor.g / 255,
                        faultColor.b / 255
                    ),
                    transparent: faultColor.a < 1.0,
                    opacity: faultColor.a / 255,
                    shininess: 100 // 增加高光效果
                });
                break;
            }

            case "collapse": {
                const collapseColor = this._colorMap?.getCollapseColor(id || "default") || {
                    r: 128,
                    g: 0,
                    b: 128,
                    a: 255
                };
                const texture = this._colorMap?.getStratumTexture(lithology || "default");
                material = new THREE.MeshPhongMaterial({
                    color: new THREE.Color(
                        collapseColor.r / 255,
                        collapseColor.g / 255,
                        collapseColor.b / 255
                    ),
                    transparent: true, // 强制半透明
                    opacity: collapseColor.a / 255,
                    map: texture,
                    side: THREE.DoubleSide
                });
                break;
            }

            default: {
                // stratum
                const stratumColor = this._colorMap?.getStratumColor(
                    lithology || id || "default"
                ) || { r: 200, g: 200, b: 200, a: 255 };
                const texture = this._colorMap?.getStratumTexture(lithology || id || "default");
                material = new THREE.MeshPhongMaterial({
                    color: new THREE.Color(
                        stratumColor.r / 255,
                        stratumColor.g / 255,
                        stratumColor.b / 255
                    ),
                    transparent: stratumColor.a < 1.0,
                    opacity: stratumColor.a / 255,
                    map: texture,
                    side: THREE.DoubleSide
                });
                break;
            }
        }

        // 存入缓存
        this._materialCache.set(cacheKey, material);
        return material;
    }

    private buildMeshGeometry(geom: {
        start: number;
        end: number;
        bbox: [[number, number, number], [number, number, number]];
    }): { bbox: THREE.Box3; geometry?: THREE.BufferGeometry } | null {
        if (!this._indices || !this._vertices) return null;

        const subIndices = this._indices.subarray(geom.start, geom.end + 1);
        if (subIndices.length === 0) return null;

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.BufferAttribute(this._vertices, 3));

        if (this._normals) {
            geometry.setAttribute("normal", new THREE.BufferAttribute(this._normals, 3));
        }

        if (this._texCoords) {
            geometry.setAttribute("uv", new THREE.BufferAttribute(this._texCoords, 2));
        }

        if (this._faceTypes) {
            const faceCount = subIndices.length / 3;
            const faceTypes = new Uint32Array(faceCount);
            const typeOffset = geom.start / 3; // 每个面占3个索引
            for (let i = 0; i < faceCount; i++) {
                faceTypes[i] = this._faceTypes[typeOffset + i];
            }
            geometry.setAttribute("facetypes", new THREE.BufferAttribute(faceTypes, 1));
        }

        const indices = new Uint32Array(subIndices);
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        const bbox = new THREE.Box3(
            new THREE.Vector3(geom.bbox[0][0], geom.bbox[0][1], geom.bbox[0][2]),
            new THREE.Vector3(geom.bbox[1][0], geom.bbox[1][1], geom.bbox[1][2])
        );

        return {
            bbox,
            geometry
        };
    }

    public generateCrossSections(
        cutLines: THREE.Vector3[][],
        upDir: THREE.Vector3 // 新增upDir参数
    ): Array<{
        stratumProfiles: StratumProfile[];
        collapseProfiles: CollapseProfile[];
        line: THREE.Vector3[];
    }> {
        const collapseProfiles: CollapseProfile[] = [];
        const stratumProfiles: StratumProfile[] = [];

        const results = [];
        const localLines = toTileLocalLines(this._header, cutLines);
        localLines.forEach((line, lineIndex) => {
            // 处理陷落柱
            this._collapsePillars?.forEach(collapse => {
                const profile: CollapseProfile = {
                    collapseID: collapse.id,
                    crossSections: [],
                    polys: []
                };

                // 传递upDir参数
                const result = collapse.generateCrossSections(
                    [
                        new THREE.Vector3(line[0].x, line[0].y, line[0].z),
                        new THREE.Vector3(line[1].x, line[1].y, line[1].z)
                    ],
                    upDir
                ); // 新增upDir参数

                if (!result) return;

                // 转换三角剖分结果
                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array(result.positions.flatMap(p => [p.x, p.y, p.z]));
                geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

                const indices = new Uint32Array(result.indices.flat());
                geometry.setIndex(new THREE.BufferAttribute(indices, 1));

                profile.crossSections.push(geometry);
                profile.polys.push(result.positions.map(p => new THREE.Vector3(p.x, p.y, p.z)));

                if (profile.crossSections.length > 0) {
                    collapseProfiles.push(profile);
                }
            });

            // 处理地层
            const lineStart = new THREE.Vector3(line[0].x, line[0].y, line[0].z);
            const lineEnd = new THREE.Vector3(line[1].x, line[1].y, line[1].z);

            // 使用传入的upDir作为剖切面上方向
            let lineDir = new THREE.Vector3().subVectors(lineEnd, lineStart);
            const lineLength = lineDir.length();

            // 处理退化情况
            if (lineLength < 1e-6) {
                lineDir = new THREE.Vector3(1, 0, 0); // X轴方向
            } else {
                lineDir.normalize();
                if (lineDir.x < 0) lineDir.multiplyScalar(-1);
            }

            // 处理各地层
            this._stratumLayers?.forEach(layer => {
                const stratumProfile: StratumProfile = {
                    stratumID: layer.id,
                    top: [],
                    base: [],
                    crossSections: [],
                    polys: []
                };

                layer.voxels.forEach(voxel => {
                    // 传递upDir参数
                    const topTris = voxel.getTopTriangles();
                    const topPoints = this.processTriangles(topTris, [lineStart, lineEnd]);
                    const sortedTopPoints = this.sortPointsAlongLine(
                        topPoints,
                        [lineStart, lineEnd],
                        upDir
                    );

                    // 传递upDir参数
                    const baseTris = voxel.getBaseTriangles();
                    const basePoints = this.processTriangles(baseTris, [lineStart, lineEnd]);
                    const sortedBasePoints = this.sortPointsAlongLine(
                        basePoints,
                        [lineStart, lineEnd],
                        upDir
                    );

                    if (sortedTopPoints.length < 2 || sortedBasePoints.length < 2) return;

                    // 传递upDir参数
                    const { meshes, polys } = this.generateStratumMesh(
                        sortedTopPoints,
                        sortedBasePoints,
                        lineDir,
                        collapseProfiles,
                        upDir // 新增upDir参数
                    );

                    stratumProfile.top.push(...topPoints);
                    stratumProfile.base.push(...basePoints);
                    stratumProfile.crossSections.push(...meshes);
                    stratumProfile.polys.push(...polys);
                });

                if (stratumProfile.crossSections.length > 0) {
                    stratumProfiles.push(stratumProfile);
                }
            });

            // 转换当前剖切线的坐标
            const convertCoordinates = (profiles: StratumProfile[] | CollapseProfile[]) => {
                profiles.forEach(profile => {
                    // 转换陷落柱剖面坐标
                    collapseProfiles.forEach(profile => {
                        profile.polys.forEach(poly => {
                            poly.forEach(point => {
                                const worldPoint = toTileWorld(this._header!, point);
                                point.copy(worldPoint);
                            });
                        });
                        profile.crossSections.forEach(geometry => {
                            const positions = geometry.getAttribute("position");
                            const array = positions.array as Float32Array;
                            for (let i = 0; i < array.length; i += 3) {
                                const local = new THREE.Vector3(
                                    array[i],
                                    array[i + 1],
                                    array[i + 2]
                                );
                                const world = toTileWorld(this._header!, local);
                                array.set([world.x, world.y, world.z], i);
                            }
                            positions.needsUpdate = true;
                        });
                    });

                    // 转换地层剖面坐标
                    stratumProfiles.forEach(profile => {
                        // 转换顶底板坐标
                        [profile.top, profile.base].forEach(points => {
                            points.forEach(point => {
                                const worldPoint = toTileWorld(this._header!, point);
                                point.copy(worldPoint);
                            });
                        });

                        // 转换多边形坐标
                        profile.polys.forEach(poly => {
                            poly.forEach(point => {
                                const worldPoint = toTileWorld(this._header!, point);
                                point.copy(worldPoint);
                            });
                        });

                        // 转换几何体坐标
                        profile.crossSections.forEach(geometry => {
                            const positions = geometry.getAttribute("position");
                            const array = positions.array as Float32Array;
                            for (let i = 0; i < array.length; i += 3) {
                                const local = new THREE.Vector3(
                                    array[i],
                                    array[i + 1],
                                    array[i + 2]
                                );
                                const world = toTileWorld(this._header!, local);
                                array.set([world.x, world.y, world.z], i);
                            }
                            positions.needsUpdate = true;
                        });
                    });
                });
            };

            convertCoordinates(stratumProfiles);
            convertCoordinates(collapseProfiles);

            // 添加分组结果
            results.push({
                line: cutLines[lineIndex], // 保留原始世界坐标剖切线
                stratumProfiles,
                collapseProfiles
            });
        });

        return results;
    }

    private processTriangles(triangles: Float32Array, line: THREE.Vector3[]): THREE.Vector3[] {
        // Convert triangle data to array of THREE.Vector3 arrays
        const triVectors: THREE.Vector3[][] = [];
        for (let i = 0; i < triangles.length; i += 9) {
            const tri = [
                new THREE.Vector3(triangles[i], triangles[i + 1], triangles[i + 2]),
                new THREE.Vector3(triangles[i + 3], triangles[i + 4], triangles[i + 5]),
                new THREE.Vector3(triangles[i + 6], triangles[i + 7], triangles[i + 8])
            ];
            triVectors.push(tri);
        }

        const lineStart = line[0];
        const lineEnd = line[1];
        const result: THREE.Vector3[] = [];

        // Check intersection with each triangle
        triVectors.forEach(tri => {
            const intersects = this.lineTriangleIntersection(lineStart, lineEnd, tri);
            if (intersects.length > 0) {
                result.push(...intersects);
            }
        });

        return result;
    }

    private projectPointToSegment(
        pt: THREE.Vector3,
        a: THREE.Vector3,
        b: THREE.Vector3
    ): [THREE.Vector3, number] {
        const ab = new THREE.Vector3().subVectors(b, a);
        const ap = new THREE.Vector3().subVectors(pt, a);
        const abSqrLen = ab.lengthSq();

        // Handle zero-length segment
        if (abSqrLen < 1e-16) return [a.clone(), 0];

        const t = Math.max(0, Math.min(1, ap.dot(ab) / abSqrLen));
        const scaledAB = ab.clone().multiplyScalar(t);
        return [a.clone().add(scaledAB), t];
    }

    private lineTriangleIntersection(
        lineStart: THREE.Vector3,
        lineEnd: THREE.Vector3,
        triangle: THREE.Vector3[]
    ): THREE.Vector3[] {
        const epsilon = 1e-6;

        // Calculate triangle edges
        const edge1 = new THREE.Vector3().subVectors(triangle[1], triangle[0]);
        const edge2 = new THREE.Vector3().subVectors(triangle[2], triangle[0]);

        // Calculate ray direction
        const rayDir = new THREE.Vector3().subVectors(lineEnd, lineStart);

        // Calculate determinant
        const h = new THREE.Vector3().crossVectors(rayDir, edge2);
        const det = edge1.dot(h);

        // Check if ray is parallel to triangle
        if (Math.abs(det) < epsilon) return [];

        const invDet = 1.0 / det;
        const s = new THREE.Vector3().subVectors(lineStart, triangle[0]);

        // Calculate u parameter and test bounds
        const u = invDet * s.dot(h);
        if (u < 0.0 || u > 1.0) return [];

        // Calculate q vector and v parameter
        const q = new THREE.Vector3().crossVectors(s, edge1);
        const v = invDet * rayDir.dot(q);
        if (v < 0.0 || u + v > 1.0) return [];

        // Calculate t parameter
        const t = invDet * edge2.dot(q);

        // Check if intersection is within line segment
        if (t > epsilon && t < 1.0 + epsilon) {
            // Return interpolated intersection point
            return [new THREE.Vector3().lerpVectors(lineStart, lineEnd, t)];
        }

        return [];
    }

    // 新增地质剖面生成核心方法
    private generateStratumMesh(
        top: THREE.Vector3[],
        base: THREE.Vector3[],
        lineDir: THREE.Vector3,
        collapseProfiles: CollapseProfile[],
        upDir: THREE.Vector3 // 新增 upDir 参数
    ): { meshes: THREE.BufferGeometry[]; polys: THREE.Vector3[][] } {
        const meshes: THREE.BufferGeometry[] = [];
        const polys: THREE.Vector3[][] = [];

        if (top.length < 2) return { meshes, polys };

        // 分割连续段（处理尖灭）
        const segments = this.splitContinuousSegments(top, base);

        for (const seg of segments) {
            if (seg.top.length < 2) continue;

            // 构建地层多边形（顶板 + 反转的底板）
            const polygon = [...seg.top, ...[...seg.base].reverse()];

            // 计算投影矩阵时使用 upDir
            const matrix = this.calculateProjectionMatrixForSection(polygon, lineDir, upDir);
            if (!matrix) {
                continue;
            }

            // 执行三角剖分
            const subMesh = this.buildTriangulateMesh(polygon);
            if (subMesh) {
                meshes.push(subMesh);
                polys.push(polygon);
            }
        }

        // 处理陷落柱切割
        const finalMeshes: THREE.BufferGeometry[] = [];
        for (let i = 0; i < meshes.length; i++) {
            const polygon = polys[i];

            // 重新计算投影矩阵（使用 upDir）
            const matrix = this.calculateProjectionMatrixForSection(polygon, lineDir, upDir);
            if (!matrix) {
                finalMeshes.push(meshes[i]);
                continue;
            }

            const relevantCollapses = this.queryRelevantCollapses(polygon, collapseProfiles);
            if (relevantCollapses.length === 0) {
                finalMeshes.push(meshes[i]);
                continue;
            }

            // 处理每个相关的陷落柱
            for (const collapse of relevantCollapses) {
                for (const collapsePoly of collapse.polys) {
                    try {
                        const newMeshes = this.cutProfiles(polygon, collapsePoly, matrix);
                        finalMeshes.push(...newMeshes);
                    } catch (e) {
                        finalMeshes.push(meshes[i]);
                    }
                }
            }

            // 保留未切割的部分（如果有效）
            const positionAttr = meshes[i].getAttribute("position");
            if (positionAttr && positionAttr.count > 2) {
                finalMeshes.push(meshes[i]);
            }
        }

        return { meshes: finalMeshes, polys };
    }

    // 新增方法：为剖面计算投影矩阵（使用 upDir）
    private calculateProjectionMatrixForSection(
        poly: THREE.Vector3[],
        lineDir: THREE.Vector3,
        upDir: THREE.Vector3
    ): ProjectionMatrix | null {
        if (poly.length < 3) return null;

        const origin = poly[0].clone();

        // 使用 upDir 作为主要参考方向
        const normal = this.computePolygonNormal(poly);

        // 确保 lineDir 与 normal 垂直
        const adjustedLineDir = lineDir.clone().projectOnPlane(normal).normalize();

        // 计算 x 轴（使用调整后的线方向）
        const xAxis =
            adjustedLineDir.length() > 0.001 ? adjustedLineDir : new THREE.Vector3(1, 0, 0);

        // 计算 y 轴（使用 upDir 在平面上的投影）
        const projectedUpDir = upDir.clone().projectOnPlane(normal).normalize();
        const yAxis =
            projectedUpDir.length() > 0.001
                ? projectedUpDir
                : new THREE.Vector3().crossVectors(normal, xAxis).normalize();

        return {
            origin,
            xAxis,
            yAxis,
            normal
        };
    }

    // 修改点排序方法（使用 upDir）
    private sortPointsAlongLine(
        points: THREE.Vector3[],
        line: THREE.Vector3[],
        upDir: THREE.Vector3 // 新增 upDir 参数
    ): THREE.Vector3[] {
        interface ParamPoint {
            totalDist: number;
            point: THREE.Vector3;
        }

        const paramPoints: ParamPoint[] = [];
        const segDists: number[] = [0];

        // 计算线段长度
        for (let i = 1; i < line.length; i++) {
            segDists.push(segDists[i - 1] + line[i].distanceTo(line[i - 1]));
        }

        // 计算每个点的参数值
        for (const pt of points) {
            let minDist = Infinity;
            let bestSegmentIndex = 0;
            let bestParam = 0;
            let accumDist = 0;

            // 找到最近的线段
            for (let i = 1; i < line.length; i++) {
                const segStart = line[i - 1];
                const segEnd = line[i];
                const [proj, t] = this.projectPointToSegment(pt, segStart, segEnd);

                const d = pt.distanceTo(proj);
                if (d < minDist) {
                    minDist = d;
                    bestSegmentIndex = i - 1;
                    bestParam = t;
                    const segLen = segDists[i] - segDists[i - 1];
                    accumDist = segDists[bestSegmentIndex] + bestParam * segLen;
                }
            }

            // 添加垂直方向偏差（使用 upDir）
            if (minDist < Infinity) {
                const verticalOffset = pt.clone().sub(line[0]).dot(upDir);
                accumDist += verticalOffset * 0.001; // 小权重避免影响主要排序
                paramPoints.push({ totalDist: accumDist, point: pt });
            }
        }

        // 按累计距离排序
        paramPoints.sort((a, b) => a.totalDist - b.totalDist);

        return paramPoints.map(pp => pp.point);
    }

    // 空间查询方法
    private queryRelevantCollapses(
        poly: THREE.Vector3[],
        allCollapses: CollapseProfile[]
    ): CollapseProfile[] {
        const polyBounds = this.calculate3DBounds(poly);
        return allCollapses.filter(collapse =>
            collapse.polys.some(cp => this.boundsIntersect(polyBounds, this.calculate3DBounds(cp)))
        );
    }

    // 三维包围盒计算 (3D Bounding Box Calculation)
    private calculate3DBounds(poly: THREE.Vector3[]): THREE.Box3 {
        const box = new THREE.Box3();
        poly.forEach(v => box.expandByPoint(v));
        return box;
    }

    // 连续地质段分割（检测尖灭点）(Continuous Segment Splitting - Pinch-out Detection)
    private splitContinuousSegments(
        top: THREE.Vector3[],
        base: THREE.Vector3[]
    ): Array<{ top: THREE.Vector3[]; base: THREE.Vector3[] }> {
        const segments: Array<{ top: THREE.Vector3[]; base: THREE.Vector3[] }> = [];
        const thicknessThreshold = 1e-5;
        let start = 0;
        let prevIsPinch = false;

        for (let i = 1; i < top.length; i++) {
            const thickness = top[i].distanceTo(base[i]);

            // 检测尖灭点或终点 (Detect pinch-out or end point)
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

    // 多边形法向量计算
    private computePolygonNormal(poly: THREE.Vector3[]): THREE.Vector3 {
        const normal = new THREE.Vector3();
        for (let i = 0; i < poly.length; i++) {
            const current = poly[i];
            const next = poly[(i + 1) % poly.length];
            normal.x += (current.y - next.y) * (current.z + next.z);
            normal.y += (current.z - next.z) * (current.x + next.x);
            normal.z += (current.x - next.x) * (current.y + next.y);
        }
        return normal.normalize();
    }

    // 剖面切割核心方法
    private cutProfiles(
        stratumPoly: THREE.Vector3[],
        collapsePoly: THREE.Vector3[],
        matrix: ProjectionMatrix
    ): THREE.BufferGeometry[] {
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
        return clipped
            .map(poly => this.buildTriangulateMesh(this.projectTo3D(poly, matrix)))
            .filter(Boolean);
    }

    // 新增多边形方向校验方法
    private ensureClockwiseOrder(poly: THREE.Vector3[]): THREE.Vector3[] {
        const area = this.calculatePolygonArea(poly);
        return area > 0 ? poly.reverse() : poly;
    }

    private ensureCounterClockwiseOrder(poly: THREE.Vector3[]): THREE.Vector3[] {
        const area = this.calculatePolygonArea(poly);
        return area < 0 ? poly.reverse() : poly;
    }

    // 计算多边形面积（带符号）
    private calculatePolygonArea(poly: THREE.Vector3[]): number {
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
            const current = poly[i];
            const next = poly[(i + 1) % poly.length];
            area += (next.x - current.x) * (next.y + current.y);
        }
        return area;
    }

    // 快速相交检测
    private polygonsIntersect(a: THREE.Vector2[], b: THREE.Vector2[]): boolean {
        const aBounds = this.calculateBounds(a);
        const bBounds = this.calculateBounds(b);

        // 包围盒快速排除
        if (
            aBounds.maxX < bBounds.minX ||
            aBounds.minX > bBounds.maxX ||
            aBounds.maxY < bBounds.minY ||
            aBounds.minY > bBounds.maxY
        ) {
            return false;
        }

        // 精确相交检测（简化版）
        return a.some(p => this.pointInPolygon(p, b)) || b.some(p => this.pointInPolygon(p, a));
    }

    // 三维到二维投影 (3D to 2D Projection)
    private projectTo2D(poly: THREE.Vector3[], matrix: ProjectionMatrix): THREE.Vector2[] {
        return poly.map(p => {
            const rel = new THREE.Vector3().subVectors(p, matrix.origin);
            return new THREE.Vector2(rel.dot(matrix.xAxis), rel.dot(matrix.yAxis));
        });
    }

    // 二维到三维逆投影 (2D to 3D Inverse Projection)
    private projectTo3D(points: THREE.Vector2[], matrix: ProjectionMatrix): THREE.Vector3[] {
        return points.map(p => {
            const xComponent = new THREE.Vector3().copy(matrix.xAxis).multiplyScalar(p.x);
            const yComponent = new THREE.Vector3().copy(matrix.yAxis).multiplyScalar(p.y);
            return new THREE.Vector3().copy(matrix.origin).add(xComponent).add(yComponent);
        });
    }

    // 二维包围盒计算
    private calculateBounds(points: THREE.Vector2[]): {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    } {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

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
        return (
            a[0][0] <= b[1][0] &&
            a[1][0] >= b[0][0] && // X轴
            a[0][1] <= b[1][1] &&
            a[1][1] >= b[0][1] && // Y轴
            a[0][2] <= b[1][2] &&
            a[1][2] >= b[0][2]
        ); // Z轴
    }

    // 射线法判断点是否在多边形内
    private pointInPolygon(point: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
        const epsilon = 1e-10;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i++) {
            const pi = polygon[i];
            const pj = polygon[j];

            // 排除在顶点上的情况
            if (Math.abs(pi.x - point.x) < epsilon && Math.abs(pi.y - point.y) < epsilon) {
                return true;
            }

            // 检测线段与水平射线的交点
            const intersect =
                // eslint-disable-next-line no-mixed-operators
                pi.y > point.y !== pj.y > point.y &&
                point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;

            if (intersect) inside = !inside;
        }

        return inside;
    }

    private buildTriangulateMesh(polygon: THREE.Vector3[]): THREE.BufferGeometry | null {
        if (polygon.length < 3) return null;

        try {
            const { positions, indices } = triangulate(polygon);
            const geometry = new THREE.BufferGeometry();

            const vertices = new Float32Array(positions.flatMap(p => [p.x, p.y, p.z]));
            geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

            if (indices.length > 0) {
                const indexArray = new Uint32Array(indices.flat());
                geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
            }

            geometry.computeVertexNormals();
            return geometry;
        } catch (e) {
            return null;
        }
    }

    // 二维多边形裁剪（示例实现）
    private weilerAthertonClip(
        subjectPolygon: THREE.Vector2[],
        clipPolygon: THREE.Vector2[]
    ): THREE.Vector2[][] {
        // 将THREE.Vector2数组转换为FlatArray格式（修复参数结构）
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

        // 将结果转换回THREE.Vector2数组
        return resultPolygons.map(poly => {
            return poly.array.reduce((acc: THREE.Vector2[], _, i) => {
                if (i % poly.itemSize === 0) {
                    acc.push(new THREE.Vector2(poly.array[i], poly.array[i + 1]));
                }
                return acc;
            }, []);
        });
    }
}

export { StratumTile };
