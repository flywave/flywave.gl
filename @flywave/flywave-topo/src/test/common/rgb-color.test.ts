import { expect } from "chai";

import { RgbColor } from "../../common/rgb-color";

describe("RgbColor", () => {
    it("converts to hex string", () => {
        expect(new RgbColor(0, 255, 127).toHexString()).to.equal("#00ff7f");
        expect(new RgbColor(255, 254, 1).toHexString()).to.equal("#fffe01");
        expect(new RgbColor(15, 32, 138).toHexString()).to.equal("#0f208a");
    });
});
