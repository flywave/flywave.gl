/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import {
    DEFAULT_STARS_DATA_URL,
    IRRADIANCE_TEXTURE_HEIGHT,
    IRRADIANCE_TEXTURE_WIDTH,
    METER_TO_LENGTH_UNIT,
    SCATTERING_TEXTURE_DEPTH,
    SCATTERING_TEXTURE_HEIGHT,
    SCATTERING_TEXTURE_MU_S_SIZE,
    SCATTERING_TEXTURE_MU_SIZE,
    SCATTERING_TEXTURE_NU_SIZE,
    SCATTERING_TEXTURE_R_SIZE,
    SCATTERING_TEXTURE_WIDTH,
    STBN_TEXTURE_DEPTH,
    STBN_TEXTURE_HEIGHT,
    STBN_TEXTURE_WIDTH,
    TRANSMITTANCE_TEXTURE_HEIGHT,
    TRANSMITTANCE_TEXTURE_WIDTH
} from "../src/constants";

describe("atmosphere constants（LUT/纹理尺寸约定）", function () {
    it("散射 LUT 宽度 = NU × MU_S", function () {
        expect(SCATTERING_TEXTURE_NU_SIZE).to.equal(8);
        expect(SCATTERING_TEXTURE_MU_S_SIZE).to.equal(32);
        expect(SCATTERING_TEXTURE_WIDTH).to.equal(
            SCATTERING_TEXTURE_NU_SIZE * SCATTERING_TEXTURE_MU_S_SIZE
        );
        expect(SCATTERING_TEXTURE_WIDTH).to.equal(256);
        expect(SCATTERING_TEXTURE_HEIGHT).to.equal(SCATTERING_TEXTURE_MU_SIZE);
        expect(SCATTERING_TEXTURE_HEIGHT).to.equal(128);
        expect(SCATTERING_TEXTURE_DEPTH).to.equal(SCATTERING_TEXTURE_R_SIZE);
        expect(SCATTERING_TEXTURE_DEPTH).to.equal(32);
    });

    it("透射/辐照度 LUT 尺寸", function () {
        expect(TRANSMITTANCE_TEXTURE_WIDTH).to.equal(256);
        expect(TRANSMITTANCE_TEXTURE_HEIGHT).to.equal(64);
        expect(IRRADIANCE_TEXTURE_WIDTH).to.equal(64);
        expect(IRRADIANCE_TEXTURE_HEIGHT).to.equal(16);
    });

    it("STBN 噪声纹理 128×128×64", function () {
        expect(STBN_TEXTURE_WIDTH).to.equal(128);
        expect(STBN_TEXTURE_HEIGHT).to.equal(128);
        expect(STBN_TEXTURE_DEPTH).to.equal(64);
    });

    it("长度单位换算 m → km", function () {
        expect(METER_TO_LENGTH_UNIT).to.equal(0.001);
    });

    it("默认星星数据 URL（node 环境无 window，原样返回相对路径）", function () {
        expect(DEFAULT_STARS_DATA_URL).to.equal("resources/atmosphere/stars.bin");
    });
});
