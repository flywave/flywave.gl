import {
    BSPNode,
    BVH,
    BVHNode,
    createPolygon,
    fromPolygons,
    HybridBuilder,
    Polygon,
    triangulate,
    weilerAthertonClip
} from "@flywave/flywave-geometry";
import {
    BoundingSphere,
    GeoBox,
    GeoCoordinatesLike,
    Projection,
    TileKey
} from "@flywave/flywave-geoutils";
import { FlatArray } from "@flywave/flywave-utils";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils";

import { DecodeResult, Header, LayerType } from "../decoder";
import { Borehole } from "./Borehole";
import { CollapsePillar } from "./Collapse";
import { ColorMap } from "./ColorMap";
import { FaultProfile } from "./Fault";
import { toTileLocalBBox, toTileLocalLines, toTileWorld, toTileWorldBBox } from "./Project";
import { SectionLine } from "./Section";
import { CollapseProfile, StratumProfile } from "./SectionProfile";
import { StratumLayer } from "./Stratum";
import { TextureCacheLoader } from "./Texture";
import { StratumVoxel } from "./Voxel";

export type BVHObject = CollapsePillar | StratumVoxel;

// 新增类型定义
interface ProjectionMatrix {
    origin: THREE.Vector3;
    xAxis: THREE.Vector3;
    yAxis: THREE.Vector3;
    normal: THREE.Vector3;
}

