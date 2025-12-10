/* Copyright (C) 2025 flywave.gl contributors */



import { type DisplayParams } from "../../common/render/primitives/display-params";
import { MeshPrimitiveType } from "../../common/render/primitives/mesh-primitive";
import { type Range3d } from "../../core-geometry";
import { compareBooleans, compareNumbers, Dictionary } from "../../utils";
import { type GeometryList } from "../geometry/geometry-list";
import { type Geometry } from "../geometry/geometry-primitives";
import { type PolyfacePrimitive } from "../polyface";
import { type GeometryOptions, ToleranceRatio } from "../primitives";
import { type StrokesPrimitive } from "../strokes";
import { MeshBuilder, MeshEdgeCreationOptions } from "./mesh-builder";
import { type Mesh, MeshList } from "./mesh-primitives";

export class MeshBuilderMap extends Dictionary<MeshBuilderMap.Key, MeshBuilder> {
    public readonly range: Range3d;
    public readonly vertexTolerance: number;
    public readonly facetAreaTolerance: number;
    public readonly tolerance: number;
    public readonly is2d: boolean;
    public readonly options: GeometryOptions;
    private _keyOrder = 0;

    constructor(tolerance: number, range: Range3d, is2d: boolean, options: GeometryOptions) {
        super((lhs: MeshBuilderMap.Key, rhs: MeshBuilderMap.Key) => lhs.compare(rhs));
        this.tolerance = tolerance;
        this.vertexTolerance = tolerance * ToleranceRatio.vertex;
        this.facetAreaTolerance = tolerance * ToleranceRatio.facetArea;
        this.range = range;
        this.is2d = is2d;
        this.options = options;
    }

    public static createFromGeometries(
        geometries: GeometryList,
        tolerance: number,
        range: Range3d,
        is2d: boolean,
        options: GeometryOptions
    ): MeshBuilderMap {
        const map = new MeshBuilderMap(tolerance, range, is2d, options);

        for (const geom of geometries) map.loadGeometry(geom);

        return map;
    }

    public toMeshes(): MeshList {
        const meshes = new MeshList(this.range);
        for (const builder of this._values) {
            if (builder.mesh.points.length > 0) meshes.push(builder.mesh);
        }
        return meshes;
    }

    public loadGeometry(geom: Geometry): void {
        this.loadPolyfacePrimitiveList(geom);

        if (!this.options.wantSurfacesOnly) this.loadStrokePrimitiveList(geom);
    }

    public loadPolyfacePrimitiveList(geom: Geometry): void {
        const polyfaces = geom.getPolyfaces(this.tolerance);

        if (polyfaces !== undefined) {
            for (const polyface of polyfaces) this.loadIndexedPolyface(polyface);
        }
    }

    public loadIndexedPolyface(polyface: PolyfacePrimitive): void {
        const { indexedPolyface, displayParams, isPlanar } = polyface;
        const { pointCount, normalCount } = indexedPolyface;
        const { fillColor, isTextured } = displayParams;
        const textureMapping = displayParams.textureMapping;

        if (pointCount === 0) return;

        const builder = this.getBuilder(
            displayParams,
            MeshPrimitiveType.Mesh,
            normalCount > 0,
            isPlanar
        );
        const edgeOptions = new MeshEdgeCreationOptions(
            polyface.displayEdges && this.options.edges
                ? MeshEdgeCreationOptions.Type.DefaultEdges
                : MeshEdgeCreationOptions.Type.NoEdges
        );
        builder.addFromPolyface(indexedPolyface, {
            edgeOptions,
            includeParams: isTextured,
            fillColor: fillColor.tbgr,
            mappedTexture: textureMapping
        });
    }

    public loadStrokePrimitiveList(geom: Geometry): void {
        const strokes = geom.getStrokes(this.tolerance);

        if (undefined !== strokes) {
            for (const stroke of strokes) this.loadStrokesPrimitive(stroke);
        }
    }

    public loadStrokesPrimitive(strokePrimitive: StrokesPrimitive): void {
        const { displayParams, isDisjoint, isPlanar, strokes } = strokePrimitive;

        const type = isDisjoint ? MeshPrimitiveType.Point : MeshPrimitiveType.Polyline;
        const builder = this.getBuilder(displayParams, type, false, isPlanar);
        builder.addStrokePointLists(strokes, isDisjoint, displayParams.fillColor.tbgr);
    }

    public getBuilder(
        displayParams: DisplayParams,
        type: MeshPrimitiveType,
        hasNormals: boolean,
        isPlanar: boolean
    ): MeshBuilder {
        const { facetAreaTolerance, tolerance, is2d, range } = this;
        const key = this.getKey(displayParams, type, hasNormals, isPlanar);

        const quantizePositions = false;
        return this.getBuilderFromKey(key, {
            displayParams,
            type,
            range,
            quantizePositions,
            is2d,
            isPlanar,
            tolerance,
            areaTolerance: facetAreaTolerance
        });
    }

    public getKey(
        displayParams: DisplayParams,
        type: MeshPrimitiveType,
        hasNormals: boolean,
        isPlanar: boolean
    ): MeshBuilderMap.Key {
        const key = new MeshBuilderMap.Key(displayParams, type, hasNormals, isPlanar);

        if (this.options.preserveOrder) key.order = ++this._keyOrder;

        return key;
    }

    public getBuilderFromKey(key: MeshBuilderMap.Key, props: MeshBuilder.Props): MeshBuilder {
        let builder = this.get(key);
        if (undefined === builder) {
            builder = MeshBuilder.create(props);
            this.set(key, builder);
        }
        return builder;
    }
}

export namespace MeshBuilderMap {
    // eslint-disable-line no-redeclare
    export class Key {
        public order: number = 0;
        public readonly params: DisplayParams;
        public readonly type: MeshPrimitiveType;
        public readonly hasNormals: boolean;
        public readonly isPlanar: boolean;

        constructor(
            params: DisplayParams,
            type: MeshPrimitiveType,
            hasNormals: boolean,
            isPlanar: boolean
        ) {
            this.params = params;
            this.type = type;
            this.hasNormals = hasNormals;
            this.isPlanar = isPlanar;
        }

        public static createFromMesh(mesh: Mesh): Key {
            return new Key(mesh.displayParams, mesh.type, mesh.normals.length !== 0, mesh.isPlanar);
        }

        public compare(rhs: Key): number {
            let diff = compareNumbers(this.order, rhs.order);
            if (diff === 0) {
                diff = compareNumbers(this.type, rhs.type);
                if (diff === 0) {
                    diff = compareBooleans(this.isPlanar, rhs.isPlanar);
                    if (diff === 0) {
                        diff = compareBooleans(this.hasNormals, rhs.hasNormals);
                        if (diff === 0) {
                            diff = this.params.compareForMerge(rhs.params);
                        }
                    }
                }
            }

            return diff;
        }

        public equals(rhs: Key): boolean {
            return this.compare(rhs) === 0;
        }
    }
}
