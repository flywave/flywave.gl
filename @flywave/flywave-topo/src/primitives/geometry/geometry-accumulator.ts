/* Copyright (C) 2025 flywave.gl contributors */



import {
    type Material,
    type Object3D,
    BufferAttribute,
    BufferGeometry,
    Color,
    DataTexture,
    Line,
    LineBasicMaterial,
    LineLoop,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Points,
    PointsMaterial,
    RGBAFormat,
    UnsignedByteType,
    Vector3
} from "three";

import {
    type AnalysisStyleDisplacement,
    Gradient,
    ImageBufferFormat,
    RenderTexture,
    TextureTransparency
} from "../../common";
import { type DisplayParams } from "../../common/render/primitives/display-params";
import {
    type IndexedPolyface,
    type Loop,
    type Path,
    type SolidPrimitive,
    Point3d,
    PolyfaceBuilder,
    Range3d,
    StrokeOptions,
    Transform
} from "../../core-geometry";
import { Texture } from "../../render/texture";
import { MeshBuilderMap } from "../mesh/mesh-builder-map";
import { MeshList } from "../mesh/mesh-primitives";
import { type GeometryOptions } from "../primitives";
import { GeometryList } from "./geometry-list";
import {
    type PrimitiveGeometryType,
    Geometry,
    PrimitiveLineStringGeometry,
    PrimitivePathGeometry,
    PrimitivePointStringGeometry,
    PrimitivePolyfaceGeometry,
    SolidPrimitiveGeometry
} from "./geometry-primitives";
import {
    type PreparedGeometry,
    type PreparedLineGeometry,
    type PreparedMeshGeometry,
    type PreparedPointGeometry,
    type PreparedSolidGeometry
} from "./prepared-geometry";

export class GeometryAccumulator {
    private readonly _transform: Transform;
    private readonly _surfacesOnly: boolean;
    private readonly _analysisDisplacement?: AnalysisStyleDisplacement;
    private readonly _viewIndependentOrigin?: Point3d;

    public readonly tileRange: Range3d;
    public readonly geometries: GeometryList = new GeometryList();

    public get surfacesOnly(): boolean {
        return this._surfacesOnly;
    }

    public get transform(): Transform {
        return this._transform;
    }

    public get isEmpty(): boolean {
        return this.geometries.isEmpty;
    }

    public get haveTransform(): boolean {
        return !this._transform.isIdentity;
    }

    public constructor(options?: {
        surfacesOnly?: boolean;
        transform?: Transform;
        tileRange?: Range3d;
        analysisStyleDisplacement?: AnalysisStyleDisplacement;
        viewIndependentOrigin?: Point3d;
    }) {
        this.tileRange = options?.tileRange ?? Range3d.createNull();
        this._surfacesOnly = options?.surfacesOnly === true;
        this._transform = options?.transform ?? Transform.createIdentity();
        this._analysisDisplacement = options?.analysisStyleDisplacement;
        this._viewIndependentOrigin = options?.viewIndependentOrigin;
    }

    public dispose(): void {
        this.clear();
    }

    private getPrimitiveRange(geom: PrimitiveGeometryType): Range3d | undefined {
        const range = new Range3d();
        geom.range(undefined, range);
        return range.isNull ? undefined : range;
    }

    private calculateTransform(transform: Transform, range: Range3d): Transform {
        if (this.haveTransform) transform = this._transform.multiplyTransformTransform(transform);

        transform.multiplyRange(range, range);
        return transform;
    }

    public addLoop(
        loop: Loop,
        displayParams: DisplayParams,
        transform: Transform,
        disjoint: boolean
    ): boolean {
        const range = this.getPrimitiveRange(loop);
        if (!range) return false;

        const xform = this.calculateTransform(transform, range);
        return this.addGeometry(
            Geometry.createFromLoop(loop, xform, range, displayParams, disjoint)
        );
    }

    public addLineString(
        pts: Point3d[],
        displayParams: DisplayParams,
        transform: Transform
    ): boolean {
        const range = Range3d.createNull();
        range.extendArray(pts, undefined);
        if (range.isNull) return false;

        const xform = this.calculateTransform(transform, range);
        return this.addGeometry(Geometry.createFromLineString(pts, xform, range, displayParams));
    }

