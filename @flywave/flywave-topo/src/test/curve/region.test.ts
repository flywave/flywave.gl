import { expect } from "chai";
import { LineSegment3d } from "../../curve/line-segment3d";
import { LineString3d } from "../../curve/line-string3d";
import { Loop } from "../../curve/loop";
import { ParityRegion } from "../../curve/parity-region";
import { UnionRegion } from "../../curve/union-region";
import { Sample } from "../../serialization/geometry-samples";
import { Checker } from "../checker";

describe("Regions", () => {
  it("UnionRegion", () => {
    const ck = new Checker();
    // const allGeometry = [];
    // GeometryCoreTestIO.saveGeometry(allGeometry, "TransformedSolids", "SweepContour");
    const region = UnionRegion.create();
    const segment = LineSegment3d.createXYZXYZ(0, 0, 0, 1, 0, 0);
    const loop = Loop.create(LineString3d.create(Sample.createRectangleXY(0, 0, 4, 3, 0)));
    ck.testFalse(region.tryAddChild(segment));
    ck.testTrue(region.tryAddChild(loop));
    ck.testPointer(region.getChild(0));
    ck.testUndefined(region.getChild(3));
    expect(ck.getNumErrors()).equals(0);
  });

  it("ParityRegion", () => {
    const ck = new Checker();
    // const allGeometry = [];
    // GeometryCoreTestIO.saveGeometry(allGeometry, "TransformedSolids", "SweepContour");
    const region = ParityRegion.create();
    const segment = LineSegment3d.createXYZXYZ(0, 0, 0, 1, 0, 0);
    const loop = Loop.create(LineString3d.create(Sample.createRectangleXY(0, 0, 4, 3, 0)));
    ck.testFalse(region.tryAddChild(segment));
    ck.testTrue(region.tryAddChild(loop));
    ck.testPointer(region.getChild(0));
    ck.testUndefined(region.getChild(3));
    expect(ck.getNumErrors()).equals(0);
  });
});
