import { assert, dispose } from "../../utils";
import { Point3d, Range3d } from "../../core-geometry";
import { MeshParams } from "../../common/render/primitives/mesh-params";
import { SurfaceType } from "../../common/render/primitives/surface-params";
import { EdgeGeometry, PolylineEdgeGeometry, SilhouetteEdgeGeometry } from "./edge-geometry";
import { IndexedEdgeGeometry } from "./indexed-edge-geometry";
import { SurfaceGeometry } from "./surface-geometry";
import { MeshData } from "./mesh-data";
import { Graphic } from "./graphic";
import { Primitive } from "./primitive";
import { InstanceBuffers, PatternBuffers } from "./instanced-geometry";
import { InstancedGraphicParams } from "../instanced-graphic-params";
import { RenderGeometry } from "../render-system";
import { CachedGeometry } from "./cached-geometry";

export class MeshRenderGeometry {
  public readonly data: MeshData;
  public readonly surface?: SurfaceGeometry;
  public readonly segmentEdges?: EdgeGeometry;
  public readonly silhouetteEdges?: SilhouetteEdgeGeometry;
  public readonly polylineEdges?: PolylineEdgeGeometry;
  public readonly indexedEdges?: IndexedEdgeGeometry;
  public readonly range: Range3d;

  private constructor(data: MeshData, params: MeshParams) {
    this.data = data;
    this.range = params.vertices.qparams.computeRange();
    this.surface = SurfaceGeometry.create(data, params.surface.indices);
    const edges = params.edges;
    if (!edges)
      return;

    if (edges.silhouettes)
      this.silhouetteEdges = SilhouetteEdgeGeometry.createSilhouettes(data, edges.silhouettes);

    if (edges.segments)
      this.segmentEdges = EdgeGeometry.create(data, edges.segments);

    if (edges.polylines)
      this.polylineEdges = PolylineEdgeGeometry.create(data, edges.polylines);

    if (edges.indexed)
      this.indexedEdges = IndexedEdgeGeometry.create(data, edges.indexed);
  }

  public static create(params: MeshParams, viewIndependentOrigin: Point3d | undefined): MeshRenderGeometry | undefined {
    const data = MeshData.create(params, viewIndependentOrigin);
    return data ? new this(data, params) : undefined;
  }

  public dispose() {
    dispose(this.data);
    dispose(this.surface);
    dispose(this.segmentEdges);
    dispose(this.silhouetteEdges);
    dispose(this.polylineEdges);
    dispose(this.indexedEdges);
  }
}

export class MeshGraphic extends Graphic {
  public readonly meshData: MeshData;
  private readonly _primitives: Primitive[] = [];
  private readonly _instances?: InstanceBuffers | PatternBuffers;

  public static create(geometry: MeshRenderGeometry, instances?: InstancedGraphicParams | PatternBuffers): MeshGraphic | undefined {
    let buffers;
    if (instances) {
      if (instances instanceof PatternBuffers) {
        buffers = instances;
      } else {
        const instancesRange = instances.range ?? InstanceBuffers.computeRange(geometry.range, instances.transforms, instances.transformCenter);
        buffers = InstanceBuffers.create(instances, instancesRange);
        if (!buffers)
          return undefined;
      }
    }

    return new MeshGraphic(geometry, buffers);
  }

  private addPrimitive(geometry: RenderGeometry | undefined) {
    if (!geometry)
      return;

    assert(geometry instanceof CachedGeometry);
    const primitive = Primitive.createShared(geometry, this._instances);
    if (primitive)
      this._primitives.push(primitive);
  }

  private constructor(geometry: MeshRenderGeometry, instances?: InstanceBuffers | PatternBuffers) {
    super();
    this.meshData = geometry.data;
    this._instances = instances;

    this.addPrimitive(geometry.surface);
    this.addPrimitive(geometry.segmentEdges);
    this.addPrimitive(geometry.silhouetteEdges);
    this.addPrimitive(geometry.polylineEdges);
    this.addPrimitive(geometry.indexedEdges);
  }

  public get isPickable() { return false; }

  public dispose() {
    for (const primitive of this._primitives)
      dispose(primitive);

    dispose(this.meshData);
    dispose(this._instances);
    this._primitives.length = 0;
  }

  public get surfaceType(): SurfaceType { return this.meshData.type; }
}