    public addPointString(
        pts: Point3d[],
        displayParams: DisplayParams,
        transform: Transform
    ): boolean {
        const range = Range3d.createNull();
        range.extendArray(pts, undefined);
        if (range.isNull) return false;

        const xform = this.calculateTransform(transform, range);
        return this.addGeometry(Geometry.createFromPointString(pts, xform, range, displayParams));
    }

    public addPath(
        path: Path,
        displayParams: DisplayParams,
        transform: Transform,
        disjoint: boolean
    ): boolean {
        const range = this.getPrimitiveRange(path);
        if (!range) return false;

        const xform = this.calculateTransform(transform, range);
        return this.addGeometry(
            Geometry.createFromPath(path, xform, range, displayParams, disjoint)
        );
    }

    public addPolyface(
        pf: IndexedPolyface,
        displayParams: DisplayParams,
        transform: Transform
    ): boolean {
        let range;
        if (this._analysisDisplacement) {
            const channel = pf.data.auxData?.channels.find(
                x => x.name === this._analysisDisplacement!.channelName
            );
            const displacementRange = channel?.computeDisplacementRange(
                this._analysisDisplacement.scale
            );
            if (displacementRange && !displacementRange.isNull) {
                range = Range3d.createNull();
                const pt = new Point3d();
                for (let i = 0; i < pf.data.point.length; i++) {
                    pf.data.point.getPoint3dAtUncheckedPointIndex(i, pt);
                    range.extendXYZ(
                        pt.x + displacementRange.low.x,
                        pt.y + displacementRange.low.y,
                        pt.z + displacementRange.low.z
                    );
                    range.extendXYZ(
                        pt.x + displacementRange.high.x,
                        pt.y + displacementRange.high.y,
                        pt.z + displacementRange.high.z
                    );
                }
            }
        }

        if (!range && !(range = this.getPrimitiveRange(pf))) return false;

        const xform = this.calculateTransform(transform, range);
        return this.addGeometry(Geometry.createFromPolyface(pf, xform, range, displayParams));
    }

    public addSolidPrimitive(
        primitive: SolidPrimitive,
        displayParams: DisplayParams,
        transform: Transform
    ): boolean {
        const range = this.getPrimitiveRange(primitive);
        if (!range) return false;

        const xform = this.calculateTransform(transform, range);
        return this.addGeometry(
            Geometry.createFromSolidPrimitive(primitive, xform, range, displayParams)
        );
    }

    public addGeometry(geom: Geometry): boolean {
        this.geometries.push(geom);
        return true;
    }

    public clear(): void {
        this.geometries.clear();
    }

    public toMeshBuilderMap(options: GeometryOptions, tolerance: number): MeshBuilderMap {
        const { geometries } = this;

        const range = geometries.computeRange();
        const is2d = !range.isNull && range.isAlmostZeroZ;

        return MeshBuilderMap.createFromGeometries(geometries, tolerance, range, is2d, options);
    }

    public toMeshes(options: GeometryOptions, tolerance: number): MeshList {
        if (this.geometries.isEmpty) return new MeshList();

        const builderMap = this.toMeshBuilderMap(options, tolerance);
        return builderMap.toMeshes();
    }

    public saveToGraphicList(
        graphics: Object3D[],
        options: GeometryOptions,
        tolerance: number
    ): Object3D[] {
        if (this.geometries.isEmpty) return;

        // 1. 准备几何数据
        const geometries = this.prepareGeometries(options, tolerance);

        // 2. 创建 Three.js 对象
        const threeObjects = this.createThreeObjects(geometries);

        // 3. 应用坐标变换
        this.applyTransformations(threeObjects);

        // 4. 添加到结果集
        graphics.push(...threeObjects);

        return graphics;
    }

    private prepareGeometries(options: GeometryOptions, tolerance: number): PreparedGeometry[] {
        const result: PreparedGeometry[] = [];

        for (const geom of this.geometries) {
            // 使用 instanceof 进行类型判断
            if (geom instanceof PrimitivePointStringGeometry) {
                result.push(this.preparePointGeometry(geom));
            } else if (geom instanceof PrimitiveLineStringGeometry) {
                result.push(this.prepareLineStringGeometry(geom, tolerance));
            } else if (geom instanceof PrimitivePathGeometry) {
                result.push(this.preparePathGeometry(geom, tolerance));
            } else if (geom instanceof PrimitivePolyfaceGeometry) {
                result.push(this.prepareMeshGeometry(geom, options));
            } else if (geom instanceof SolidPrimitiveGeometry) {
                result.push(this.prepareSolidGeometry(geom, options));
            }
        }

        return result;
    }

