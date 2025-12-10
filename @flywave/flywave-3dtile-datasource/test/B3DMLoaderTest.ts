/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import * as chai from "chai";
import { expect } from "chai";
const chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

import { OrientedBox3 } from "@flywave/flywave-geoutils";
import { Matrix4, Ray, Vector3 } from "three";

import { load3DTiles } from "../src/loader";

describe("Flywave3DTileRendererTest", function () {
    // it("B3DMLoaderTest-decode", async () => {
    //     let tilesLoadingManager = new TilesLoadingManager();

    //     tilesLoadingManager.setDracoDecoderPath("./draco/");

    //     let b3DMLoader = new B3DMLoader(tilesLoadingManager);
    //     let res = await fetch(
    //         "http://192.168.1.18/flywave-examples/data/UHV-transmission-lines/3dtile/16/54188/25560/data/6-153.b3dm"
    //     );
    //     let gltf = b3DMLoader.parse(await res.arrayBuffer());
    //     expect(gltf);
    // });

    // it("I3DMLoaderTest-decode", async () => {
    //     let tilesLoadingManager = new TilesLoadingManager();

    //     tilesLoadingManager.setDracoDecoderPath("./draco/");

    //     let i3DMLoader = new I3DMLoader(tilesLoadingManager);
    //     let res = await fetch(
    //         "@flywave/flywave-3dtile-render/test/data/pipe/16/54067/25734/data/0-3.i3dm"
    //     );
    //     let gltf = i3DMLoader.parse(await res.arrayBuffer());
    //     expect(gltf);
    // });

    // it("B3DMLoaderTest-decode-gltf1.1", async () => {
    //     let tilesLoadingManager = new TilesLoadingManager();

    //     tilesLoadingManager.setDracoDecoderPath("./draco/");

    //     let b3DMLoader = new B3DMLoader(tilesLoadingManager);
    //     let res = await fetch(
    //         "http://192.168.1.18/flywave-examples/data/Zhoucun/3dtile_power/16/54218/25546/data/1-0.b3dm"
    //     );
    //     let gltf = await b3DMLoader.parse(await res.arrayBuffer());
    //     expect(gltf);
    // });
    // it("B3DMLoaderTest-decode-gltf1.1", async () => {
    //     let tiles3DTileContent = await load3DTiles(
    //         "http://192.168.1.18/flywave-examples/data/Zhoucun/3dtile_power/16/54218/25546/data/1-0.b3dm",
    //         {
    //             "3d-tiles": {
    //                 loadGLTF: true
    //             }
    //         }
    //     );
    //     expect(tiles3DTileContent);
    // });

    it("B3DMLoaderTest-OrientedBox3-ray", async () => {
        const box = new OrientedBox3(
            new Vector3(-3956060.622538627, 3348881.490572872, 3717245.3665753407),
            new Matrix4().makeBasis(
                new Vector3(-0.6461047569083272, -0.7632487426130693, 0),
                new Vector3(0.44481460203780493, -0.37654412549043237, 0.812621985533615),
                new Vector3(-0.6202327086782674, 0.5250389304215586, 0.5827911363665419)
            ),
            new Vector3(2124.8667921082633, 2387.9063034160185, 175.10567135969177)
        );

        const ray = new Ray(
            new Vector3(-3958137.06605095, 3347664.752621136, 3716148.984950285),
            new Vector3(0.875282212902674, -0.4369126601378108, -0.2073363817266513).normalize()
        );

        const result = box.intersectsRay(ray);
        console.log("Intersection distance:", result);
    });

    afterEach(() => {});
});
