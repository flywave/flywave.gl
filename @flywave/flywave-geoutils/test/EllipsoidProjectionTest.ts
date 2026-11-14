/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { GeoBox } from "../src/coordinates/GeoBox";
import { GeoCoordinates } from "../src/coordinates/GeoCoordinates";
import { OrientedBox3 } from "../src/math/OrientedBox3";
import { ellipsoidProjection } from "../src/projection/EllipsoidProjection";

const EPSILON = 1e-6;

function makeGeoBox(
    south: number,
    west: number,
    east: number,
    north: number,
    minHeight = 1038.0808590156114,
    maxHeight = 1043.2673583391731
): GeoBox {
    return new GeoBox(
        GeoCoordinates.fromRadians(south, west, minHeight),
        GeoCoordinates.fromRadians(north, east, maxHeight)
    );
}

describe("EllipsoidProjection", function () {
    describe("projectBox", function () {
        // Real-world region bounds captured from a 3D Tiles tileset: the producer swapped the
        // latitude bounds, so `south` sits ~0.2 m north of `north`.
        const invertedSouth = 0.708850686885281;
        const invertedNorth = 0.7088489571583371;
        const west = 1.9154150800307423;
        const east = 1.9154219417451477;

        it("projects a rectangle whose latitude bounds are inverted", function () {
            const obb = new OrientedBox3();

            assert.doesNotThrow(() =>
                ellipsoidProjection.projectBox(
                    makeGeoBox(invertedSouth, west, east, invertedNorth),
                    obb
                )
            );

            assert.isTrue(Number.isFinite(obb.position.x), "position.x is finite");
            assert.isTrue(Number.isFinite(obb.position.y), "position.y is finite");
            assert.isTrue(Number.isFinite(obb.position.z), "position.z is finite");
            assert.isAbove(obb.extents.x, 0, "east/west extent is positive");
            assert.isAbove(obb.extents.y, 0, "north/south extent is positive");
            assert.isAbove(obb.extents.z, 0, "height extent is positive");
        });

        it("treats inverted latitude bounds exactly like their normalized order", function () {
            const inverted = ellipsoidProjection.projectBox(
                makeGeoBox(invertedSouth, west, east, invertedNorth),
                new OrientedBox3()
            );
            const normalized = ellipsoidProjection.projectBox(
                makeGeoBox(invertedNorth, west, east, invertedSouth),
                new OrientedBox3()
            );

            assert.approximately(inverted.position.x, normalized.position.x, EPSILON);
            assert.approximately(inverted.position.y, normalized.position.y, EPSILON);
            assert.approximately(inverted.position.z, normalized.position.z, EPSILON);
            assert.approximately(inverted.extents.x, normalized.extents.x, EPSILON);
            assert.approximately(inverted.extents.y, normalized.extents.y, EPSILON);
            assert.approximately(inverted.extents.z, normalized.extents.z, EPSILON);
        });

        it("still rejects latitude spans larger than π", function () {
            const geoBox = makeGeoBox(-2, 0, 0.1, 2);

            assert.throws(
                () => ellipsoidProjection.projectBox(geoBox, new OrientedBox3()),
                /Rectangle height must be between 0 and π/
            );
        });

        it("wraps longitude bounds crossing the antimeridian", function () {
            const geoBox = makeGeoBox(-0.1, (170 * Math.PI) / 180, (-160 * Math.PI) / 180, 0.1);
            // Bypass GeoBox's own degree-space normalization to exercise the projection guard.
            geoBox.northEast.longitude = -160;

            const obb = new OrientedBox3();

            assert.doesNotThrow(() => ellipsoidProjection.projectBox(geoBox, obb));
            assert.isTrue(Number.isFinite(obb.position.x), "position.x is finite");
            assert.isAbove(obb.extents.x, 0, "east/west extent is positive");
        });
    });
});