    private createThreeObjects(geometries: PreparedGeometry[]): Object3D[] {
        const objects: Object3D[] = [];

        for (const geom of geometries) {
            let threeObj: Object3D;

            switch (geom.type) {
                case "point":
                    threeObj = this.createPoints(geom);
                    break;
                case "line":
                    threeObj = this.createLines(geom);
                    break;
                case "mesh":
                    threeObj = this.createMesh(geom);
                    break;
                case "solid":
                    threeObj = this.createSolid(geom);
                    break;
                default:
                    continue; // 跳过未知类型
            }

            objects.push(threeObj);
        }

        return objects;
    }

    private applyTransformations(objects: Object3D[]): void {
        if (objects.length === 0) return;

        // 预计算变换矩阵
        const transformMatrix = this._transform.isIdentity
            ? null
            : new Matrix4().fromArray(this._transform.toArray());

        const origin = this._viewIndependentOrigin
            ? new Vector3(
                  this._viewIndependentOrigin.x,
                  this._viewIndependentOrigin.y,
                  this._viewIndependentOrigin.z
              )
            : this.calculateCommonOrigin(objects);

        for (const obj of objects) {
            // 直接修改对象位置避免中间对象
            obj.position.sub(origin);

            if (transformMatrix) {
                obj.applyMatrix4(transformMatrix);
            }
        }
    }

    private calculateCommonOrigin(objects: Object3D[]): Vector3 {
        const center = new Vector3();
        let count = 0;

        for (const obj of objects) {
            obj.traverse(child => {
                if (!(child instanceof Mesh || child instanceof Line || child instanceof Points)) {
                    return;
                }

                const geometry = child.geometry;
                if (!geometry?.boundingSphere) {
                    geometry.computeBoundingSphere();
                }

                center.add(geometry.boundingSphere!.center);
                count++;
            });
        }

        return count > 0 ? center.divideScalar(count) : new Vector3();
    }

    private preparePointGeometry(geom: PrimitivePointStringGeometry): PreparedPointGeometry {
        return {
            type: "point",
            points: geom.pts,
            params: geom.displayParams
        };
    }

    private createPoints(geom: PreparedPointGeometry): Points {
        const count = geom.points.length;
        const vertices = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        // 使用直接索引访问代替forEach
        const { r, g, b, t } = geom.params.fillColor.colors;
        const colorR = r / 255;
        const colorG = g / 255;
        const colorB = b / 255;
        const opacity = t < 255 ? t / 255 : 1.0;

        for (let i = 0; i < count; i++) {
            const pt = geom.points[i];
            const base = i * 3;

            vertices[base] = pt.x;
            vertices[base + 1] = pt.y;
            vertices[base + 2] = pt.z;

            colors[base] = colorR;
            colors[base + 1] = colorG;
            colors[base + 2] = colorB;
        }

        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(vertices, 3));
        geometry.setAttribute("color", new BufferAttribute(colors, 3));

        const material = new PointsMaterial({
            size: geom.params.pointSize || 1.0,
            vertexColors: true,
            transparent: opacity < 1.0,
            opacity
        });

