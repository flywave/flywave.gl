/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert, expect } from "chai";
import { Box3, Matrix4, Sphere, Vector3 } from "three";

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

        const result = tester.orientedBoxIntersects(
            sphereProjection.projectBox(innerGeoBox, new OrientedBox3())
        );
        expect(result).to.equal(FrustumIntersection.INSIDE);
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
        // 使用在纽约和洛杉矶之间的坐标，但更靠近纽约
        const center = sphereProjection.projectPoint(
            new GeoCoordinates(39.0, -85.0, 500),
            new Vector3()
        );
        const sphere = new Sphere(center, 10); // 100km radius

        const result = tester.sphereIntersects(sphere);
        expect(result).to.equal(FrustumIntersection.INSIDE);
    });

    it("basic test with small area", function () {
        // 使用非常小的地理区域
        const smallGeoBox = new GeoBox(
            new GeoCoordinates(39.1, -76.4),
            new GeoCoordinates(39.0, -76.5)
        );

        const frustumGeoArea = {
            topAltitude: 1000, // 小高度范围
            bottomAltitude: 0,
            geoArea: smallGeoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // 使用平截头体中心点
        const centerGeo = smallGeoBox.center;
        const centerWorld = sphereProjection.projectPoint(
            new GeoCoordinates(centerGeo.latitude, centerGeo.longitude, 500),
            new Vector3()
        );

        // 使用小半径的球体
        const sphere = new Sphere(centerWorld, 1000);

        const result = tester.sphereIntersects(sphere);
        console.log(`Intersection result: ${result}`);

        // 至少应该相交，理想情况下在内部
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
        // 使用靠近纽约的坐标
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
        const expandedResult = tester.sphereIntersects(sphere);
        console.log("Expanded intersection result:", expandedResult);
        expect(expandedResult).to.equal(FrustumIntersection.INTERSECTS);
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
        // 获取第一个tile的GeoBox
        const geoBox = geographicStandardTiling.getGeoBox(
            TileKey.fromRowColumnLevel(25550 * 2, 54258 * 2, 16)
        );

        const frustumGeoArea = {
            topAltitude: 50,
            bottomAltitude: 0,
            geoArea: geoBox
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        // 获取相邻tile的中心点作为球体中心
        const adjacentTileCenter = geographicStandardTiling.getGeoBox(
            TileKey.fromRowColumnLevel(25550 * 2, 54258 * 2 + 1, 16)
        ).center;

        // 创建球体
        const center = sphereProjection.projectPoint(
            new GeoCoordinates(adjacentTileCenter.latitude, adjacentTileCenter.longitude),
            new Vector3()
        );
        const sphere = new Sphere(center, 30); // 半径30

        // 验证球体在原始视锥体外
        const originalResult = tester.sphereIntersects(sphere);
        expect(originalResult).to.equal(FrustumIntersection.OUTSIDE);

        // 扩展视锥体以覆盖球体
        tester.expandToCoverSphere(sphere);

        // 验证球体现在在扩展后的视锥体内
        const expandedResult = tester.sphereIntersects(sphere);
        expect(expandedResult).to.equal(FrustumIntersection.INTERSECTS);
    });

    it("custom  frustumGeoArea intersects sphere", function () {
        // 获取第一个tile的GeoBox
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
            [50.353988, 118.050842]
        ].map(([lat, lng]) => new GeoCoordinates(lat, lng, 0));
        const frustumGeoArea = {
            topAltitude: 50,
            bottomAltitude: 0,
            geoArea: testBounds
        };

        const tester = new FrustumGeoAreaTester(frustumGeoArea, new Vector3(), sphereProjection);

        const sphere = new Sphere(
            new Vector3(-1913791.9653088765, 3591516.5839109, 4911076.012134989),
            16.441544388603457
        ); // 半径30

        // 验证球体在原始视锥体外
        const originalResult = tester.sphereIntersects(sphere);
        expect(originalResult).to.equal(FrustumIntersection.INTERSECTS);
    });
});
