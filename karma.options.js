/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
//@ts-check
const webpack = require("webpack");
const path = require("path");

/**
 * @type {import("karma").ConfigOptions}
 */
const options = function (isCoverage, isMapSdk, prefixDirectory) {
    // 更现代的覆盖率报告配置
    const reports = isCoverage
        ? {
              "text-summary": "",
              // Needed for codecov.io, includes html as well
              lcov: "coverage"
          }
        : {};

    // 文件路径前缀处理
    const fixPrefix = function (file) {
        const appendPrefix = file => {
            if (file.startsWith("**") || file.startsWith("node_modules")) {
                return file;
            }
            return path.join(prefixDirectory, file);
        };

        if (typeof file === "string") {
            return appendPrefix(file);
        }

        return {
            pattern: appendPrefix(file.pattern),
            ...(file.included !== undefined && { included: file.included }),
            ...(file.type !== undefined && { type: file.type })
        };
    };

    return {
        // 使用更现代的浏览器配置
        browsers: ["ChromeDebug"],
        customLaunchers: {
            ChromeDebug: {
                base: "Chrome",
                flags: [
                    "--module",
                    "--no-sandbox",
                    "--remote-debugging-port=9333",
                    "http://localhost:9876/debug.html"
                ]
            }
        },
        // 使用更现代的测试框架组合
        frameworks: ["webpack", "mocha"],

        // 服务器配置
        port: 9876,
        autoWatch: false,
        singleRun: true,
        concurrency: Infinity,
        restartOnFileChange: true,

        plugins: [
            "karma-mocha",
            "karma-chrome-launcher",
            "karma-webpack",
            "karma-coverage-istanbul-reporter"
        ],
        // 文件配置
        files: [
            // "@flywave/flywave-datasource-protocol/**/*.ts",
            // "@flywave/flywave-debug-datasource/**/*.ts",
            // "@flywave/flywave-geometry/**/*.ts",
            // "@flywave/flywave-fetch/**/*.ts",
            // "@flywave/flywave-utils/**/*.ts",
            // "@flywave/flywave-geoutils/**/*.ts",
            "@flywave/flywave-map-controls/**/*.ts"
            // "@flywave/flywave-mapview/**/*.ts",
            // "@flywave/flywave-mapview-decoder/**/*.ts",
            // "@flywave/flywave-materials/**/*.ts",
            // "@flywave/flywave-text-canvas/**/*.ts",
            // "@flywave/flywave-lrucache/**/*.ts",
            // "@flywave/flywave-transfer-manager/**/*.ts",
            // "@flywave/flywave-lines/**/*.ts",
            // "@flywave/flywave-test-utils/**/*.ts",
            // "@flywave/flywave-map-controls/**/*.ts",
            // "@flywave/flywave-olp-utils/**/*.ts",
            // "@flywave/flywave-webtile-datasource/**/*.ts",
            // "@flywave/flywave-vectortile-datasource/**/*.ts",
            // "@flywave/flywave-map-theme/test/DefaultThemeTest.ts"
            // {
            //     pattern: "@flywave/flywave-test-utils/test/resources/*.*",
            //     included: false
            // },
            // // This is needed to access the font resources when running the repo separate from the
            // // sdk.
            // {
            //     pattern: "node_modules/@here/harp-fontcatalog/resources/**/*.*",
            //     included: false
            // },
            // // This is needed when this repo is managed with the repo tool
            // {
            //     pattern: "@flywave/flywave-text-canvas/resources/fonts/**/*.*",
            //     included: false
            // },
            // {
            //     pattern: "@flywave/flywave-mapview/test/resources/*.*",
            //     included: false
            // }
            // {
            //     pattern: "@flywave/flywave-datasource-protocol/theme.schema.json",
            //     included: false
            // },
            // "@flywave/flywave-vectortile-datasource/src/adapters/omv/proto/vector_tile.js",
            // "@flywave/flywave-vectortile-datasource/**/*.ts",
            // "@flywave/flywave-map-theme/test/DefaultThemeTest.ts",
            // // These files are needed for the test above.
            // {
            //     pattern: "@flywave/flywave-map-theme/resources/*.json",
            //     included: false
            // }
        ].map(file => fixPrefix(file)),

        // Files that are to be excluded from the list included above.
        exclude: [
            "@flywave/**/node_modules/**/*",
            "**/test/rendering/**/*.*",
            "@flywave/flywave-test-utils/lib/rendering/RenderingTestResultServer.ts",
            "@flywave/flywave-test-utils/lib/rendering/RenderingTestResultCli.ts",
            "@flywave/flywave-datasource-protocol/test/ThemeTypingsTest.ts",
            "**/*.d.ts"
        ].map(file => fixPrefix(file)),
        client: {
            mocha: {
                reporter: "html",
                ui: "bdd",
                timeout: 5000
            }
        },
        // 预处理配置
        preprocessors: {
            "@flywave/**/*.ts": ["webpack"],
            "@flywave/flywave-vectortile-datasource/src/adapters/omv/proto/vector_tile.js": [
                "webpack"
            ]
        },

        // 报告器配置
        reporters: ["progress", "coverage-istanbul"],

        // 覆盖率配置
        coverageIstanbulReporter: {
            reports: ["html", "text-summary", "json"],

            dir: path.join(__dirname, "coverage"),

            "report-config": {
                html: {
                    // outputs the report in ./coverage/html
                    subdir: "html"
                }
            }
        },
        // 代理配置
        proxies: {
            "/@flywave": "/base/@flywave",
            "/@here/harp-fontcatalog/resources/": isMapSdk
                ? "/base/@flywave/flywave-text-canvas/resources/fonts/"
                : "/base/node_modules/@here/harp-fontcatalog/resources/"
        },

        webpack: {
            mode: "development",
            devtool: "inline-source-map",
            module: {
                rules: [
                    {
                        test: /\.ts$/,
                        use: [
                            {
                                loader: "ts-loader",
                                options: {
                                    configFile: path.resolve(__dirname, "tsconfig.karma.json"),
                                    transpileOnly: true
                                }
                            }
                        ],
                        exclude: /node_modules/
                    }
                ]
            },
            plugins: [
                new webpack.ProvidePlugin({
                    process: "process/browser",
                    Buffer: ["buffer", "Buffer"]
                })
            ],
            resolve: {
                extensions: [".ts", ".js"],
                plugins: [
                    new TsconfigPathsPlugin({
                        configFile: path.resolve(__dirname, "tsconfig.karma.json"),
                        logLevel: "INFO"
                    })
                ],
                fallback: {
                    fs: false,
                    querystring: require.resolve("querystring-es3"),
                    process: require.resolve("process/browser"),
                    os: require.resolve("os-browserify/browser"),
                    stream: require.resolve("stream-browserify")
                }
            }
        },
        // 日志级别
        logLevel: "INFO",

        // 浏览器无活动超时
        browserNoActivityTimeout: 60000,

        // 浏览器断开超时
        browserDisconnectTimeout: 10000
    };
};

module.exports = { options };
