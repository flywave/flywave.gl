/* Copyright (C) 2025 flywave.gl contributors */

import { encodeRawGaussianPly } from "@flywave/flywave-gltf";
import { expect } from "chai";

const SH_C0 = 0.2820947917738781;

function attribute(value: number[], components: number): any {
    return {
        value: new Float32Array(value),
        components,
        count: value.length / components,
        componentType: 5126,
        normalized: false,
        type: components === 4 ? "VEC4" : "VEC3"
    };
}

function readPly(bytes: Uint8Array): { header: string; values: number[] } {
    const text = new TextDecoder().decode(bytes);
    const end = text.indexOf("end_header\n");
    if (end < 0) {
        throw new Error("PLY header not found");
    }
    const header = text.slice(0, end);
    const headerBytes = new TextEncoder().encode(text.slice(0, end + "end_header\n".length)).length;
    const view = new DataView(bytes.buffer, bytes.byteOffset + headerBytes);
    const values: number[] = [];
    for (let offset = 0; offset + 4 <= bytes.byteLength - headerBytes; offset += 4) {
        values.push(view.getFloat32(offset, true));
    }
    return { header, values };
}

describe("KHR_gaussian_splatting raw → PLY", function () {
    it("maps center/scale/rotation/color/opacity to 3DGS PLY conventions", function () {
        const primitive: any = {
            mode: 0,
            attributes: {
                POSITION: attribute([1, 2, 3], 3),
                _SCALE: attribute([1, 1, 2], 3),
                _ROTATION: attribute([0, 0, 0, 1], 4),
                COLOR_0: attribute([1, 0, 0, 1], 4)
            }
        };

        const { header, values } = readPly(encodeRawGaussianPly(primitive));

        expect(header).to.contain("element vertex 1");
        expect(header).to.contain("property float x");
        expect(header).to.contain("property float f_dc_2");

        // x, y, z, scale_0..2, rot_0..3, opacity, f_dc_0..2
        expect(values.slice(0, 3)).to.deep.equal([1, 2, 3]);
        expect(values[3]).to.be.closeTo(0, 1e-6);
        expect(values[4]).to.be.closeTo(0, 1e-6);
        expect(values[5]).to.be.closeTo(Math.log(2), 1e-6);
        // PLY rotation is w, x, y, z.
        expect(values.slice(6, 10)).to.deep.equal([1, 0, 0, 0]);
        // alpha 1 is clamped to the finite logit limit.
        expect(values[10]).to.equal(20);
        expect(values[11]).to.be.closeTo((1 - 0.5) / SH_C0, 1e-5);
        expect(values[12]).to.be.closeTo((0 - 0.5) / SH_C0, 1e-5);
        expect(values[13]).to.be.closeTo((0 - 0.5) / SH_C0, 1e-5);
    });

    it("uses OPACITY + SH0 and writes SH coefficients channel-major", function () {
        const primitive: any = {
            mode: 0,
            attributes: {
                POSITION: attribute([0, 0, 0], 3),
                _SCALE: attribute([1, 1, 1], 3),
                _ROTATION: attribute([0, 0, 0, 1], 4),
                _OPACITY: attribute([0.5], 1),
                SH_DEGREE_0_COEF_0: attribute([0.1, 0.2, 0.3], 3),
                SH_DEGREE_1_COEF_0: attribute([1, 2, 3], 3),
                SH_DEGREE_1_COEF_1: attribute([4, 5, 6], 3),
                SH_DEGREE_1_COEF_2: attribute([7, 8, 9], 3)
            }
        };

        const { header, values } = readPly(encodeRawGaussianPly(primitive));

        expect(header).to.contain("property float f_rest_8");
        expect(values[10]).to.be.closeTo(0, 1e-6); // logit(0.5)
        expect(values[11]).to.be.closeTo(0.1, 1e-6);
        expect(values[12]).to.be.closeTo(0.2, 1e-6);
        expect(values[13]).to.be.closeTo(0.3, 1e-6);
        // R coefficients, then G, then B.
        expect(values.slice(14, 17)).to.deep.equal([1, 4, 7]);
        expect(values.slice(17, 20)).to.deep.equal([2, 5, 8]);
        expect(values.slice(20, 23)).to.deep.equal([3, 6, 9]);
    });
});
