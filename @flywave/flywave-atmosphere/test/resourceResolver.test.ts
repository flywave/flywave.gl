/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { resolveResourceUrl } from "../src/resourceResolver";

describe("resolveResourceUrl（资源 URL 解析）", function () {
    const GLOBAL_ANY = globalThis as any;
    // Environment-agnostic stubbing: in the karma browser, window is getter-only
    // (it cannot be replaced/removed wholesale), so only its FLYWAVE_BASE_URL
    // property can be manipulated; in node (the atmosphere package test chain)
    // window is undefined and can be created temporarily.
    let savedBaseUrl: string | undefined;
    let createdWindow = false;

    beforeEach(function () {
        savedBaseUrl = GLOBAL_ANY.window?.FLYWAVE_BASE_URL;
        createdWindow = false;
        if (GLOBAL_ANY.window == null) {
            GLOBAL_ANY.window = {};
            createdWindow = true;
        }
    });

    afterEach(function () {
        if (createdWindow) {
            GLOBAL_ANY.window = undefined;
        } else if (GLOBAL_ANY.window != null) {
            if (savedBaseUrl === undefined) {
                delete GLOBAL_ANY.window.FLYWAVE_BASE_URL;
            } else {
                GLOBAL_ANY.window.FLYWAVE_BASE_URL = savedBaseUrl;
            }
        }
    });

    it("绝对 http/https/blob/data URL 原样返回（即使有 base）", function () {
        GLOBAL_ANY.window.FLYWAVE_BASE_URL = "https://cdn.example.com/";
        expect(resolveResourceUrl("https://a.com/x.png")).to.equal("https://a.com/x.png");
        expect(resolveResourceUrl("http://a.com/x.png")).to.equal("http://a.com/x.png");
        expect(resolveResourceUrl("blob:abc")).to.equal("blob:abc");
        expect(resolveResourceUrl("data:image/png;base64,AAA")).to.equal(
            "data:image/png;base64,AAA"
        );
    });

    it("无 FLYWAVE_BASE_URL：相对路径原样返回", function () {
        expect(resolveResourceUrl("resources/clouds/shape.bin")).to.equal(
            "resources/clouds/shape.bin"
        );
    });

    it("有 base：相对路径拼接，前导斜杠被剥离", function () {
        GLOBAL_ANY.window.FLYWAVE_BASE_URL = "https://cdn.example.com/base/";
        expect(resolveResourceUrl("resources/clouds/shape.bin")).to.equal(
            "https://cdn.example.com/base/resources/clouds/shape.bin"
        );
        expect(resolveResourceUrl("/resources/clouds/shape.bin")).to.equal(
            "https://cdn.example.com/base/resources/clouds/shape.bin"
        );
    });

    it("base 无尾斜杠时自动补齐", function () {
        GLOBAL_ANY.window.FLYWAVE_BASE_URL = "https://cdn.example.com/base";
        expect(resolveResourceUrl("resources/a.png")).to.equal(
            "https://cdn.example.com/base/resources/a.png"
        );
    });
});
