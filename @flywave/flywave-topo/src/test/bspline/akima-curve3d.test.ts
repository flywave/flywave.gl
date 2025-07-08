import { expect } from "chai";
import { Checker } from "../checker";
import { Sample } from "../../serialization/geometry-samples";
import { AkimaCurve3d } from "../../bspline/akima-curve3d";
import { GeometryCoreTestIO } from "../geometry-core-test-io";
import { GeometryQuery } from "../../curve/geometry-query";
import { testGeometryQueryRoundTrip } from "../serialization/flat-buffer.test";
import { describe, it, test } from 'mocha';

describe("AkimaCurve3d", () => {
  it("HelloWorld", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const circlePoints = Sample.createUnitCircle(8);
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, circlePoints, 0, 0, 0);

    const curve = AkimaCurve3d.create({ fitPoints: circlePoints });
    ck.testDefined(curve);
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, curve, 0, 0, 0);
    testGeometryQueryRoundTrip(ck, curve);
    GeometryCoreTestIO.saveGeometry(allGeometry, "AkimaCurve3d", "HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });
});