        return new Points(geometry, material);
    }

    // 线几何处理 ==========================================
    private prepareLineStringGeometry(
        geom: PrimitiveLineStringGeometry,
        tolerance: number
    ): PreparedLineGeometry {
        const points = geom.pts;
        const isLoop = points.length > 2 && points[0].isAlmostEqual(points[points.length - 1]);
        return {
            type: "line",
            points,
            isLoop,
            params: geom.displayParams
        };
    }

    private preparePathGeometry(
        geom: PrimitivePathGeometry,
        tolerance: number
    ): PreparedLineGeometry {
        const path = geom.path;
        const isLoop = path.isLoop();

        const facetOptions = StrokeOptions.createForCurves();
        facetOptions.chordTol = tolerance;
        const strokes = path.getPackedStrokes(facetOptions);

        const points = strokes?.getPoint3dArray() ?? [];
        geom.transform.multiplyPoint3dArrayInPlace(points);

        return {
            type: "line",
            points,
            isLoop,
            params: geom.displayParams
        };
    }

    private createLines(geom: PreparedLineGeometry): Line | LineLoop {
        const vertices = new Float32Array(geom.points.length * 3);

        geom.points.forEach((point, i) => {
            vertices[i * 3] = point.x;
            vertices[i * 3 + 1] = point.y;
            vertices[i * 3 + 2] = point.z;
        });

        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(vertices, 3));

        const { r, g, b, t } = geom.params.fillColor.colors;
        const opacity = t < 255 ? t / 255 : 1.0;

        const material = new LineBasicMaterial({
            color: new Color(r / 255, g / 255, b / 255),
            linewidth: geom.params.lineWidth || 1.0,
            transparent: opacity < 1.0,
            opacity
        });

        return geom.isLoop ? new LineLoop(geometry, material) : new Line(geometry, material);
    }

    public prepareMeshGeometry(
        geom: PrimitivePolyfaceGeometry,
        options: GeometryOptions
    ): PreparedMeshGeometry {
        const polyface = geom.polyface;

        const vertices = [];
        for (let i = 0; i < polyface.data.point.length; i++) {
            const p = polyface.data.point.getPoint3dAtUncheckedPointIndex(i);
            vertices.push([p.x, p.y, p.z]);
        }

        const normals = [];
        if (polyface.data.normal) {
            for (let i = 0; i < polyface.data.normal.length; i++) {
                const n = polyface.data.normal.getVector3dAtCheckedVectorIndex(i);
                if (n) normals.push([n.x, n.y, n.z]);
            }
        }

        const indices = this.extractTriangleIndices(polyface);

        const uvs = [];
        if (polyface.data.param) {
            for (let i = 0; i < polyface.data.param.length; i++) {
                const param = polyface.data.param.getPoint2dAtCheckedPointIndex(i);
                if (param) uvs.push([param.x, param.y]);
            }
        }

        return {
            type: "mesh",
            vertices,
            indices,
            normals,
            uvs,
            params: geom.displayParams
        };
    }

    private extractTriangleIndices(polyface: IndexedPolyface): number[] {
        const indices: number[] = [];
        const visitor = polyface.createVisitor(0);

        while (visitor.moveToNextFacet()) {
            const pointCount = visitor.pointCount;
            if (pointCount < 3) continue;

            const baseIndex = visitor.clientPointIndex(0);

            for (let i = 1; i < pointCount - 1; i++) {
                indices.push(
                    baseIndex,
                    visitor.clientPointIndex(i),
                    visitor.clientPointIndex(i + 1)
                );
            }
        }
        return indices;
    }

    private createMesh(geom: PreparedMeshGeometry): Mesh {
        const vertexCount = geom.vertices.length;
        const indexCount = geom.indices.length;

        if (vertexCount === 0 || indexCount === 0) return null;

        // 预分配内存
        const vertices = new Float32Array(vertexCount * 3);
        const indices = new Uint32Array(indexCount);
        const normals = new Float32Array(
            geom.normals.length > 0 ? geom.normals.length * 3 : vertexCount * 3
        );

        // 填充顶点数据
        for (let i = 0; i < vertexCount; i++) {
            const v = geom.vertices[i];
            const base = i * 3;
            vertices[base] = v[0];
            vertices[base + 1] = v[1];
            vertices[base + 2] = v[2];
        }

        // 填充法线数据（如果存在）
        if (geom.normals.length > 0) {
            for (let i = 0; i < geom.normals.length; i++) {
                const n = geom.normals[i];
                const base = i * 3;
                normals[base] = n[0];
                normals[base + 1] = n[1];
                normals[base + 2] = n[2];
            }
        }

        // 复制索引数据
        for (let i = 0; i < indexCount; i++) {
            indices[i] = geom.indices[i];
        }

        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(vertices, 3));
        geometry.setAttribute("normal", new BufferAttribute(normals, 3));

        // UV处理
        if (geom.uvs.length > 0) {
            const uvs = new Float32Array(geom.uvs.length * 2);
            for (let i = 0; i < geom.uvs.length; i++) {
                const uv = geom.uvs[i];
                const base = i * 2;
                uvs[base] = uv[0];
                uvs[base + 1] = uv[1];
            }
            geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
        }

        geometry.setIndex(new BufferAttribute(indices, 1));

        // 自动计算法线（如果未提供）
        if (geom.normals.length === 0) {
            geometry.computeVertexNormals();
        }

        const material = this.createMeshMaterial(geom.params);
        return new Mesh(geometry, material);
    }

    private createMeshMaterial(params: DisplayParams): Material {
        const { r, g, b, t } = params.fillColor.colors;
        const opacity = t < 255 ? t / 255 : 1.0;

        // 创建基础材质
        const material = new MeshStandardMaterial({
            color: new Color(r / 255, g / 255, b / 255),
            transparent: opacity < 1.0,
            opacity,
            roughness: 0.8,
            metalness: 0.2,
            side: params.twoSided ? 2 : 0 // 0 = FrontSide, 1 = BackSide, 2 = DoubleSide
        });

        if (params.texture) {
            const texture = params.texture.getTexture();
            if (texture) {
                material.map = texture;
            }
        }

        if (params.gradient) {
            const gradientTexture = this.getGradientTexture(params.gradient, params.maxTextureSize);
            if (gradientTexture) {
                material.map = gradientTexture.getTexture();
            }
        }

        return material;
    }

    private prepareSolidGeometry(
        geom: SolidPrimitiveGeometry,
        options: GeometryOptions
    ): PreparedSolidGeometry {
        const solidPrimitive = geom.primitive;

        const facetOptions = StrokeOptions.createForFacets();
        facetOptions.chordTol = geom.displayParams.tessellationTolerance;

        const polyfaceBuilder = PolyfaceBuilder.create(facetOptions);
        polyfaceBuilder.addGeometryQuery(solidPrimitive);

        const polyface = polyfaceBuilder.claimPolyface();

        const vertices = [];
        for (let i = 0; i < polyface.data.point.length; i++) {
            const p = polyface.data.point.getPoint3dAtUncheckedPointIndex(i);
            vertices.push([p.x, p.y, p.z]);
        }

        const normals = [];
        if (polyface.data.normal) {
            for (let i = 0; i < polyface.data.normal.length; i++) {
                const n = polyface.data.normal.getVector3dAtCheckedVectorIndex(i);
                if (n) normals.push([n.x, n.y, n.z]);
            }
        }

        const indices = this.extractTriangleIndices(polyface);

        return {
            type: "solid",
            meshData: {
                type: "mesh",
                vertices,
                indices,
                normals,
                uvs: [],
                params: geom.displayParams
            }
        };
    }

    private createSolid(geom: PreparedSolidGeometry): Mesh {
        return this.createMesh(geom.meshData);
    }

    public getGradientTexture(
        symb: Gradient.Symb,
        maxTextureSize?: number
    ): RenderTexture | undefined {
        // 设置纹理尺寸
        let width = 0x100;
        let height = 0x100;

        // 处理专题渐变模式
        if (symb.mode === Gradient.Mode.Thematic) {
            width = 1; // 每行像素相同
            height = Math.min(4096, maxTextureSize); // 限制最大高度
        }

        try {
            // 生成渐变图像
            const imageSource = symb.produceImage({
                width,
                height,
                includeThematicMargin: true
            });

            // Add null check and convert to Uint8Array
            if (!imageSource?.data) return undefined;

            // 创建 Three.js 纹理
            const texture = new DataTexture(
                imageSource.data, // Use the underlying buffer data
                imageSource.width,
                imageSource.height,
                RGBAFormat,
                UnsignedByteType
            );

            // 设置纹理属性
            texture.needsUpdate = true;
            texture.premultiplyAlpha = imageSource.format === ImageBufferFormat.Rgba;

            return new Texture({
                type: RenderTexture.Type.ThematicGradient,
                handle: texture,
                transparency:
                    imageSource.format === ImageBufferFormat.Rgba
                        ? TextureTransparency.Mixed
                        : TextureTransparency.Opaque
            });
        } catch (e) {
            return undefined;
        }
    }
}
