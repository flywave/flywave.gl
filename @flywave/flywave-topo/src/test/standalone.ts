import { assert } from "chai";
import { Point3d } from "../geometry3d/point3d-vector3d";

// GeometryCoreTestIO.consoleLog("=========================");
// GeometryCoreTestIO.consoleLog("Standalone Output");
// GeometryCoreTestIO.consoleLog("=========================");

const point0 = Point3d.create(0, 0.001, 586);
const point1 = Point3d.create(5, 0, -192);

point1.setFrom(point0);

assert.isTrue(point0.isAlmostEqual(point1), "Points are expected to be equal");
