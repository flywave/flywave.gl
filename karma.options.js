/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//@ts-check

const path = require("path");

/**
 * @type {import("karma").ConfigOptions}
 */
const options = function (isCoverage, isMapSdk, prefixDirectory) {
    // 更现代的覆盖率报告配置
    const coverageReporters = isCoverage
        ? [
              { type: "text-summary" },
              { type: "lcovonly", subdir: ".", file: "lcov.info" },
              { type: "html", subdir: "html" }
          ]
        : [];

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
        browsers: ["ChromeHeadlessWithDebugging"],
        customLaunchers: {
            ChromeHeadlessWithDebugging: {
                base: "ChromeHeadless",
                flags: ["--no-sandbox", "--remote-debugging-port=9333"]
            },
            ChromeDebug: {
                base: "Chrome",
                flags: [
                    "--no-sandbox",
                    "--remote-debugging-port=9333",
                    "--auto-open-devtools-for-tabs"
                ]
            }
        },

        // 使用更现代的测试框架组合
        frameworks: ["mocha", "chai", "karma-typescript"],

        // 更新插件列表
        plugins: [
            "karma-chrome-launcher",
            "karma-mocha",
            "karma-chai",
            "karma-typescript",
            "karma-coverage"
        ],

        // 服务器配置
        port: 9876,
        autoWatch: false,
        singleRun: true,
        concurrency: Infinity,
        restartOnFileChange: true,

        // 文件配置
        files: [
            // 测试文件
            "@flywave/flywave-datasource-protocol/**/*.ts",
            // "@flywave/flywave-debug-datasource/**/*.ts",
            // "@flywave/flywave-geometry/**/*.ts",
            // "@flywave/flywave-fetch/**/*.ts",
            // "@flywave/flywave-utils/**/*.ts",
            // "@flywave/flywave-geoutils/**/*.ts",
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
            // "@flywave/flywave-map-theme/test/DefaultThemeTest.ts",

            // 资源文件
            {
                pattern: "@flywave/flywave-test-utils/test/resources/*.*",
                included: false,
                served: true,
                watched: false
            },
            {
                pattern: "node_modules/@here/harp-fontcatalog/resources/**/*.*",
                included: false,
                served: true,
                watched: false
            },
            {
                pattern: "@flywave/flywave-text-canvas/resources/fonts/**/*.*",
                included: false,
                served: true,
                watched: false
            },
            {
                pattern: "@flywave/flywave-mapview/test/resources/*.*",
                included: false,
                served: true,
                watched: false
            },
            {
                pattern: "@flywave/flywave-datasource-protocol/theme.schema.json",
                included: false,
                served: true,
                watched: false
            },
            {
                pattern: "@flywave/flywave-map-theme/resources/*.json",
                included: false,
                served: true,
                watched: false
            },
            {
                pattern:
                    "@flywave/flywave-vectortile-datasource/src/adapters/omv/proto/vector_tile.js",
                type: "js",
                included: true
            }
        ].map(file => fixPrefix(file)),

        // 排除文件
        exclude: [
            "**/test/rendering/**/*.*",
            "@flywave/flywave-test-utils/src/rendering/RenderingTestResultServer.ts",
            "@flywave/flywave-test-utils/src/rendering/RenderingTestResultCli.ts",
            "@flywave/flywave-datasource-protocol/src/ThemeTypingsTest.ts",
            "**/*.d.ts"
        ].map(file => fixPrefix(file)),

        // 预处理配置
        preprocessors: {
            "@flywave/**/*.ts": ["karma-typescript"]
            // "@flywave/flywave-vectortile-datasource/src/adapters/omv/proto/vector_tile.js": [
            //     "karma-typescript"
            // ]
        },

        // 报告器配置
        reporters: ["progress", "karma-typescript"].concat(isCoverage ? ["coverage"] : []),

        // 覆盖率配置
        coverageReporter: {
            reporters: coverageReporters,
            dir: path.join(__dirname, "coverage"),
            check: {
                global: {
                    statements: 80,
                    branches: 70,
                    functions: 80,
                    lines: 80
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

        // Karma-typescript 配置
        karmaTypescriptConfig: {
            tsconfig: "./tsconfig.karma.json",
            bundlerOptions: {
                transforms: [require("karma-typescript-es6-transform")()],
                resolve: {
                    symlinks: false
                },
                exclude: ["**/webpack.*.js", "**/karma.*js", "**/node_modules/**"]
            },
            coverageOptions: {
                instrumentation: isCoverage,
                exclude: [
                    /test\//,
                    /vector_tile\.js/,
                    /\.node\.ts/,
                    /index.*\.ts/,
                    /\.tsx/,
                    /coresdk\/@flywave\/flywave-test-utils\/lib\/rendering/
                ]
            },
            reports: {
                html: "coverage",
                "text-summary": ""
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