class StratumTile {
    private readonly _id?: TileKey;
    private _header?: Header;
    private _bbox?: THREE.Box3;
    private _geoBox?: GeoBox;
    private _ecefBox?: THREE.Box3;
    private _ecefSphere?: BoundingSphere;
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
    private readonly _textureCache?: TextureCacheLoader;
    private _geometriesCache: Record<
        string,
        Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }>
    > | null = null;

    constructor(
        id?: TileKey,
        res?: DecodeResult,
        project?: Projection,
        textureCache?: TextureCacheLoader
    ) {
        this._id = id;
        this.init(res);
        this._project = project;
        this._textureCache = textureCache;
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

    get ecefBox() {
        return this._ecefBox;
    }

    get ecefSphere() {
        return this._ecefSphere;
    }

    get geoBox() {
        return this._geoBox;
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
        if (this._geometriesCache) {
            return this._geometriesCache;
        }

        // 合并地层体素几何
        const stratumObjects = this._stratumLayers?.flatMap(l => l.voxels) || [];
        groups.stratum = this.mergeGeometriesByMaterial(stratumObjects);

        // 合并陷落柱几何
        const collapseObjects = this._collapsePillars || [];
        groups.collapse = this.mergeGeometriesByMaterial(collapseObjects);

        // 收集断层几何
        this._faultProfiles?.forEach(fault => {
            if (fault.geometry && fault.material) {
                groups.fault.push({
                    geometry: fault.geometry,
                    material: fault.material
                });
            }
        });

        // 收集钻孔几何
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

        // 收集剖切线几何
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
        // 更新缓存
        this._geometriesCache = groups;
        return groups;
    }

    public caclBBox() {
        if (this._vertices) {
            const box = new THREE.Box3();
            const bspere = new BoundingSphere();
            const positions = this._vertices;

            for (let i = 0; i < positions.length; i += 3) {
                const pt = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
                box.expandByPoint(pt);
                bspere.expandByPoint(pt);
            }

            this._bbox = box;
            if (box) {
                this._geoBox = toTileWorldBBox(this._header!, box) as GeoBox;
                this._ecefBox = toTileWorldBBox(this._header!, box) as THREE.Box3;
            }
            if (bspere) {
                const center = toTileWorld(this._header!, bspere.center) as THREE.Vector3;
                this._ecefSphere = new BoundingSphere(center, bspere.radius);
            }
        }
    }

    public cliGeometry(
        geoBox: GeoBox,
        isClip?: boolean
    ): Record<string, Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }>> {
        const tileGeoBox = this._geoBox!;

        if (!tileGeoBox.intersectsBox(geoBox)) {
            return this.geometries;
        }
        const { fault, borehole, section } = this.geometries;

        if (geoBox.containsBox(tileGeoBox)) {
            return {
                stratum: [],
                collapse: [],
                fault,
                borehole,
                section
            };
        }

        // 相交情况：将geoBox转换到tile坐标系
        const tileLocalBox = toTileLocalBBox(this._header!, geoBox, this._project);
        const clipNode = this.createBoxBsp(tileLocalBox);

        // 获取所有地质对象
        const allObjects = [
            ...(this._stratumLayers?.flatMap(l => l.voxels) || []),
            ...(this._collapsePillars || [])
        ];

        const result = {
            stratum: [] as Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }>,
            fault: [] as Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }>,
            borehole: [] as Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }>,
            collapse: [] as Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }>,
            section: [] as Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }>
        };

        allObjects.forEach(obj => {
            const objBbox = obj.bbox!;

            // 完全在box内的对象直接跳过
            if (tileLocalBox.containsBox(objBbox)) return;

            // 完全在box外的对象直接保留
            if (!tileLocalBox.intersectsBox(objBbox)) {
                const type = obj instanceof StratumVoxel ? "stratum" : "collapse";
                if (obj.geometry && obj.material) {
                    result[type].push({
                        geometry: obj.geometry,
                        material: obj.material
                    });
                }
                return;
            }

            if (isClip) {
                // 相交对象进行裁剪处理
                let clippedGeom: THREE.BufferGeometry | undefined;
                if (obj instanceof StratumVoxel) {
                    clippedGeom = obj.clipGeometry(clipNode);
                } else if (obj instanceof CollapsePillar) {
                    clippedGeom = obj.clipGeometry(clipNode);
                }

                if (clippedGeom) {
                    const type = obj instanceof StratumVoxel ? "stratum" : "collapse";
                    result[type].push({
                        geometry: clippedGeom,
                        material: obj.material!
                    });
                }
            }
        });

        result.fault = fault;
        result.borehole = borehole;
        result.section = section;
        return result;
    }

    // 创建表示立方体的BSP节点
    private createBoxBsp(box: THREE.Box3): BSPNode {
        // 生成立方体的六个面多边形
        const polygons = [
            // 前后面
            this.createBoxFace(box.min, new THREE.Vector3(box.max.x, box.min.y, box.max.z)),
            this.createBoxFace(new THREE.Vector3(box.min.x, box.max.y, box.min.z), box.max),
            // 左右面
            this.createBoxFace(box.min, new THREE.Vector3(box.min.x, box.max.y, box.max.z)),
            this.createBoxFace(new THREE.Vector3(box.max.x, box.min.y, box.min.z), box.max),
            // 顶底面
            this.createBoxFace(box.min, new THREE.Vector3(box.max.x, box.min.y, box.max.z)),
            this.createBoxFace(new THREE.Vector3(box.min.x, box.max.y, box.min.z), box.max)
        ];

        return fromPolygons(polygons);
    }

    // 创建立方体单个面的多边形
    private createBoxFace(p1: THREE.Vector3, p2: THREE.Vector3): Polygon {
        return createPolygon([
            new THREE.Vector3(p1.x, p1.y, p1.z),
            new THREE.Vector3(p2.x, p1.y, p1.z),
            new THREE.Vector3(p2.x, p2.y, p2.z),
            new THREE.Vector3(p1.x, p2.y, p1.z)
        ]);
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

        // 释放所有合并的几何体
        Object.values(this._geometriesCache).forEach(group => {
            group.forEach(({ geometry }) => {
                geometry.dispose();
                if (geometry.index) geometry.index.array = null;
            });
        });
        this._geometriesCache = null;

        // 释放材质资源
        this._materialCache.forEach(material => {
            if ((material as any)?.map) (material as any)?.map.dispose();
            material.dispose();
        });
        this._materialCache.clear();
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

        const boxes = allObjects.map(obj => {
            const bbox = obj.bbox!;
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
        const texCoords = res.vertexData.uvs
            ? new Float32Array(res.vertexData.uvs)
            : new Float32Array(nCoords * 2);

        const normals = res.vertexData.normals;

        this._vertices = positions;
        this._texCoords = texCoords; // 使用解码后的UV数据
        this._normals = normals;
        this.caclBBox();
    }

    private async initExtensions(res: DecodeResult) {
        const ext = res.extensions!;

        if (ext.colorMap) {
            this._colorMap = new ColorMap(ext.colorMap, this._textureCache);
        }

        this._faultProfiles = await Promise.all(this.initFaultProfiles(ext, res));
        this._boreholes = await Promise.all(this.initBoreholes(ext, res));
        this._stratumLayers = await Promise.all(this.initStratumLayers(ext, res));
        this._collapsePillars = await Promise.all(this.initCollapsePillars(ext, res));
        this._sectionLines = await this.initSectionLines(ext, res);
        this._geometriesCache = null;
    }

    private initFaultProfiles(
        ext: NonNullable<DecodeResult["extensions"]>,
        res: DecodeResult
    ): Array<Promise<FaultProfile>> {
        return (
            ext.faultProfiles?.map(fp => {
                const layer = this.findStratumLayer(res, fp.id, LayerType.Fault);
                if (!layer?.voxels?.length) return Promise.resolve(new FaultProfile(fp));

                const geometry = this.buildMeshGeometry(layer.voxels[0])?.geometry;
                return this.buildMeshMaterial("fault", fp.id).then(
                    material => new FaultProfile(fp, geometry, material)
                );
            }) ?? []
        );
    }

    private initBoreholes(
        ext: NonNullable<DecodeResult["extensions"]>,
        res: DecodeResult
    ): Array<Promise<Borehole>> {
        return (
            ext.boreholes?.map(bh => {
                // 移除async
                const layer = this.findStratumLayer(res, bh.id, LayerType.Borehole);
                if (!layer?.voxels?.length) return Promise.resolve(new Borehole(bh));

                const geometries = layer.voxels.map(
                    voxel => this.buildMeshGeometry(voxel)?.geometry as THREE.BufferGeometry
                );

                // 使用Promise.all处理材质数组
                return Promise.all(
                    bh.stratums?.map(stratum =>
                        this.buildMeshMaterial("stratum", stratum.id, stratum.lithology)
                    ) || []
                ).then(materials => new Borehole(bh, geometries, materials));
            }) ?? []
        );
    }

    private initStratumLayers(
        ext: NonNullable<DecodeResult["extensions"]>,
        res: DecodeResult
    ): Array<Promise<StratumLayer>> {
        return (
            ext.stratumLayers?.map(sl => {
                const layer = this.findStratumLayer(res, sl.id, LayerType.Voxel);
                const lithology = res.extensions?.stratumLithology?.[layer?.id || ""] || "";

                const items = layer!.voxels.map(voxel => {
                    const geomData = this.buildMeshGeometry(voxel);
                    return {
                        ...voxel,
                        bbox: new THREE.Box3(
                            new THREE.Vector3(
                                geomData.bbox[0][0],
                                geomData.bbox[0][1],
                                geomData.bbox[0][2]
                            ),
                            new THREE.Vector3(
                                geomData.bbox[1][0],
                                geomData.bbox[1][1],
                                geomData.bbox[1][2]
                            )
                        ),
                        geometry: geomData?.geometry
                    };
                });

                // 直接返回Promise链
                return this.buildMeshMaterial("stratum", layer?.id, lithology).then(
                    material => new StratumLayer(sl, items, lithology, material)
                );
            }) ?? []
        );
    }

    private initCollapsePillars(
        ext: NonNullable<DecodeResult["extensions"]>,
        res: DecodeResult
    ): Array<Promise<CollapsePillar>> {
        return (
            ext.collapsePillars?.map(cp => {
                // 移除async
                const layer = this.findStratumLayer(res, cp.id, LayerType.Collapse);
                if (!layer?.voxels?.length) return Promise.resolve(new CollapsePillar(cp));

                const voxel = layer.voxels[0];
                const geomData = this.buildMeshGeometry(voxel);

                // 使用Promise链处理异步操作
                return this.buildMeshMaterial("collapse", cp.id, cp.lithology).then(material => {
                    const bbox = new THREE.Box3(
                        new THREE.Vector3(...geomData.bbox[0]),
                        new THREE.Vector3(...geomData.bbox[1])
                    );
                    return new CollapsePillar(cp, bbox, geomData?.geometry, material);
                });
            }) ?? []
        );
    }

    private async initSectionLines(
        ext: NonNullable<DecodeResult["extensions"]>,
        res: DecodeResult
    ) {
        return (
            ext.sectionLines?.map(sl => {
                const layer = this.findStratumLayer(res, sl.id, LayerType.Section);
                if (!layer?.voxels?.length) return new SectionLine(sl);

                const geometries: THREE.BufferGeometry[] = [];
                const materials: THREE.Material[] = [];

                layer.voxels.forEach(async voxel => {
                    const geomData = this.buildMeshGeometry(voxel);
                    if (!geomData?.geometry || !geomData.bbox) return;

                    geometries.push(geomData.geometry);

                    let lithology = "";
                    if (res.extensions?.stratumLithology) {
                        lithology = res.extensions?.stratumLithology[voxel.id];
                    }

                    const material = await this.buildMeshMaterial("section", undefined, lithology);
                    materials.push(material);
                });

                return new SectionLine(sl, geometries, materials);
            }) ?? []
        );
    }

    private findStratumLayer(res: DecodeResult, id: string, type?: LayerType) {
        return res.layers?.find(layer => layer.id === id && (!type || layer.type === type));
    }

    private async buildMeshMaterial(
        layerType: "stratum" | "borehole" | "section" | "fault" | "collapse",
        id?: string,
        lithology?: string
    ): Promise<THREE.Material> {
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
                const texture = await this._colorMap?.getStratumTexture(lithology || "default");
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
                const texture = await this._colorMap?.getStratumTexture(
                    lithology || id || "default"
                );
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

    // 合并相同材质的几何体
    private mergeGeometriesByMaterial(
        objects: Array<StratumVoxel | CollapsePillar>
    ): Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> {
        const materialMap = new Map<THREE.Material, THREE.BufferGeometry[]>();

        objects.forEach(obj => {
            if (!obj.geometry || !obj.material) return;

            if (!materialMap.has(obj.material)) {
                materialMap.set(obj.material, []);
            }
            materialMap.get(obj.material)!.push(obj.geometry);
        });

        const results: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> = [];

        materialMap.forEach((geometries, material) => {
            if (geometries.length === 1) {
                results.push({ geometry: geometries[0], material });
            } else {
                // 使用BufferGeometryUtils进行高效合并
                const merged = mergeGeometries(
                    geometries,
                    true // 合并相同属性
                );
                if (merged) {
                    merged.computeBoundingSphere();
                    results.push({ geometry: merged, material });
                }
            }
        });

        return results;
    }

    private buildMeshGeometry(geom: {
        start: number;
        end: number;
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
        geometry.computeBoundingBox();

        const bbox = geometry.boundingBox?.clone();
        return {
            bbox,
            geometry
        };
    }

    public generateCrossSections(
        cutLines: GeoCoordinatesLike[][],
        upDir: THREE.Vector3
    ): Array<{
        stratumProfiles: StratumProfile[];
        collapseProfiles: CollapseProfile[];
        line: GeoCoordinatesLike[];
    }> {
        const localLines = toTileLocalLines(this._header, cutLines, this._project);

        // 第一阶段：收集所有局部坐标结果
        const rawResults = localLines.map((line, lineIndex) => {
            const stratumProfiles: StratumProfile[] = [];
            const collapseProfiles: CollapseProfile[] = [];

            // 1. 处理陷落柱剖面（局部坐标）
            this._collapsePillars?.forEach(collapse => {
                const result = collapse.generateCrossSections(
                    [
                        new THREE.Vector3(line[0].x, line[0].y, line[0].z),
                        new THREE.Vector3(line[1].x, line[1].y, line[1].z)
                    ],
                    upDir.clone()
                );
                if (!result) return;

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute(
                    "position",
                    new THREE.BufferAttribute(
                        new Float32Array(result.positions.flatMap(p => [p.x, p.y, p.z])),
                        3
                    )
                );
                geometry.setIndex(
                    new THREE.BufferAttribute(new Uint32Array(result.indices.flat()), 1)
                );

                collapseProfiles.push({
                    collapseID: collapse.id,
                    crossSections: [geometry],
                    polys: [result.positions.map(p => new THREE.Vector3(p.x, p.y, p.z))]
                });
            });

            // 2. 处理地层剖面（局部坐标）
            const lineStart = new THREE.Vector3(line[0].x, line[0].y, line[0].z);
            const lineEnd = new THREE.Vector3(line[1].x, line[1].y, line[1].z);

            this._stratumLayers?.forEach(layer => {
                const stratumProfile: StratumProfile = {
                    stratumID: layer.id,
                    top: [],
                    base: [],
                    crossSections: [],
                    polys: []
                };

                layer.voxels.forEach(voxel => {
                    // 生成顶底板数据（局部坐标）
                    const topPoints = this.processTriangles(voxel.getTopTriangles(), [
                        lineStart,
                        lineEnd
                    ]);
                    const basePoints = this.processTriangles(voxel.getBaseTriangles(), [
                        lineStart,
                        lineEnd
                    ]);

                    // 生成剖面网格（局部坐标）
                    const { meshes } = this.generateStratumMesh(
                        this.sortPointsAlongLine(topPoints, [lineStart, lineEnd], upDir),
                        this.sortPointsAlongLine(basePoints, [lineStart, lineEnd], upDir),
                        new THREE.Vector3().subVectors(lineEnd, lineStart).normalize(),
                        collapseProfiles,
                        upDir
                    );

                    stratumProfile.crossSections.push(...meshes);
                });

                if (stratumProfile.crossSections.length > 0) {
                    stratumProfiles.push(stratumProfile);
                }
            });

            return {
                line: cutLines[lineIndex],
                stratumProfiles,
                collapseProfiles,
                localLine: line // 保留局部坐标用于后续转换
            };
        });

        // 第二阶段：批量坐标转换
        const convertGeometry = (geometry: THREE.BufferGeometry) => {
            const positions = geometry.getAttribute("position");
            const array = positions.array as Float32Array;
            for (let i = 0; i < array.length; i += 3) {
                const world = toTileWorld(
                    this._header!,
                    new THREE.Vector3(array[i], array[i + 1], array[i + 2])
                ) as THREE.Vector3;
                array.set([world.x, world.y, world.z], i);
            }
            positions.needsUpdate = true;
        };

        return rawResults.map(result => {
            // 转换地层剖面
            result.stratumProfiles.forEach(profile => {
                profile.crossSections.forEach(convertGeometry);
                profile.polys.forEach(poly =>
                    poly.forEach(p => p.copy(toTileWorld(this._header!, p) as THREE.Vector3))
                );
            });

            // 转换陷落柱剖面
            result.collapseProfiles.forEach(profile => {
                profile.crossSections.forEach(convertGeometry);
                profile.polys.forEach(poly =>
                    poly.forEach(p => p.copy(toTileWorld(this._header!, p) as THREE.Vector3))
                );
            });

            return {
                line: result.line,
                stratumProfiles: result.stratumProfiles,
                collapseProfiles: result.collapseProfiles
            };
        });
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

        // 使用 upDir 作为主要参考方向
        const normal = this.computePolygonNormal(poly);

        // 确保x轴与线方向对齐
        const xAxis = lineDir.clone().projectOnPlane(normal).normalize();
        if (xAxis.length() < 0.001) {
            xAxis.set(1, 0, 0).projectOnPlane(normal).normalize();
        }

        // 确保y轴与上方向对齐
        let yAxis = upDir.clone().projectOnPlane(normal).normalize();
        if (yAxis.length() < 0.001) {
            yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
        }

        // 正交化处理
        const correction = yAxis.clone().projectOnVector(xAxis);
        yAxis.sub(correction).normalize();

        return { origin: poly[0], xAxis, yAxis, normal };
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

    public extractGroundFaces(): { positions: Float32Array; indices: Uint32Array } {
        const allGroundFaces = [
            ...(this._stratumLayers?.flatMap(layer =>
                layer.voxels.flatMap(voxel => this.extractVoxelGroundFaces(voxel))
            ) || [])
        ];

        return this.mergeGeometryData(allGroundFaces);
    }

    private buildVoxelGeometry(voxel: StratumVoxel): {
        geometry?: THREE.BufferGeometry;
        bbox?: THREE.Box3;
    } {
        if (!voxel.geometry) return {};

        // 直接从体素获取几何属性
        const positionAttr = voxel.geometry.getAttribute("position");
        const normalAttr = voxel.geometry.getAttribute("normal");
        const uvAttr = voxel.geometry.getAttribute("uv");
        const faceTypeAttr = voxel.geometry.getAttribute("facetypes");
        const indices = voxel.geometry.index?.array;

        // 创建新几何体避免污染原始数据
        const geometry = new THREE.BufferGeometry();

        // 设置几何属性
        geometry.setAttribute("position", positionAttr.clone());
        if (normalAttr) geometry.setAttribute("normal", normalAttr.clone());
        if (uvAttr) geometry.setAttribute("uv", uvAttr.clone());
        if (faceTypeAttr) geometry.setAttribute("facetypes", faceTypeAttr.clone());

        // 设置索引
        if (indices) {
            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        }

        // 计算包围盒
        geometry.computeBoundingBox();

        return {
            geometry,
            bbox: geometry.boundingBox?.clone()
        };
    }

    private extractVoxelGroundFaces(voxel: StratumVoxel): {
        positions: Float32Array;
        indices: Uint32Array;
    } {
        const geomData = this.buildVoxelGeometry(voxel); // 改为调用新方法
        if (!geomData?.geometry) {
            return { positions: new Float32Array(), indices: new Uint32Array() };
        }

        // 获取原始几何数据
        const positionAttr = geomData.geometry.getAttribute("position");
        const faceTypeAttr = geomData.geometry.getAttribute("facetypes");
        const indices = (geomData.geometry.index?.array as Uint32Array) || new Uint32Array();

        // 筛选地面面（假设faceType=0表示地面）
        const groundIndices = [];
        for (let i = 0; i < faceTypeAttr.count; i++) {
            if (faceTypeAttr.getX(i) === 0) {
                // 0代表地面面类型
                const triIndex = i * 3;
                groundIndices.push(indices[triIndex], indices[triIndex + 1], indices[triIndex + 2]);
            }
        }

        // 提取顶点数据
        return {
            positions: positionAttr.array as Float32Array,
            indices: new Uint32Array(groundIndices)
        };
    }

    private mergeGeometryData(datasets: Array<{ positions: Float32Array; indices: Uint32Array }>): {
        positions: Float32Array;
        indices: Uint32Array;
    } {
        // 顶点去重哈希表
        const vertexMap = new Map<string, number>();
        const mergedVertices: number[] = [];
        const mergedIndices: number[] = [];
        let vertexCounter = 0;

        datasets.forEach(({ positions, indices }) => {
            indices.forEach(idx => {
                const base = idx * 3;
                const x = positions[base];
                const y = positions[base + 1];
                const z = positions[base + 2];

                // 转换为世界坐标
                const worldPos = toTileWorld(
                    this._header!,
                    new THREE.Vector3(x, y, z)
                ) as THREE.Vector3;

                const key = `${worldPos.x},${worldPos.y},${worldPos.z}`;

                if (!vertexMap.has(key)) {
                    vertexMap.set(key, vertexCounter++);
                    mergedVertices.push(worldPos.x, worldPos.y, worldPos.z);
                }

                mergedIndices.push(vertexMap.get(key)!);
            });
        });

        return {
            positions: new Float32Array(mergedVertices),
            indices: new Uint32Array(mergedIndices)
        };
    }
}

export { StratumTile };
