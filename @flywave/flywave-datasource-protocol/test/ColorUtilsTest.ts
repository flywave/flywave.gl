/* Copyright (C) 2025 flywave.gl contributors */

import { assert } from "chai";

import { ColorUtils } from "../src/ColorUtils";

describe("ColorUtils", function () {
    it("support rgba in signed int range", function () {
        const encoded = ColorUtils.getHexFromRgba(0.1, 0.5, 1.0, 0.1)!;
        assert.isNumber(encoded);
        assert.isBelow(encoded, 0);

        const decodedAlpha = ColorUtils.getAlphaFromHex(encoded);
        assert.approximately(decodedAlpha, 0.1, 1 / 255);

        const decoded = ColorUtils.getRgbaFromHex(encoded);
        assert.approximately(decoded.r, 0.1, 1 / 255);
        assert.approximately(decoded.g, 0.5, 1 / 255);
        assert.approximately(decoded.b, 1.0, 1 / 255);
        assert.approximately(decoded.a, 0.1, 1 / 255);
    });
});
