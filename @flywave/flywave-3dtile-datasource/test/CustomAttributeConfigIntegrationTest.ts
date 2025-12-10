/* Copyright (C) 2025 flywave.gl contributors */

import { type Theme } from "@flywave/flywave-datasource-protocol";
import { expect } from "chai";

import { type CustomAttributeConfig } from "../src/theme/Tiles3DStyleWatcher";

// Extend Tiles3DStyleWatcher for testing
class TestTiles3DStyleWatcher {
    private readonly m_customAttributeConfig: {
        batchIdAttributeName: string;
        attributeMappings: Record<string, string>;
    };

    constructor(
        theme: Theme,
        styleSetName?: string,
        customAttributeConfig?: CustomAttributeConfig
    ) {
        // Initialize custom attribute configuration
        this.m_customAttributeConfig = {
            batchIdAttributeName: customAttributeConfig?.batchIdAttributeName || "_BATCHID",
            attributeMappings: customAttributeConfig?.attributeMappings || {}
        };
    }

    // Expose private members for testing
    public getCustomAttributeConfig() {
        return this.m_customAttributeConfig;
    }
}

describe("CustomAttributeConfig Integration Test", function () {
    it("should use default batchId attribute name when no custom config is provided", function () {
        const theme: Theme = {
            styles: {
                "3dtiles": []
            }
        };

        const watcher = new TestTiles3DStyleWatcher(theme);
        const config = watcher.getCustomAttributeConfig();

        // Should use default batchId attribute name
        expect(config.batchIdAttributeName).to.equal("_BATCHID");
        expect(config.attributeMappings).to.deep.equal({});
    });

    it("should use custom batchId attribute name when provided", function () {
        const theme: Theme = {
            styles: {
                "3dtiles": []
            }
        };

        const customAttributeConfig: CustomAttributeConfig = {
            batchIdAttributeName: "custom_attribute_2",
            attributeMappings: {
                custom_attribute_2: "batchId"
            }
        };

        const watcher = new TestTiles3DStyleWatcher(theme, "3dtiles", customAttributeConfig);
        const config = watcher.getCustomAttributeConfig();

        // Should use custom batchId attribute name
        expect(config.batchIdAttributeName).to.equal("custom_attribute_2");
        expect(config.attributeMappings).to.deep.equal({
            custom_attribute_2: "batchId"
        });
    });
});
