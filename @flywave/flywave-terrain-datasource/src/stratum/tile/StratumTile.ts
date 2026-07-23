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
    GeoCoordinates,
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
import { FaultProfile } from "./Fault";
import { MaterialGroup } from "./MaterialGroup";
import { toTileLocalBBox, toTileLocalLines, toTileWorld, toTileWorldBBox } from "./Project";
import { SectionLine } from "./Section";
import { CollapseProfile, StratumProfile } from "./SectionProfile";
import { StratumLayer } from "./Stratum";
import {
    RenderMode,
    SatelliteTextureParams,
    StratumMaterial,
    StratumMaterialParams
} from "./StratumMaterial";
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
    private _materialGroup?: MaterialGroup;
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
    private readonly _project?: Projection;
    private readonly _textureCache?: TextureCacheLoader;
    private _geometriesCache: { geometry: THREE.BufferGeometry; material: StratumMaterial } | null =
        null;

    private _staticGeometriesCache: THREE.BufferGeometry[];

    private readonly _texturePath?: string;

    private _material?: StratumMaterial;

    constructor(
        id?: TileKey,
        res?: DecodeResult,
        project?: Projection,
        textureCache?: TextureCacheLoader,
        texturePath?: string
    ) {
        this._id = id;
        this.init(res);
        this._project = project;
        this._textureCache = textureCache;
        this._texturePath = texturePath;
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

    get materialGroup() {
        return this._materialGroup;
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

    get material() {
        return this._material;
    }

    // 在get geometries方法后添加BVH相关方法
    get stratumBVH(): BVH<{}, CollapsePillar | StratumVoxel> | undefined {
        return this._stratumBVH;
    }

    get geometries(): { geometry: THREE.BufferGeometry; material: StratumMaterial } {
        if (this._geometriesCache) {
            return this._geometriesCache;
        }

        // 收集所有几何体
        const allGeometries: THREE.BufferGeometry[] = [];

        // 合并地层和陷落柱几何
        const stratumGeoms = this._stratumLayers?.flatMap(l => l.voxels.map(v => v.geometry)) || [];
        const collapseGeoms = this._collapsePillars?.map(p => p.geometry) || [];
        allGeometries.push(...stratumGeoms, ...collapseGeoms);

        const staticGeometries: THREE.BufferGeometry[] = [];
        // 添加其他类型几何
        this._faultProfiles?.forEach(f => f.geometry && staticGeometries.push(f.geometry));
        this._boreholes?.forEach(b => b.geometries?.forEach(g => staticGeometries.push(g)));
        this._sectionLines?.forEach(s => s.geometries?.forEach(g => staticGeometries.push(g)));

        this._staticGeometriesCache = staticGeometries;
        allGeometries.push(...staticGeometries);

        // 创建合并后的几何体
        const merged = mergeGeometries(allGeometries, true);
        const groups = {
            geometry: merged,
            material: this._material! // 使用共享材质实例
        };

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
    ): { geometry: THREE.BufferGeometry; material: THREE.Material } {
        const tileGeoBox = this._geoBox!;

        if (!tileGeoBox.intersectsBox(geoBox)) {
            return this.geometries;
        }

        // 收集所有需要合并的几何体
        const geometriesToMerge: THREE.BufferGeometry[] = [...this._staticGeometriesCache];

        if (!geoBox.containsBox(tileGeoBox)) {
            const tileLocalBox = toTileLocalBBox(this._header!, geoBox, this._project);
            const clipNode = this.createBoxBsp(tileLocalBox);

            // 处理所有地质对象
            const allObjects = [
                ...(this._stratumLayers?.flatMap(l => l.voxels) || []),
                ...(this._collapsePillars || [])
            ];

            allObjects.forEach(obj => {
                const objBbox = obj.bbox!;

                if (!tileLocalBox.intersectsBox(objBbox)) {
                    // 完全在box外的对象直接保留
                    if (obj.geometry) geometriesToMerge.push(obj.geometry);
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
                    if (clippedGeom) geometriesToMerge.push(clippedGeom);
                } else {
                    // 未裁剪时保留完整几何体
                    if (obj.geometry) geometriesToMerge.push(obj.geometry);
                }
            });
        }

        // 合并所有几何体
        const merged =
            geometriesToMerge.length > 0 ? mergeGeometries(geometriesToMerge, true) : undefined;

        return {
            geometry: merged,
            material: this._material! // 使用共享材质
        };
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

    public async rebuildMaterial(params?: SatelliteTextureParams) {
        this._material = await this.buildMeshMaterial(params);
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
        this._materialGroup = undefined;

        // 释放所有合并的几何体
        if (this._geometriesCache) {
            this._geometriesCache.geometry.dispose();
            this._geometriesCache.geometry.index.array = null;
            this._geometriesCache = null;
        }
        this._material?.dispose();
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

        // v1 header stores real BBox in source CRS; fall back to external bbox.
        const minX = this._header?.bboxMinX ?? this._bbox?.[0]?.[0] ?? 0;
        const minY = this._header?.bboxMinY ?? this._bbox?.[0]?.[1] ?? 0;
        const minZ = this._header?.bboxMinZ ?? 0;
        const maxX = this._header?.bboxMaxX ?? this._bbox?.[1]?.[0] ?? 0;
        const maxY = this._header?.bboxMaxY ?? this._bbox?.[1]?.[1] ?? 0;
        const maxZ = this._header?.bboxMaxZ ?? 0;

        const nCoords = res.vertexData.u.length;

        // 批量处理顶点坐标
        const positions = new Float32Array(nCoords * 3);
        const uArr = res.vertexData.u;
        const vArr = res.vertexData.v;
        const hArr = res.vertexData.h;

        for (let i = 0; i < nCoords; i++) {
            const offset = i * 3;
            positions[offset] = minX + (uArr[i] / 32767) * (maxX - minX);
            positions[offset + 1] = minY + (vArr[i] / 32767) * (maxY - minY);
            positions[offset + 2] = minZ + (hArr[i] / 32767) * (maxZ - minZ);
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

        if (ext.materials) {
            this._materialGroup = new MaterialGroup(
                ext.materials,
                this._textureCache,
                this._texturePath
            );
        }

        this._faultProfiles = this.initFaultProfiles(ext, res);
        this._boreholes = this.initBoreholes(ext, res);
        this._stratumLayers = this.initStratumLayers(ext, res);
        this._collapsePillars = this.initCollapsePillars(ext, res);
        this._sectionLines = this.initSectionLines(ext, res);
        this._geometriesCache = null;

        this._material = await this.buildMeshMaterial();
    }

    private initFaultProfiles(
        ext: NonNullable<DecodeResult["extensions"]>,
        res: DecodeResult
    ): FaultProfile[] {
        return (
            ext.faultProfiles?.map(fp => {
                const layer = this.findStratumLayer(res, fp.id, LayerType.Fault);
                if (!layer?.voxels?.length) return new FaultProfile(fp);

                const geometry = this.buildMeshGeometry(layer.voxels[0])?.geometry;
                return new FaultProfile(fp, geometry);
            }) ?? []
        );
    }

    private initBoreholes(
        ext: NonNullable<DecodeResult["extensions"]>,
        res: DecodeResult
    ): Borehole[] {
        return ext.boreholes?.map(bh => {
            // 移除async
            const layer = this.findStratumLayer(res, bh.id, LayerType.Borehole);
            if (!layer?.voxels?.length) return new Borehole(bh);

            const geometries = layer.voxels.map(
                voxel => this.buildMeshGeometry(voxel)?.geometry as THREE.BufferGeometry
            );

            // 使用Promise.all处理材质数组
            return new Borehole(bh, geometries);
        });
    }

    private initStratumLayers(
        ext: NonNullable<DecodeResult["extensions"]>,
        res: DecodeResult
    ): StratumLayer[] {
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
                return new StratumLayer(sl, items, lithology);
            }) ?? []
        );
    }

    private initCollapsePillars(
        ext: NonNullable<DecodeResult["extensions"]>,
        res: DecodeResult
    ): CollapsePillar[] {
        return (
            ext.collapsePillars?.map(cp => {
                // 移除async
                const layer = this.findStratumLayer(res, cp.id, LayerType.Collapse);
                if (!layer?.voxels?.length) return new CollapsePillar(cp);

                const voxel = layer.voxels[0];
                const geomData = this.buildMeshGeometry(voxel);

                // 使用Promise链处理异步操作
                const bbox = new THREE.Box3(
                    new THREE.Vector3(...geomData.bbox[0]),
                    new THREE.Vector3(...geomData.bbox[1])
                );
                return new CollapsePillar(cp, bbox, geomData?.geometry);
            }) ?? []
        );
    }

    private initSectionLines(
        ext: NonNullable<DecodeResult["extensions"]>,
        res: DecodeResult
    ): SectionLine[] {
        return (
            ext.sectionLines?.map(sl => {
                const layer = this.findStratumLayer(res, sl.id, LayerType.Section);
                if (!layer?.voxels?.length) return new SectionLine(sl);

                const geometries: THREE.BufferGeometry[] = [];

                layer.voxels.forEach(async voxel => {
                    const geomData = this.buildMeshGeometry(voxel);
                    if (!geomData?.geometry || !geomData.bbox) return;

                    geometries.push(geomData.geometry);
                });

                return new SectionLine(sl, geometries);
            }) ?? []
        );
    }

    private findStratumLayer(res: DecodeResult, id: string, type?: LayerType) {
        return res.layers?.find(layer => layer.id === id && (!type || layer.type === type));
    }

    // 修改buildMeshMaterial方法
    private async buildMeshMaterial(params?: SatelliteTextureParams): Promise<StratumMaterial> {
        const textureAtlas = await this._materialGroup.getTexture();
        // 从MaterialGroup获取共享参数
        const materialParams: StratumMaterialParams = {
            textureAtlas: textureAtlas,
            textureAtlasMappings: this._materialGroup?.getAllAtlasMappings(),
            opacity: 1.0,
            renderMode: RenderMode.ALL,
            facetypes: true,
            satelliteParams: params
        };

        // 创建共享材质实例
        const material = new StratumMaterial(materialParams);
        material.side = THREE.DoubleSide;
        material.transparent = materialParams.opacity! < 1.0;

        return material;
    }

    // 合并相同材质的几何体
    private mergeGeometriesByMaterial(
        objects: Array<StratumVoxel | CollapsePillar>
    ): Array<{ geometry: THREE.BufferGeometry; material: StratumMaterial }> {
        const materialMap = new Map<StratumMaterial, THREE.BufferGeometry[]>();

        objects.forEach(obj => {
            if (!obj.geometry || !obj.material) return;

            if (!materialMap.has(obj.material)) {
                materialMap.set(obj.material, []);
            }
            materialMap.get(obj.material)!.push(obj.geometry);
        });

        const results: Array<{ geometry: THREE.BufferGeometry; material: StratumMaterial }> = [];

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
        material: number;
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

        // 新增材质组属性
        if (this._materialGroup) {
            const faceCount = subIndices.length / 3;
            const materialIndices = new Uint32Array(faceCount);
            materialIndices.fill(geom.material);
            geometry.setAttribute("materialGroup", new THREE.BufferAttribute(materialIndices, 1));
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

    public extractGroundFaces(): {
        positions: Float32Array;
        indices: Uint32Array;
        extents: number[];
    } {
        const groundFaces: Array<{ positions: Float32Array; indices: Uint32Array }> = [];

        for (const layer of this._stratumLayers || []) {
            if (!layer.voxels?.length) continue;
            groundFaces.push(...layer.extractGroundFaces());
        }

        const { positions, indices, minZ, maxZ, minLon, maxLon, minLat, maxLat } =
            this.mergeGeometryData(groundFaces);
        return {
            positions,
            indices,
            extents: [
                minLon, // minLongitude
                minLat, // minLatitude
                minZ, // 地面面最小高程
                maxLon, // maxLongitude
                maxLat, // maxLatitude
                maxZ // 地面面最大高程
            ]
        };
    }

    private mergeGeometryData(datasets: Array<{ positions: Float32Array; indices: Uint32Array }>): {
        positions: Float32Array;
        indices: Uint32Array;
        minZ: number;
        maxZ: number;
        minLon: number;
        maxLon: number;
        minLat: number;
        maxLat: number;
    } {
        let minZ = Infinity;
        let maxZ = -Infinity;
        let minLon = Infinity;
        let maxLon = -Infinity;
        let minLat = Infinity;
        let maxLat = -Infinity;

        const vertexMap = new Map<number, number>();
        const mergedVertices: number[] = [];
        const mergedIndices: number[] = [];

        datasets.forEach(({ positions, indices }) => {
            indices.forEach(idx => {
                const base = idx * 3;
                const localX = positions[base];
                const localY = positions[base + 1];
                const localZ = positions[base + 2];

                // 转换为世界坐标系
                const worldPos = toTileWorld(
                    this._header!,
                    new THREE.Vector3(localX, localY, localZ),
                    this._project
                ) as GeoCoordinates;

                // 更新高程极值
                minZ = Math.min(minZ, worldPos.altitude);
                maxZ = Math.max(maxZ, worldPos.altitude);
                minLon = Math.min(minLon, worldPos.longitude);
                maxLon = Math.max(maxLon, worldPos.longitude);
                minLat = Math.min(minLat, worldPos.latitude);
                maxLat = Math.max(maxLat, worldPos.latitude);

                // 使用世界坐标生成哈希
                const hash = this.generatePositionHash(worldPos);

                if (!vertexMap.has(hash)) {
                    vertexMap.set(hash, mergedVertices.length / 3);
                    mergedVertices.push(worldPos.longitude, worldPos.latitude, worldPos.altitude);
                }

                mergedIndices.push(vertexMap.get(hash)!);
            });
        });

        return {
            positions: new Float32Array(mergedVertices),
            indices: new Uint32Array(mergedIndices),
            minZ,
            maxZ,
            minLon,
            maxLon,
            minLat,
            maxLat
        };
    }

    // 新增高效哈希生成方法
    private generatePositionHash(v: GeoCoordinates): number {
        // 按厘米级精度处理（适用于地质坐标）
        const scale = 1000;
        const x = Math.round(v.longitude * scale);
        const y = Math.round(v.latitude * scale);
        const z = Math.round(v.altitude * scale);

        // 使用素数混合哈希 (2^24 + 2^14 + 2^3) 减少碰撞
        return (x << 24) ^ (y << 14) ^ (z << 3);
    }
}

export { StratumTile };
