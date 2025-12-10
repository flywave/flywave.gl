/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { type MapViewOptions, MapView, MapViewPowerPreference } from "@flywave/flywave-mapview";
import * as TestUtils from "@flywave/flywave-test-utils/WebGLStub";
import * as chai from "chai";
import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import * as THREE from "three";

chai.use(chaiAsPromised);

import { GeoCoordinates, sphereProjection } from "@flywave/flywave-geoutils";

import { MapControls } from "../src/MapControls";

class MockMapControls extends MapControls {
    updateControl() {
        return super.update();
    }

    bindMapView() {}

    get getWindowEventHandler() {
        return this.windowEventHandler;
    }
}

describe("MapControls", function () {
    const sandbox = sinon.createSandbox();
    let canvas: HTMLCanvasElement;
    let mapViewOptions: MapViewOptions;
    let mapView: MapView;
    let mapControls: MockMapControls;

    // This tests runs a non mocked version of MapView, hence we need to mock some other
    // methods to get it working correctl.
    const clearColorStub: sinon.SinonStub = sandbox.stub();
    sandbox
        .stub(THREE, "WebGLRenderer")
        .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));
    canvas = document.createElement("canvas");
    canvas.width = 1033;
    canvas.height = 1793;
    mapViewOptions = {
        canvas,
        powerPreference: MapViewPowerPreference.HighPerformance,
        movementThrottleTimeout: 50,
        addBackgroundDatasource: false,
        maxVisibleDataSourceTiles: 300,
        lodMinTilePixelSize: 512,
        maxGeometryHeight: 8848,
        minGeometryHeight: 0,
        zoomLevel: 17,
        projection: sphereProjection,
        enablePolarDataSource: false,
        target: new GeoCoordinates(36.79460588481734, 117.61746743784798, 0)
    };
    mapView = new MapView(mapViewOptions);

    // it("MapControls-zoom", () => {
    //     mapControls = new MockMapControls(mapView);
    //     mapControls.getWindowEventHandler.lastMouseX = 0;
    //     mapControls.getWindowEventHandler.lastMouseY = 0;
    //     mapControls.getWindowEventHandler.lastMouseZ = 10;
    //     mapControls.updateControl();
    // });

    it("MapControls-pen", () => {
        mapControls = new MockMapControls(mapView);
        mapControls.getWindowEventHandler.lastMouseX = 0;
        mapControls.getWindowEventHandler.lastMouseY = 10;
        mapControls.getWindowEventHandler.lastMouseZ = 0;

        mapControls.getWindowEventHandler.mouseDown[0] = true;
        mapControls.updateControl();
    });

    // it("MapControls-setTo", () => {
    //     mapControls = new MockMapControls(mapView);
    //     mapControls.setTo(
    //         117.29303268304584,
    //         36.09438158158233,
    //         1345.767491420731,
    //         100,
    //         1.0622694995281203,
    //         2.5152656872467873
    //     );

    //     mapControls.updateControl();

    //     expect(mapView.camera.position).to.deep.equal(
    //         new THREE.Vector3(-2363747.5098524936, 4581043.6375223715, 3758262.5349357813)
    //     );
    //     expect(
    //         Math.abs(
    //             new THREE.Quaternion(
    //                 0.11732272366552594,
    //                 -0.23854353814835813,
    //                 0.06268147545157772,
    //                 0.9619788935078455
    //             ).angleTo(mapView.camera.quaternion)
    //         ) <= 0.0001
    //     );
    // });

    // it("MapControls-flyTo", () => {
    //     mapControls = new MockMapControls(mapView);
    //     mapControls.flyTo(
    //         117.29303268304584,
    //         36.09438158158233,
    //         1345.767491420731,
    //         100,
    //         0,
    //         1.0622694995281203,
    //         2.5152656872467873
    //     );

    //     mapControls.updateControl();
    //     mapControls.updateControl();

    //     expect(mapView.camera.position).to.deep.equal(
    //         new THREE.Vector3(-2363747.5098524936, 4581043.6375223715, 3758262.5349357813)
    //     );
    //     expect(
    //         Math.abs(
    //             new THREE.Quaternion(
    //                 0.11732272366552594,
    //                 -0.23854353814835813,
    //                 0.06268147545157772,
    //                 0.9619788935078455
    //             ).angleTo(mapView.camera.quaternion)
    //         ) <= 0.0001
    //     );
    // });

    afterEach(() => {
        // Needed to clear any `setTimeout` calls which might rely on our global stubs.
        mapView.dispose();
    });
});
