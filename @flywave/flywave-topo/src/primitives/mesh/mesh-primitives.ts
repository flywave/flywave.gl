/* Copyright (C) 2025 flywave.gl contributors */



import {
    type FillFlags,
    type MeshEdges,
    type MeshPolyline,
    type OctEncodedNormal,
    type PolylineFlags,
    type PolylineIndices,
    type RenderMaterial,
    type RenderTexture,
    ColorIndex,
    EdgeArgs,
    LinePixels,
    MeshPolylineList,
    PolylineEdgeArgs,
    PolylineTypeFlags,
    QParams3d,
    QPoint3dList,
    SilhouetteEdgeArgs
} from "../../common";
import { DisplayParams } from "../../common/render/primitives/display-params";
import {
    type MeshPointList,
    type Point3dList,
    MeshPrimitiveType
} from "../../common/render/primitives/mesh-primitive";
import {
    type Point2d,
    type Point3d,
    type Range3d,
    AuxChannel,
    AuxChannelData
} from "../../core-geometry";
import { assert } from "../../utils";
import { ColorMap } from "../color-map";
import { type Triangle, TriangleList } from "../primitives";
import { type VertexKeyProps } from "../vertex-key";

export interface PolylineArgs {
    colors: ColorIndex;
    width: number;
    linePixels: LinePixels;
    flags: PolylineFlags;
    points: QPoint3dList | (Point3d[] & { range: Range3d });
    polylines: PolylineIndices[];
}

export namespace PolylineArgs {
    export function fromMesh(mesh: Mesh): PolylineArgs | undefined {
        if (!mesh.polylines || mesh.polylines.length === 0) return undefined;

        const polylines = [];
        for (const polyline of mesh.polylines) {
            if (polyline.indices.length > 0) polylines.push(polyline.indices);
        }

        if (polylines.length === 0) return undefined;

        const flags: PolylineFlags = {
            is2d: mesh.is2d,
            isPlanar: mesh.isPlanar,
            isDisjoint: mesh.type === MeshPrimitiveType.Point
        };

        if (mesh.displayParams.regionEdgeType === DisplayParams.RegionEdgeType.Outline) {
            if (!mesh.displayParams.gradient || mesh.displayParams.gradient.isOutlined) {
                flags.type = PolylineTypeFlags.Edge;
            } else flags.type = PolylineTypeFlags.Outline;
        }

        const colors = new ColorIndex();
        mesh.colorMap.toColorIndex(colors, mesh.colors);

        return {
            width: mesh.displayParams.width,
            linePixels: mesh.displayParams.linePixels,
            flags,
            polylines,
            points: mesh.points,
            colors
        };
    }
}

export class MeshArgsEdges {
    public edges = new EdgeArgs();
    public silhouettes = new SilhouetteEdgeArgs();
    public polylines = new PolylineEdgeArgs();
    public width = 0;
    public linePixels = LinePixels.Solid;

    public clear(): void {
        this.edges.clear();
        this.silhouettes.clear();
        this.polylines.clear();
        this.width = 0;
        this.linePixels = LinePixels.Solid;
    }

    public get isValid(): boolean {
        return this.edges.isValid || this.silhouettes.isValid || this.polylines.isValid;
    }
}

export interface MeshArgs {
    edges?: MeshArgsEdges;
    vertIndices: number[];
    points: QPoint3dList | (Point3d[] & { range: Range3d });
    normals?: OctEncodedNormal[];
    colors: ColorIndex;
    fillFlags?: FillFlags;
    isPlanar?: boolean;
    is2d?: boolean;
    hasBakedLighting?: boolean;
    auxChannels?: readonly AuxChannel[];
    material?: RenderMaterial;
    textureMapping?: {
        texture: RenderTexture;
        uvParams: Point2d[];
    };
}

export namespace MeshArgs {
    export function fromMesh(mesh: Mesh): MeshArgs | undefined {
        if (!mesh.triangles || mesh.triangles.isEmpty || mesh.points.length === 0) return undefined;

        const texture = mesh.displayParams.textureMapping?.texture;
        const textureMapping =
            texture && mesh.uvParams.length > 0 ? { texture, uvParams: mesh.uvParams } : undefined;

        const colors = new ColorIndex();
        mesh.colorMap.toColorIndex(colors, mesh.colors);

        let edges;
        if (mesh.edges) {
            edges = new MeshArgsEdges();
            edges.width = mesh.displayParams.width;
            edges.linePixels = mesh.displayParams.linePixels;
            edges.edges.init(mesh.edges);
            edges.silhouettes.init(mesh.edges);

            const polylines = [];
            for (const meshPolyline of mesh.edges.polylines) {
                if (meshPolyline.indices.length > 0) polylines.push(meshPolyline.indices);
            }

            edges.polylines.init(polylines);
        }

        return {
            vertIndices: mesh.triangles.indices,
            points: mesh.points,
            normals:
                !mesh.displayParams.ignoreLighting && mesh.normals.length > 0
                    ? mesh.normals
                    : undefined,
            textureMapping,
            colors,
            material: mesh.displayParams.material,
            fillFlags: mesh.displayParams.fillFlags,
            isPlanar: mesh.isPlanar,
            is2d: mesh.is2d,
            hasBakedLighting: mesh.hasBakedLighting === true,
            edges,
            auxChannels: mesh.auxChannels
        };
    }
}

