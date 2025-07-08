import { expect } from "chai";
import { describe, it } from "mocha";

import { AkimaCurve3d } from "../../bspline/akima-curve3d";
import { GeometryQuery } from "../../curve/geometry-query";
import { Sample } from "../../serialization/geometry-samples";
import { Checker } from "../checker";
import { GeometryCoreTestIO } from "../geometry-core-test-io";
import { testGeometryQueryRoundTrip } from "../serialization/flat-buffer.test";

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
