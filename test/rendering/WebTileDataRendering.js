/* Copyright (C) 2025 flywave.gl contributors */
import { sphereProjection } from "@flywave/flywave-geoutils";
import { MapView, MapViewEventNames, TextureLoader } from "@flywave/flywave-mapview";
import { RenderingTestHelper, waitForEvent } from "@flywave/flywave-test-utils";
import { WebTileDataSource } from "@flywave/flywave-webtile-datasource";
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
describe("MapView + WebTileData rendering test", function () {
    let mapView;
    afterEach(() => {
        if (mapView !== undefined) {
            mapView.dispose();
        }
    });
    async function webTileTest(options) {
        const ibct = new RenderingTestHelper(options.mochaTest, { module: "mapview" });
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        mapView = new MapView({
            canvas,
            theme: { clearColor: options.clearColor },
            preserveDrawingBuffer: true,
            pixelRatio: 1,
            projection: options.projection
        });
        const defaultLookAt = {
            target: { lat: 53.3, lng: 14.6 },
            zoomLevel: 2,
            tilt: 0,
            heading: 0
        };
        const lookAt = { ...defaultLookAt, ...options.lookAt };
        mapView.lookAt(lookAt);
        // Shutdown errors cause by firefox bug
        mapView.renderer.getContext().getShaderInfoLog = (x) => {
            return "";
        };
        const webTileDataSource = new WebTileDataSource(Object.assign({
            dataProvider: {
                getTexture: options.getTexture
            },
            name: "webtile"
        }, options.webTileOptions));
        mapView.addDataSource(webTileDataSource);
        if (options.runBeforeFinish !== undefined) {
            await options.runBeforeFinish();
        }
        await waitForEvent(mapView, MapViewEventNames.FrameComplete);
        await ibct.assertCanvasMatchesReference(canvas, options.testImageName);
    }
    it("renders webtile from loaded texture png", async function () {
        this.timeout(5000);
        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-clover",
            getTexture: (tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/wests_textures/clover.png"),
                    []
                ]);
            }
        });
    });
    it("renders webtile from loaded texture png on sphere", async function () {
        this.timeout(5000);
        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-clover-sphere",
            projection: sphereProjection,
            clearColor: "#ff0000",
            getTexture: (tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/wests_textures/clover.png"),
                    []
                ]);
            }
        });
    });
    it("renders webtile from loaded texture with opacity", async function () {
        this.timeout(5000);
        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-opacity",
            getTexture: (tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/wests_textures/clover.png"),
                    []
                ]);
            },
            webTileOptions: { renderingOptions: { opacity: 0.5 } }
        });
    });
    it("renders webtile from loaded texture with opacity on sphere", async function () {
        this.timeout(5000);
        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-opacity-sphere",
            projection: sphereProjection,
            getTexture: (tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/wests_textures/clover.png"),
                    []
                ]);
            },
            webTileOptions: { renderingOptions: { opacity: 0.5 } }
        });
    });
    it("renders webtile from loaded texture png with alpha", async function () {
        this.timeout(5000);
        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-questionmark",
            getTexture: (tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/replacementCharacter.png"),
                    []
                ]);
            }
        });
    });
    it("renders webtile from loaded texture png with alpha, with minDataLevel", async function () {
        this.timeout(5000);
        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-min-data-level",
            getTexture: (tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/replacementCharacter.png"),
                    []
                ]);
            },
            webTileOptions: { minDataLevel: 3 }
        });
    });
    it("renders webtile from loaded texture png with alpha, with minDisplayLevel", async function () {
        this.timeout(5000);
        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-min-display-level",
            getTexture: (tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/replacementCharacter.png"),
                    []
                ]);
            },
            webTileOptions: { minDisplayLevel: 3 }
        });
    });
    it("renders 3 layered webTileDataSources with renderOrder", async function () {
        this.timeout(5000);
        const runBeforeFinish = async function () {
            const webTileDataSource = new WebTileDataSource({
                dataSourceOrder: 2000,
                renderingOptions: {
                    transparent: true
                },
                minDataLevel: 3,
                dataProvider: {
                    getTexture: (tile) => {
                        return Promise.all([
                            new TextureLoader().load("../dist/resources/replacementCharacter.png"),
                            []
                        ]);
                    }
                },
                name: "webtile-transparent"
            });
            await mapView.addDataSource(webTileDataSource);
            const webTileDataSourcePavement = new WebTileDataSource({
                dataSourceOrder: 0,
                dataProvider: {
                    getTexture: (tile) => {
                        return Promise.all([
                            new TextureLoader().load("../dist/resources/wests_textures/paving.png"),
                            []
                        ]);
                    }
                },
                name: "webtile-paving"
            });
            await mapView.addDataSource(webTileDataSourcePavement);
        };
        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-layered-order",
            getTexture: (tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/wests_textures/clover.png"),
                    []
                ]);
            },
            webTileOptions: {
                renderingOptions: {
                    opacity: 0.5
                },
                dataSourceOrder: 1000,
                name: "webtile-clover"
            },
            runBeforeFinish
        });
    });
    it("renders 3 layered webTileDataSources with opaque on top renderOrder", async function () {
        this.timeout(5000);
        const runBeforeFinish = async function () {
            const webTileDataSource = new WebTileDataSource({
                renderingOptions: {
                    renderOrder: 3,
                    transparent: true
                },
                minDataLevel: 3,
                dataProvider: {
                    getTexture: (tile) => {
                        return Promise.all([
                            new TextureLoader().load("../dist/resources/replacementCharacter.png"),
                            []
                        ]);
                    }
                },
                name: "webtile-transparent"
            });
            await mapView.addDataSource(webTileDataSource);
            const webTileDataSourcePavement = new WebTileDataSource({
                renderingOptions: {
                    renderOrder: 2
                },
                dataProvider: {
                    getTexture: (tile) => {
                        return Promise.all([
                            new TextureLoader().load("../dist/resources/wests_textures/paving.png"),
                            []
                        ]);
                    }
                },
                name: "webtile-paving"
            });
            await mapView.addDataSource(webTileDataSourcePavement);
        };
        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-layered-render-order-opaque-top",
            getTexture: (tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/wests_textures/clover.png"),
                    []
                ]);
            },
            webTileOptions: {
                renderingOptions: {
                    opacity: 0.5,
                    renderOrder: 1
                },
                name: "webtile-clover"
            },
            runBeforeFinish
        });
    });
    it("renders webtiles on antimeridian without cracks for planar projection", async function () {
        this.timeout(5000);
        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-antimeridan-planar",
            getTexture: (tile) => {
                return Promise.all([new TextureLoader().load("../dist/resources/sea.png"), []]);
            },
            lookAt: {
                target: { lat: 64, lng: 180 },
                zoomLevel: 20
            }
        });
    });
    it("renders webtiles on antimeridian without cracks for sphere projection", async function () {
        // To be fixed.
        this.timeout(5000);
        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-antimeridan-sphere",
            getTexture: (tile) => {
                return Promise.all([new TextureLoader().load("../dist/resources/sea.png"), []]);
            },
            lookAt: {
                target: { lat: 64, lng: 180 },
                zoomLevel: 20
            },
            projection: sphereProjection
        });
    });
});
//# sourceMappingURL=WebTileDataRendering.js.map