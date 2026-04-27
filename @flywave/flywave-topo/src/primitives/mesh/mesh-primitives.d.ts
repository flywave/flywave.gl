import { type FillFlags, type MeshEdges, type MeshPolyline, type OctEncodedNormal, type PolylineFlags, type PolylineIndices, type RenderMaterial, type RenderTexture, ColorIndex, EdgeArgs, LinePixels, MeshPolylineList, PolylineEdgeArgs, QPoint3dList, SilhouetteEdgeArgs } from "../../common";
import { DisplayParams } from "../../common/render/primitives/display-params";
import { type MeshPointList, MeshPrimitiveType } from "../../common/render/primitives/mesh-primitive";
import { type Point2d, type Point3d, type Range3d, AuxChannel } from "../../core-geometry";
import { ColorMap } from "../color-map";
import { type Triangle, TriangleList } from "../primitives";
import { type VertexKeyProps } from "../vertex-key";
export interface PolylineArgs {
    colors: ColorIndex;
    width: number;
    linePixels: LinePixels;
    flags: PolylineFlags;
    points: QPoint3dList | (Point3d[] & {
        range: Range3d;
    });
    polylines: PolylineIndices[];
}
export declare namespace PolylineArgs {
    function fromMesh(mesh: Mesh): PolylineArgs | undefined;
}
export declare class MeshArgsEdges {
    edges: EdgeArgs;
    silhouettes: SilhouetteEdgeArgs;
    polylines: PolylineEdgeArgs;
    width: number;
    linePixels: LinePixels;
    clear(): void;
    get isValid(): boolean;
}
export interface MeshArgs {
    edges?: MeshArgsEdges;
    vertIndices: number[];
    points: QPoint3dList | (Point3d[] & {
        range: Range3d;
    });
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
export declare namespace MeshArgs {
    function fromMesh(mesh: Mesh): MeshArgs | undefined;
}
export declare class Mesh {
    private readonly _data;
    readonly points: MeshPointList;
    readonly normals: OctEncodedNormal[];
    readonly uvParams: Point2d[];
    readonly colorMap: ColorMap;
    colors: number[];
    edges?: MeshEdges;
    readonly type: MeshPrimitiveType;
    readonly is2d: boolean;
    readonly isPlanar: boolean;
    readonly hasBakedLighting: boolean;
    readonly isVolumeClassifier: boolean;
    displayParams: DisplayParams;
    private _auxChannels?;
    private constructor();
    static create(props: Mesh.Props): Mesh;
    get triangles(): TriangleList | undefined;
    get polylines(): MeshPolylineList | undefined;
    get auxChannels(): readonly AuxChannel[] | undefined;
    addAuxChannels(channels: readonly AuxChannel[], srcIndex: number): void;
    toMeshArgs(): MeshArgs | undefined;
    toPolylineArgs(): PolylineArgs | undefined;
    addPolyline(poly: MeshPolyline): void;
    addTriangle(triangle: Triangle): void;
    addVertex(props: VertexKeyProps): number;
}
export declare namespace Mesh {
    interface Props {
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
export declare class MeshList extends Array<Mesh> {
    readonly range?: Range3d;
    constructor(range?: Range3d);
}