export class Mesh {
    private readonly _data: TriangleList | MeshPolylineList;
    public readonly points: MeshPointList;
    public readonly normals: OctEncodedNormal[] = [];
    public readonly uvParams: Point2d[] = [];
    public readonly colorMap: ColorMap = new ColorMap();
    public colors: number[] = [];
    public edges?: MeshEdges;
    public readonly type: MeshPrimitiveType;
    public readonly is2d: boolean;
    public readonly isPlanar: boolean;
    public readonly hasBakedLighting: boolean;
    public readonly isVolumeClassifier: boolean;
    public displayParams: DisplayParams;
    private _auxChannels?: AuxChannel[];

    private constructor(props: Mesh.Props) {
        const { displayParams, type, range, is2d, isPlanar } = props;
        this._data = MeshPrimitiveType.Mesh === type ? new TriangleList() : new MeshPolylineList();
        this.displayParams = displayParams;
        this.type = type;
        this.is2d = is2d;
        this.isPlanar = isPlanar;
        this.hasBakedLighting = props.hasBakedLighting === true;
        this.isVolumeClassifier = props.isVolumeClassifier === true;
        if (props.quantizePositions) {
            this.points = new QPoint3dList(QParams3d.fromRange(range));
        } else {
            const points = [] as unknown as Point3dList;
            points.range = range;
            const center = range.center;
            points.add = (pt: Point3d) => {
                points.push(pt.minus(center));
            };
            this.points = points;
        }
    }

    public static create(props: Mesh.Props): Mesh {
        return new Mesh(props);
    }

    public get triangles(): TriangleList | undefined {
        return MeshPrimitiveType.Mesh === this.type ? (this._data as TriangleList) : undefined;
    }

    public get polylines(): MeshPolylineList | undefined {
        return MeshPrimitiveType.Mesh !== this.type ? (this._data as MeshPolylineList) : undefined;
    }

    public get auxChannels(): readonly AuxChannel[] | undefined {
        return this._auxChannels;
    }

    public addAuxChannels(channels: readonly AuxChannel[], srcIndex: number): void {
        if (this._auxChannels) {
            if (this._auxChannels.length !== channels.length) return;

            for (let i = 0; i < channels.length; i++) {
                const src = channels[i];
                const dst = this._auxChannels[i];
                if (
                    src.dataType !== dst.dataType ||
                    src.name !== dst.name ||
                    src.inputName !== dst.inputName
                ) {
                    return;
                }
            }
        }

        if (!this._auxChannels) {
            this._auxChannels = channels.map(
                x =>
                    new AuxChannel(
                        x.data.map(y => new AuxChannelData(y.input, [])),
                        x.dataType,
                        x.name,
                        x.inputName
                    )
            );
        }

        for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
            const srcChannel = channels[channelIndex];
            const dstChannel = this._auxChannels[channelIndex];
            const dstIndex = dstChannel.valueCount;
            for (let dataIndex = 0; dataIndex < srcChannel.data.length; dataIndex++) {
                const dstData = dstChannel.data[dataIndex];
                dstData.copyValues(
                    srcChannel.data[dataIndex],
                    dstIndex,
                    srcIndex,
                    dstChannel.entriesPerValue
                );
            }
        }
    }

    public toMeshArgs(): MeshArgs | undefined {
        return MeshArgs.fromMesh(this);
    }

    public toPolylineArgs(): PolylineArgs | undefined {
        return PolylineArgs.fromMesh(this);
    }

    public addPolyline(poly: MeshPolyline): void {
        const { type, polylines } = this;

        assert(MeshPrimitiveType.Polyline === type || MeshPrimitiveType.Point === type);
        assert(undefined !== polylines);

        if (MeshPrimitiveType.Polyline === type && poly.indices.length < 2) return;

        if (undefined !== polylines) polylines.push(poly);
    }

    public addTriangle(triangle: Triangle): void {
        const { triangles, type } = this;

        assert(MeshPrimitiveType.Mesh === type);
        assert(undefined !== triangles);

        if (undefined !== triangles) triangles.addTriangle(triangle);
    }

    public addVertex(props: VertexKeyProps): number {
        const { position, normal, uvParam, fillColor } = props;

        this.points.add(position);

        if (undefined !== normal) this.normals.push(normal);

        if (undefined !== uvParam) this.uvParams.push(uvParam);

        if (this.colorMap.length === 0) {
            this.colorMap.insert(fillColor);
            assert(this.colorMap.isUniform);
            assert(this.colorMap.indexOf(fillColor) === 0);
        } else if (!this.colorMap.isUniform || !this.colorMap.hasColor(fillColor)) {
            if (this.colors.length === 0) this.colors.length = this.points.length - 1;

            this.colors.push(this.colorMap.insert(fillColor));
            assert(!this.colorMap.isUniform);
        }

        return this.points.length - 1;
    }
}

export namespace Mesh {
    export interface Props {
        displayParams: DisplayParams;
        type: MeshPrimitiveType;
        range: Range3d;
        quantizePositions: boolean;
        is2d: boolean;
        isPlanar: boolean;
        hasBakedLighting?: boolean;
        isVolumeClassifier?: boolean;
    }
}

export class MeshList extends Array<Mesh> {
    public readonly range?: Range3d;
    constructor(range?: Range3d) {
        super();
        this.range = range;
    }
}
