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

describe("B3DMLoaderTest", function () {
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

    afterEach(() => {});
});
