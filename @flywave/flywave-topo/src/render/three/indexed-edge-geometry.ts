import {
    BufferAttribute,
    BufferGeometry,
    DataTexture,
    Texture,
    Uint8BufferAttribute,
    Uint32BufferAttribute
} from "three";

import { EdgeTable, IndexedEdgeParams } from "../../common/render/primitives/edge-params";
import { dispose, IDisposable } from "../../utils";
import { MeshData } from "./mesh-data";
import { MeshGeometry } from "./mesh-geometry";
import { RenderOrder } from "./render-flags";

export class EdgeLUT implements IDisposable {
    public readonly texture: Texture;
    public readonly numSegments: number;
    public readonly silhouettePadding: number;

    private constructor(texture: Texture, numSegments: number, silhouettePadding: number) {
        this.texture = texture;
        this.numSegments = numSegments;
        this.silhouettePadding = silhouettePadding;
    }

    public dispose(): void {
        dispose(this.texture);
    }

    public static create(table: EdgeTable): EdgeLUT | undefined {
        const texture = new DataTexture(table.data, table.width, table.height);
        return texture
            ? new EdgeLUT(texture, table.numSegments, table.silhouettePadding)
            : undefined;
    }
}

export class IndexedEdgeGeometry extends MeshGeometry {
    private readonly _buffers: Record<string, BufferAttribute>;
    private readonly _indices: Uint8BufferAttribute;
    public readonly edgeLut: EdgeLUT;

    public get lutBuffers() {
        return this._buffers;
    }

    public override get asIndexedEdge() {
        return this;
    }

    private constructor(
        mesh: MeshData,
        indices: Uint8BufferAttribute,
        numIndices: number,
        lut: EdgeLUT
    ) {
        super(mesh, numIndices);
        this.edgeLut = lut;
        this._buffers = {};

        this._buffers["a_pos"] = indices;
        this._indices = indices;
    }

    public dispose(): void {}

    public static create(
        mesh: MeshData,
        params: IndexedEdgeParams
    ): IndexedEdgeGeometry | undefined {
        const indexBuffer = new Uint32BufferAttribute(params.indices.data, 3);
        const lut = EdgeLUT.create(params.edges);
        return indexBuffer && lut
            ? new IndexedEdgeGeometry(mesh, indexBuffer, params.indices.length, lut)
            : undefined;
    }

    public override build(): BufferGeometry {
        return new BufferGeometry();
    }

    public get renderOrder() {
        return this.isPlanar ? RenderOrder.PlanarEdge : RenderOrder.Edge;
    }
}
