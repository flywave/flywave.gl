import { expect } from "chai";
import { Point3d } from "../../core-geometry";
import { RenderGraphic } from "../../render/render-graphic";
import { PrimitiveBuilder } from "../../primitives/geometry/geometry-list-builder";
import { GraphicType } from "../../render/graphic-builder";
import { Batch, Branch, GraphicsArray } from "../../render/three/graphic";
import { MeshGraphic } from "../../render/three/mesh";
import { RenderSystem } from "../../render/render-system";
import { MockRender } from "../../render/mock-render";

describe("PrimitiveBuilder", () => {

  var renderSystem: RenderSystem | undefined = undefined;

  before(async () => {   // Create a ViewState to load into a Viewport
    renderSystem = MockRender.Factory.system()
  });

  function makeShape(chordTolerance: number, pickableId?: string): RenderGraphic {
    const pickable = pickableId ? { id: pickableId } : undefined;
    const builder = new PrimitiveBuilder(renderSystem!, {
      type: GraphicType.Scene,
      computeChordTolerance: () => chordTolerance,
      pickable,
    });

    builder.addShape([new Point3d(0, 0, 0), new Point3d(1, 0, 0), new Point3d(1, 1, 0), new Point3d(0, 0, 0)]);
    return builder.finish();
  }
/**
  it("omits degenerate facets", () => {
    const branch = makeShape(0.0001) as Branch;
    expect(branch).instanceof(Branch);
    expect(branch.branch.entries.length).to.equal(1);
    expect(branch.branch.entries[0]).instanceof(MeshGraphic);

    const array = makeShape(10000.0) as GraphicsArray;
    expect(array).instanceof(GraphicsArray);
    expect(array.graphics.length).to.equal(0);
  });

  it("omits empty feature table", () => {
    const batch = makeShape(0.0001, "0x123") as Batch;
    expect(batch).instanceof(Batch);
    expect(batch.featureTable.numFeatures).to.equal(1);

    const array = makeShape(10000.0, "0x123") as GraphicsArray;
    expect(array).instanceof(GraphicsArray);
    expect(array.graphics.length).to.equal(0);
  }); */
});
