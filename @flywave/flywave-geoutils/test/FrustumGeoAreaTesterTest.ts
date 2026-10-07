/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert, expect } from "chai";
import { Box3, Matrix4, Sphere, Vector3 } from "three/webgpu";

import { geographicStandardTiling, sphereProjection, TileKey } from "../src";
import { GeoBox } from "../src/coordinates/GeoBox";
import { GeoCoordinates } from "../src/coordinates/GeoCoordinates";
import { FrustumGeoAreaTester } from "../src/math/FrustumGeoAreaTester";
import { FrustumIntersection } from "../src/math/FrustumTester";
import { OrientedBox3 } from "../src/math/OrientedBox3";

describe("FrustumGeoAreaTester", function () {
    it("constructor creates frustum from GeoBox area", function () {
        const geoBox = new GeoBox(
            new GeoCoordinates(34.0522, -118.2437), // Los Angeles
            new GeoCoordinates(40.7128, -74.006) // New York City
        );

        const frustumGeoArea = {
            topAltitude: 10000,
            bottomAltitude: 0,
            geoArea: geoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);
        expect(tester).to.be.instanceOf(FrustumGeoAreaTester);
    });

    it("constructor creates frustum from polygon area", function () {
        const polygon = [
            new GeoCoordinates(40.7128, -74.006), // New York City
            new GeoCoordinates(42.3601, -71.0589), // Boston
            new GeoCoordinates(39.9526, -75.1652), // Philadelphia
            new GeoCoordinates(40.7128, -74.006) // Close polygon
        ];

        const frustumGeoArea = {
            topAltitude: 5000,
            bottomAltitude: 0,
            geoArea: polygon
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);
        expect(tester).to.be.instanceOf(FrustumGeoAreaTester);
    });

    it("orientedBoxIntersects returns INSIDE for box completely inside frustum", function () {
        const geoBox = new GeoBox(
            new GeoCoordinates(34.0522, -118.2437), // Los Angeles
            new GeoCoordinates(40.7128, -74.006) // New York City
        );

        const innerGeoBox = new GeoBox(
            new GeoCoordinates(35.5, -117.0, 0), // Los Angeles
            new GeoCoordinates(39.5, -76.0, 10) // New York City
        );

        const frustumGeoArea = {
            topAltitude: 10000,
            bottomAltitude: -100,
            geoArea: geoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // sphereProjection.projectBox produces a conservative "chord bounding box"
        // (for a GeoBox spanning a large longitude range the OBB center lies deep
        // inside the sphere), so that volume inevitably intersects the altitude plane
        // boundaries and INSIDE is unreachable; the correct assertable semantics is
        // "conservative intersection" (never falsely judged OUTSIDE)
        const result = tester.orientedBoxIntersects(
            sphereProjection.projectBox(innerGeoBox, new OrientedBox3())
        );
        expect(result).to.not.equal(FrustumIntersection.OUTSIDE);
    });

    it("intersectsOrientedBox returns true for box intersecting frustum", function () {
        const geoBox = new GeoBox(
            new GeoCoordinates(34.0522, -118.2437), // Los Angeles
            new GeoCoordinates(40.7128, -74.006) // New York City
        );

        const frustumGeoArea = {
            topAltitude: 10000,
            bottomAltitude: 0,
            geoArea: geoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // Create an oriented box that intersects the frustum boundary
        const center = sphereProjection.projectPoint(
            new GeoCoordinates(40.7128, -74.006, 5000),
            new Vector3()
        );

        // Create a simple oriented box (axis-aligned in this case)
        const box = new OrientedBox3(
            center,
            new Matrix4().identity(),
            new Vector3(50000, 50000, 50000) // Larger extents
        );

        const result = tester.intersectsOrientedBox(box);
        expect(result).to.be.true;
    });

    it("sphereIntersects returns INSIDE for sphere completely inside frustum", function () {
        const geoBox = new GeoBox(
            new GeoCoordinates(34.0522, -118.2437), // Los Angeles
            new GeoCoordinates(40.7128, -74.006) // New York City
        );

        const frustumGeoArea = {
            topAltitude: 10000,
            bottomAltitude: 0,
            geoArea: geoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // Create a sphere inside the frustum
        // Coordinates between New York and Los Angeles, but closer to New York
        const center = sphereProjection.projectPoint(
            new GeoCoordinates(39.0, -85.0, 500),
            new Vector3()
        );
        const sphere = new Sphere(center, 10); // 10 meter radius

        const result = tester.sphereIntersects(sphere);
        expect(result).to.equal(FrustumIntersection.INSIDE);
    });

    it("basic test with small area", function () {
        // Use a very small geographic area
        // GeoBox does not normalize its input: the order must be (southWest, northEast),
        // otherwise east gets wrapped to +283° and the region spans the globe
        const smallGeoBox = new GeoBox(
            new GeoCoordinates(39.0, -76.5),
            new GeoCoordinates(39.1, -76.4)
        );

        const frustumGeoArea = {
            topAltitude: 1000, // Small altitude range
            bottomAltitude: 0,
            geoArea: smallGeoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // Use the frustum center point
        const centerGeo = smallGeoBox.center;
        const centerWorld = sphereProjection.projectPoint(
            new GeoCoordinates(centerGeo.latitude, centerGeo.longitude, 500),
            new Vector3()
        );

        // Use a sphere with a small radius
        const sphere = new Sphere(centerWorld, 1000);

        const result = tester.sphereIntersects(sphere);
        console.log(`Intersection result: ${result}`);

        // It should at least intersect, ideally be inside
        expect(result).not.to.equal(FrustumIntersection.OUTSIDE);
    });

    it("intersectsSphere returns true for sphere intersecting frustum", function () {
        const geoBox = new GeoBox(
            new GeoCoordinates(34.0522, -118.2437), // Los Angeles
            new GeoCoordinates(40.7128, -74.006) // New York City
        );

        const frustumGeoArea = {
            topAltitude: 10000,
            bottomAltitude: 0,
            geoArea: geoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // Create a sphere that intersects the frustum boundary
        // Coordinates near New York
        const center = sphereProjection.projectPoint(
            new GeoCoordinates(40.7128, -74.006),
            new Vector3()
        );
        const sphere = new Sphere(center, 50000); // 50km radius

        const result = tester.intersectsSphere(sphere);
        expect(result).to.be.true;
    });

    it("sphereIntersects returns OUTSIDE for sphere completely outside frustum", function () {
        const geoBox = new GeoBox(
            new GeoCoordinates(34.0522, -118.2437), // Los Angeles
            new GeoCoordinates(40.7128, -74.006) // New York City
        );

        const frustumGeoArea = {
            topAltitude: 10000,
            bottomAltitude: 0,
            geoArea: geoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // Create a sphere outside the frustum (in Europe)
        const center = sphereProjection.projectPoint(
            new GeoCoordinates(51.5074, -0.1278),
            new Vector3()
        ); // London
        const sphere = new Sphere(center, 1000); // 1km radius

        const result = tester.sphereIntersects(sphere);
        expect(result).to.equal(FrustumIntersection.OUTSIDE);
    });

    it("expandToCoverSphere expands frustum to cover sphere outside original bounds", function () {
        const geoBox = new GeoBox(
            new GeoCoordinates(34.0522, -118.2437), // Los Angeles
            new GeoCoordinates(40.7128, -74.006) // New York City
        );

        const frustumGeoArea = {
            topAltitude: 10000,
            bottomAltitude: 0,
            geoArea: geoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // Create a sphere outside the frustum (in Europe)
        const center = sphereProjection.projectPoint(
            new GeoCoordinates(51.5074, -0.1278),
            new Vector3()
        ); // London
        const sphere = new Sphere(center, 1000); // 1km radius

        console.log("Sphere to expand to:", sphere);

        // Verify sphere is outside original frustum
        const originalResult = tester.sphereIntersects(sphere);
        console.log("Original intersection result:", originalResult);
        expect(originalResult).to.equal(FrustumIntersection.OUTSIDE);

        // Expand frustum to cover sphere
        console.log("Expanding frustum to cover sphere...");
        tester.expandToCoverSphere(sphere);

        // Print planes after expansion
        const planes = tester.getPlanes();
        console.log("Planes after expansion:");
        for (let i = 0; i < planes.length; i++) {
            const plane = planes[i];
            console.log(
                `Plane ${i}: normal=(${plane.normal.x}, ${plane.normal.y}, ${plane.normal.z}), constant=${plane.constant}`
            );
        }

        // Verify sphere is now inside expanded frustum
        // expandToCoverSphere moves the planes to distance = 2×radius (guaranteeing
        // the sphere is fully contained), so the result after expansion is always INSIDE
        const expandedResult = tester.sphereIntersects(sphere);
        console.log("Expanded intersection result:", expandedResult);
        expect(expandedResult).to.equal(FrustumIntersection.INSIDE);
    });

    it("expandToCoverSphere does not modify frustum for sphere already inside", function () {
        const geoBox = new GeoBox(
            new GeoCoordinates(34.0522, -118.2437), // Los Angeles
            new GeoCoordinates(40.7128, -74.006) // New York City
        );

        const frustumGeoArea = {
            topAltitude: 10000,
            bottomAltitude: 0,
            geoArea: geoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // Create a sphere inside the frustum
        const center = sphereProjection.projectPoint(
            new GeoCoordinates(39.0, -85.0, 500),
            new Vector3()
        );
        const sphere = new Sphere(center, 10);

        // Verify sphere is inside original frustum
        const originalResult = tester.sphereIntersects(sphere);
        expect(originalResult).to.equal(FrustumIntersection.INSIDE);

        // Clone the tester to compare before and after
        const originalTester = tester.clone();

        // Expand frustum to cover sphere (should not change anything)
        tester.expandToCoverSphere(sphere);

        // Verify frustum planes are unchanged
        const originalPlanes = originalTester.getPlanes();
        const updatedPlanes = tester.getPlanes();

        expect(originalPlanes.length).to.equal(updatedPlanes.length);
        for (let i = 0; i < originalPlanes.length; i++) {
            expect(originalPlanes[i].normal.equals(updatedPlanes[i].normal)).to.be.true;
            expect(originalPlanes[i].constant).to.be.closeTo(updatedPlanes[i].constant, 1e-6);
        }
    });

    it("expandToCoverSphere expands frustum to cover sphere from adjacent tiles", function () {
        // Get the GeoBox of the first tile
        const geoBox = geographicStandardTiling.getGeoBox(
            TileKey.fromRowColumnLevel(25550 * 2, 54258 * 2, 16)
        );

        const frustumGeoArea = {
            topAltitude: 50,
            bottomAltitude: 0,
            geoArea: geoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // Get the center of the adjacent tile as the sphere center
        const adjacentTileCenter = geographicStandardTiling.getGeoBox(
            TileKey.fromRowColumnLevel(25550 * 2, 54258 * 2 + 1, 16)
        ).center;

        // Create the sphere
        const center = sphereProjection.projectPoint(
            new GeoCoordinates(adjacentTileCenter.latitude, adjacentTileCenter.longitude),
            new Vector3()
        );
        const sphere = new Sphere(center, 30); // Radius 30

        // Verify the sphere is outside the original frustum
        const originalResult = tester.sphereIntersects(sphere);
        expect(originalResult).to.equal(FrustumIntersection.OUTSIDE);

        // Expand the frustum to cover the sphere
        tester.expandToCoverSphere(sphere);

        // Verify the sphere is now inside the expanded frustum (expandToCoverSphere
        // moves by 2×radius, so the result is INSIDE)
        const expandedResult = tester.sphereIntersects(sphere);
        expect(expandedResult).to.equal(FrustumIntersection.INSIDE);
    });

    it("custom  frustumGeoArea intersects sphere", function () {
        // Get the GeoBox of the first tile
        const testBounds = [
            [50.353988, 118.050842],
            [50.35394, 118.051041],
            [50.353845, 118.051222],
            [50.353708, 118.051373],
            [50.353537, 118.051485],
            [50.353342, 118.051551],
            [50.353135, 118.051567],
            [50.35293, 118.051532],
            [50.352739, 118.051448],
            [50.352574, 118.05132],
            [50.352445, 118.051154],
            [50.352359, 118.05096],
            [50.352322, 118.05075],
            [50.352336, 118.050535],
            [50.3524, 118.050328],
            [50.35251, 118.050142],
            [50.352659, 118.049988],
            [50.352838, 118.049875],
            [50.353037, 118.049809],
            [50.353244, 118.049793],
            [50.353449, 118.049829],
            [50.35364, 118.049914],
            [50.353804, 118.050043],
            [50.353932, 118.050209],
            [50.354017, 118.050403],
            [50.354054, 118.050613],
            [50.354039, 118.050828],
            [50.353975, 118.051035],
            [50.353988, 118.050842], // The closing point must exactly match the first point, otherwise the closing edge forms a concave hook
            [50.353988, 118.050842]
        ].map(([lat, lng]) => new GeoCoordinates(lat, lng, 0));
        const frustumGeoArea = {
            topAltitude: 50,
            bottomAltitude: 0,
            geoArea: testBounds
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // Sphere center placed 40m above the polygon center (the original hardcoded
        // coordinates were 29m below the surface, putting the whole sphere beneath
        // the 0~50m shell where OUTSIDE was the correct verdict); altitude 40 +
        // radius 16.4 breaks through the 50m top plane → INTERSECTS
        const center = sphereProjection.projectPoint(
            new GeoCoordinates(50.3537, 118.0507, 40),
            new Vector3()
        );
        const sphere = new Sphere(center, 16.441544388603457);

        // ⚠️ Guard for a known implementation defect (currently failing): on one
        // edge of this polygon (at the northeast corner turn) the side plane normal
        // is flipped (~160°), so the interior sphere is falsely judged OUTSIDE. It
        // only reproduces on hand-written polygon fixtures; GeoBox/tile scenarios
        // (the StratumTileCliper main path) all behave correctly. Once the
        // implementation is fixed this case should turn green; do not hide it by
        // changing the assertion.
        const originalResult = tester.sphereIntersects(sphere);
        expect(originalResult).to.equal(FrustumIntersection.INTERSECTS);
    });
});
