/* Copyright (C) 2025 flywave.gl contributors */
import { expect } from "chai";
import * as sinon from "sinon";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import * as THREE from "three";
import { ClampedPolygon } from "../src/ClampedPolygon";
import { ClampedPolyline } from "../src/ClampedPolyline";
import { TerrainDrawControls } from "../src/TerrainDrawControls";
describe("TerrainDrawControls", function () {
    let sandbox;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
    });
    afterEach(function () {
        sandbox.restore();
    });
    describe("ClampedPolygon", function () {
        it("should create a polygon with color material", function () {
            const options = {
                positions: [
                    new GeoCoordinates(0, 0),
                    new GeoCoordinates(0, 1),
                    new GeoCoordinates(1, 1),
                    new GeoCoordinates(1, 0)
                ],
                material: new THREE.Color(0xff0000),
                opacity: 0.5
            };
            const polygon = new ClampedPolygon(options);
            expect(polygon).to.be.instanceOf(ClampedPolygon);
        });
        it("should create a polygon with texture material", function () {
            const options = {
                positions: [
                    new GeoCoordinates(0, 0),
                    new GeoCoordinates(0, 1),
                    new GeoCoordinates(1, 1),
                    new GeoCoordinates(1, 0)
                ],
                material: "test-texture.png",
                stRotation: Math.PI / 4
            };
            const polygon = new ClampedPolygon(options);
            expect(polygon).to.be.instanceOf(ClampedPolygon);
        });
        it("should create a polygon with material object", function () {
            const options = {
                positions: [
                    new GeoCoordinates(0, 0),
                    new GeoCoordinates(0, 1),
                    new GeoCoordinates(1, 1),
                    new GeoCoordinates(1, 0)
                ],
                material: {
                    color: 0x00ff00,
                    opacity: 0.8
                }
            };
            const polygon = new ClampedPolygon(options);
            expect(polygon).to.be.instanceOf(ClampedPolygon);
        });
    });
    describe("ClampedPolyline", function () {
        it("should create a polyline with color material", function () {
            const options = {
                positions: [
                    new GeoCoordinates(0, 0),
                    new GeoCoordinates(0, 1),
                    new GeoCoordinates(1, 1)
                ],
                material: new THREE.Color(0x00ff00),
                width: 2
            };
            const polyline = new ClampedPolyline(options);
            expect(polyline).to.be.instanceOf(ClampedPolyline);
        });
        it("should create a polyline with material object", function () {
            const options = {
                positions: [
                    new GeoCoordinates(0, 0),
                    new GeoCoordinates(0, 1),
                    new GeoCoordinates(1, 1)
                ],
                material: {
                    color: 0x0000ff
                },
                width: 3,
                showOutline: true,
                outlineColor: new THREE.Color(0x000000)
            };
            const polyline = new ClampedPolyline(options);
            expect(polyline).to.be.instanceOf(ClampedPolyline);
        });
    });
    describe("TerrainDrawControls", function () {
        it("should create terrain draw controls", function () {
            // 创建一个模拟的 MapView 对象
            const mockMapView = {
                scene: new THREE.Scene(),
                projection: {
                    projectPoint: (geoCoord) => new THREE.Vector3(geoCoord.longitude, geoCoord.latitude, geoCoord.altitude || 0)
                },
                elevationProvider: {
                    getHeight: (geoCoord) => 0
                }
            };
            const controls = new TerrainDrawControls(mockMapView);
            expect(controls).to.be.instanceOf(TerrainDrawControls);
            expect(controls.sceneContainer).to.be.instanceOf(THREE.Object3D);
        });
        it("should add and remove clamped polygon", function () {
            // 创建一个模拟的 MapView 对象
            const mockMapView = {
                scene: new THREE.Scene(),
                projection: {
                    projectPoint: (geoCoord) => new THREE.Vector3(geoCoord.longitude, geoCoord.latitude, geoCoord.altitude || 0)
                },
                elevationProvider: {
                    getHeight: (geoCoord) => 0
                }
            };
            const controls = new TerrainDrawControls(mockMapView);
            const polygonOptions = {
                positions: [
                    new GeoCoordinates(0, 0),
                    new GeoCoordinates(0, 1),
                    new GeoCoordinates(1, 1),
                    new GeoCoordinates(1, 0)
                ],
                material: new THREE.Color(0xff0000)
            };
            const polygon = controls.addClampedPolygon(polygonOptions);
            expect(polygon).to.be.instanceOf(ClampedPolygon);
            expect(controls['m_polygons']).to.have.lengthOf(1);
            controls.removePolygon(polygon);
            expect(controls['m_polygons']).to.have.lengthOf(0);
        });
        it("should add and remove clamped polyline", function () {
            // 创建一个模拟的 MapView 对象
            const mockMapView = {
                scene: new THREE.Scene(),
                projection: {
                    projectPoint: (geoCoord) => new THREE.Vector3(geoCoord.longitude, geoCoord.latitude, geoCoord.altitude || 0)
                },
                elevationProvider: {
                    getHeight: (geoCoord) => 0
                }
            };
            const controls = new TerrainDrawControls(mockMapView);
            const polylineOptions = {
                positions: [
                    new GeoCoordinates(0, 0),
                    new GeoCoordinates(0, 1),
                    new GeoCoordinates(1, 1)
                ],
                material: new THREE.Color(0x00ff00)
            };
            const polyline = controls.addClampedPolyline(polylineOptions);
            expect(polyline).to.be.instanceOf(ClampedPolyline);
            expect(controls['m_polylines']).to.have.lengthOf(1);
            controls.removePolyline(polyline);
            expect(controls['m_polylines']).to.have.lengthOf(0);
        });
        it("should clear all graphics", function () {
            // 创建一个模拟的 MapView 对象
            const mockMapView = {
                scene: new THREE.Scene(),
                projection: {
                    projectPoint: (geoCoord) => new THREE.Vector3(geoCoord.longitude, geoCoord.latitude, geoCoord.altitude || 0)
                },
                elevationProvider: {
                    getHeight: (geoCoord) => 0
                }
            };
            const controls = new TerrainDrawControls(mockMapView);
            const polygonOptions = {
                positions: [
                    new GeoCoordinates(0, 0),
                    new GeoCoordinates(0, 1),
                    new GeoCoordinates(1, 1),
                    new GeoCoordinates(1, 0)
                ],
                material: new THREE.Color(0xff0000)
            };
            const polylineOptions = {
                positions: [
                    new GeoCoordinates(0, 0),
                    new GeoCoordinates(0, 1),
                    new GeoCoordinates(1, 1)
                ],
                material: new THREE.Color(0x00ff00)
            };
            controls.addClampedPolygon(polygonOptions);
            controls.addClampedPolyline(polylineOptions);
            expect(controls['m_polygons']).to.have.lengthOf(1);
            expect(controls['m_polylines']).to.have.lengthOf(1);
            controls.clear();
            expect(controls['m_polygons']).to.have.lengthOf(0);
            expect(controls['m_polylines']).to.have.lengthOf(0);
        });
    });
});
//# sourceMappingURL=TerrainDrawControlsTest.js.map