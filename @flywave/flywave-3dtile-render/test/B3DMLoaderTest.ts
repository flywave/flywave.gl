/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { expect } from "chai";

chai.use(chaiAsPromised);

import { B3DMLoader } from "../src/three/B3DMLoader";
import { TilesLoadingManager } from "../src/three/TilesRenderer";
import { I3DMLoader } from "../src";

describe("Flywave3DTileRendererTest", function () {
    it("B3DMLoaderTest-decode", async () => {
        let tilesLoadingManager = new TilesLoadingManager();

        tilesLoadingManager.setDracoDecoderPath("./draco/");

        let b3DMLoader = new B3DMLoader(tilesLoadingManager);
        let res = await fetch(
            "http://192.168.1.18/flywave-examples/data/特高压输电线路/3dtile/16/54188/25560/data/6-153.b3dm"
        );
        let gltf = b3DMLoader.parse(await res.arrayBuffer());
        expect(gltf);
    });

    it("I3DMLoaderTest-decode", async () => {
        let tilesLoadingManager = new TilesLoadingManager();

        tilesLoadingManager.setDracoDecoderPath("./draco/");

        let i3DMLoader = new I3DMLoader(tilesLoadingManager);
        let res = await fetch(
            "@flywave/flywave-3dtile-render/test/data/pipe/16/54067/25734/data/0-3.i3dm"
        );
        let gltf = i3DMLoader.parse(await res.arrayBuffer());
        expect(gltf);
    });

    afterEach(() => {});
});
