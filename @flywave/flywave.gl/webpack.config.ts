/* Copyright (C) 2025 flywave.gl contributors */

import * as path from "path";
import { fileURLToPath } from "url";
import type { Configuration } from "webpack";
import { createRequire } from "module";
import { merge } from "webpack-merge";
import CopyWebpackPlugin from "copy-webpack-plugin";
import {
    createDecoderConfig,
    createBrowserConfig,
    createAssetsConfig,
    FlywaveWebpackConfig
} from "@flywave/flywave-webpack-utils/scripts/WebpackConfig";

// Get current file path and directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create require function for resolving Node.js module paths
const require = createRequire(import.meta.url);

// Resolve dependency package paths
const mapThemePath = path.dirname(require.resolve("@flywave/flywave-map-theme/package.json"));
const fontResourcesPath = path.dirname(require.resolve("@here/harp-fontcatalog/package.json"));
const threeDracoPath = `${path.dirname(require.resolve("three"))}/../examples/jsm/libs/`;

/**
 * Get filename suffix based on environment mode
 * @returns File suffix string (".min.js" for production, ".js" for development)
 */
function getFilenameSuffix(): string {
    return process.env.NODE_ENV === "production" ? ".min.js" : ".js";
}

// Define configuration options
const flywaveConfig: FlywaveWebpackConfig = {
    themePath: mapThemePath,
    fontResourcesPath: fontResourcesPath,
    threeDracoPath: threeDracoPath,
    projectRoot: path.resolve(__dirname, "../../"),
    outputPath: path.resolve(__dirname, "dist"),
    enableTsconfigPaths: true
};
 
/**
 * Decoder Configuration
 * Specialized build configuration for Web Workers decoder environment
 */
const decoderConfig = merge(createDecoderConfig({
    ...flywaveConfig,
    decoderEntry: "src/DecoderBundleMain.ts"
}), {
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: `flywave-decoders${getFilenameSuffix()}`
    }
});

/**
 * Output format configuration array
 * Defines different module system output formats
 */
const outputFormats = [
    {
        name: "commonjs",
        filename: `flywave.gl.cjs${getFilenameSuffix()}`,
        library: {
            type: 'commonjs', // 或者 'commonjs', 'umd' 等
        },
    },
    {
        name: "module",
        filename: `flywave.gl.module${getFilenameSuffix()}`, 
        experiments: {
            outputModule: true
        },
        library: {
            type: 'module', // 或者 'commonjs', 'umd' 等
        },
    }
];

/**
 * Browser environment configuration array
 * Creates corresponding Webpack configurations for each output format
 */
const browserConfigs = outputFormats.map(format => {
    // Base configuration
    const configBase: Configuration = {
        entry: "./src/index.ts",
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: format.filename, 
            library: format.library
        }, 
        optimization:{
            sideEffects:false,
        },
        // External dependencies configuration to avoid bundling certain libraries
        externals: [
            {
                "three": {
                    commonjs: "three",
                    commonjs2: "three",
                    amd: "three",
                    module: "three"
                }
            }
        ],
    };

    // Merge configuration with experimental settings if they exist
    const config = format.experiments
        ? merge(createBrowserConfig(flywaveConfig), configBase, { experiments: format.experiments })
        : merge(createBrowserConfig(flywaveConfig), configBase);

    // Add copy plugin for each configuration
    const assets = createAssetsConfig(flywaveConfig);
    config.plugins = [
        new CopyWebpackPlugin({ patterns: assets })
    ];

    return config;
});

/**
 * Complete Webpack configuration array
 * Includes decoder configuration and all browser environment configurations
 */
const configs: Configuration[] = [  ...browserConfigs,decoderConfig];

// Export configuration for Webpack usage
export default configs;