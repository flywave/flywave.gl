import {
    BufferAttribute,
    BufferGeometry,
    InterleavedBufferAttribute,
    Uint8BufferAttribute
} from "three";

import { SegmentEdgeParams, SilhouetteParams } from "../../common/render/primitives/edge-params";
import { TesselatedPolyline } from "../../common/render/primitives/polyline-params";
import { dispose } from "../../utils";
import { PolylineBuffers } from "./cached-geometry";
import { MeshData } from "./mesh-data";
import { MeshGeometry } from "./mesh-geometry";
import { RenderOrder } from "./render-flags";

export class EdgeGeometry extends MeshGeometry {
    public readonly buffers: Record<string, BufferAttribute | InterleavedBufferAttribute>;
    protected readonly _indices: Uint8BufferAttribute;
    protected readonly _endPointAndQuadIndices: Uint8BufferAttribute;

    public get lutBuffers() {
        return this.buffers;
    }

    public override get asSurface() {
        return undefined;
    }

    public override get asEdge() {
        return this;
    }

    public override get asSilhouette(): SilhouetteEdgeGeometry | undefined {
        return undefined;
    }

    public static create(mesh: MeshData, edges: SegmentEdgeParams): EdgeGeometry | undefined {
        const indexBuffer = new Uint8BufferAttribute(edges.indices.data, 3);
        const endPointBuffer = new Uint8BufferAttribute(edges.endPointAndQuadIndices, 4);
        return undefined !== indexBuffer && undefined !== endPointBuffer
            ? new EdgeGeometry(indexBuffer, endPointBuffer, edges.indices.length, mesh)
            : undefined;
    }

    public dispose() {}

    public override build(): BufferGeometry {
        return new BufferGeometry();
    }

    public get renderOrder(): RenderOrder {
        return this.isPlanar ? RenderOrder.PlanarEdge : RenderOrder.Edge;
    }

    public get endPointAndQuadIndices(): Uint8BufferAttribute {
        return this._endPointAndQuadIndices;
    }

    protected constructor(
        indices: Uint8BufferAttribute,
        endPointAndQuadsIndices: Uint8BufferAttribute,
        numIndices: number,
        mesh: MeshData
    ) {
        super(mesh, numIndices);
        this.buffers = {};
        this.buffers["a_pos"] = indices;
        this.buffers["a_endPointAndQuadIndices"] = endPointAndQuadsIndices;
        this._indices = indices;
        this._endPointAndQuadIndices = endPointAndQuadsIndices;
    }
}

export class SilhouetteEdgeGeometry extends EdgeGeometry {
    private readonly _normalPairs: Uint8BufferAttribute;

    public override get asSilhouette() {
        return this;
    }

    public static createSilhouettes(
        mesh: MeshData,
        params: SilhouetteParams
    ): SilhouetteEdgeGeometry | undefined {
        const indexBuffer = new Uint8BufferAttribute(params.indices.data, 3);
        const endPointBuffer = new Uint8BufferAttribute(params.endPointAndQuadIndices, 4);
        const normalsBuffer = new Uint8BufferAttribute(params.normalPairs, 4);
        return undefined !== indexBuffer &&
            undefined !== endPointBuffer &&
            undefined !== normalsBuffer
            ? new SilhouetteEdgeGeometry(
                  indexBuffer,
                  endPointBuffer,
                  normalsBuffer,
                  params.indices.length,
                  mesh
              )
            : undefined;
    }

    public override dispose() {
        super.dispose();
    }

    public override get renderOrder(): RenderOrder {
        return this.isPlanar ? RenderOrder.PlanarSilhouette : RenderOrder.Silhouette;
    }

    public get normalPairs(): Uint8BufferAttribute {
        return this._normalPairs;
    }

    private constructor(
        indices: Uint8BufferAttribute,
        endPointAndQuadsIndices: Uint8BufferAttribute,
        normalPairs: Uint8BufferAttribute,
        numIndices: number,
        mesh: MeshData
    ) {
        super(indices, endPointAndQuadsIndices, numIndices, mesh);
        this.buffers["a_normals"] = normalPairs;
        this._normalPairs = normalPairs;
    }
}

export class PolylineEdgeGeometry extends MeshGeometry {
    private readonly _buffers: PolylineBuffers;

    public get lutBuffers() {
        return this._buffers.buffers;
    }

    public static create(
        mesh: MeshData,
        polyline: TesselatedPolyline
    ): PolylineEdgeGeometry | undefined {
        const buffers = PolylineBuffers.create(polyline);
        return undefined !== buffers
            ? new PolylineEdgeGeometry(polyline.indices.length, buffers, mesh)
            : undefined;
    }

    public dispose() {
        dispose(this._buffers);
    }

    public override build(): BufferGeometry {
        return new BufferGeometry();
    }

    public get renderOrder(): RenderOrder {
        return this.isPlanar ? RenderOrder.PlanarEdge : RenderOrder.Edge;
    }

    public override get polylineBuffers(): PolylineBuffers {
        return this._buffers;
    }

    private constructor(numIndices: number, buffers: PolylineBuffers, mesh: MeshData) {
        super(mesh, numIndices);
        this._buffers = buffers;
    }
}
