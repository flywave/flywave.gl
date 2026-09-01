/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

const CopyWebpackPlugin = require("copy-webpack-plugin");
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
            ChromeHeadlessNoSandbox: {
                base: "ChromeHeadless",
                flags: [
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--use-gl=angle",
                    "--use-angle=swiftshader",
                    "--enable-unsafe-swiftshader",
                    "--enable-webgl",
                    "--ignore-gpu-blocklist"
                ]
            },
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
            // "@flywave/flywave-map-controls/**/*.ts",
            { pattern: "@flywave/flywave-mbstyle-datasource/test/vendor/*.js", included: false, served: true },
            "@flywave/flywave-mbstyle-datasource/test/MBStyleCompatRenderTest.ts",
            // "@flywave/flywave-mapview/**/*.ts",
            // "@flywave/flywave-mapview-decoder/**/*.ts",
            // "@flywave/flywave-materials/**/*.ts",
            // "@flywave/flywave-text-canvas/**/*.ts",
            // "@flywave/flywave-lrucache/**/*.ts",
            // "@flywave/flywave-transfer-manager/**/*.ts",
            // "@flywave/flywave-lines/**/*.ts",
            // "@flywave/flywave-test-utils/**/*.ts",
            // "@flywave/flywave-map-controls/**/*.ts",
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
            {
                pattern: "node_modules/three/examples/jsm/libs/draco/**/*.*",
                included: false
            },
            {
                pattern: "@flywave/flywave-3dtile-render/test/data/**/*.*",
                included: false
            },
            {
                pattern: "@flywave/flywave-map-theme/resources/fonts/**/*.*",
                included: false
            },
            {
                pattern: "@flywave/flywave-mbstyle-datasource/test/render-tests/**/expected.png",
                included: false,
                served: true
            },
            {
                pattern: "@flywave/flywave-mbstyle-datasource/test/rendering/integration/**/*.*",
                included: false,
                served: true
            },
            {
                // mgl test images (addImage "./image/*.js|.png" ops) fetched
                // by the harness at runtime.
                pattern: "mapbox-gl-js/test/integration/image/*.*",
                included: false,
                served: true
            }
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
            "@flywave/flywave-test-utils/lib/rendering/RenderingTestResultServer.ts",
            "@flywave/flywave-test-utils/lib/rendering/RenderingTestResultCli.ts",
            "@flywave/flywave-datasource-protocol/test/ThemeTypingsTest.ts",
            "**/*.d.ts"
        ].map(file => fixPrefix(file)),
        client: {
            captureLogs: true,
            mocha: {
                reporter: "html",
                ui: "bdd",
                timeout: 5000
            },
            args: process.env.KARMA_ARGS ? process.env.KARMA_ARGS.split(" ") : []
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
            "/draco": "/base/node_modules/three/examples/jsm/libs/draco",
            "/@flywave": "/base/@flywave",
            "/resources/fonts/": "/base/@flywave/flywave-map-theme/resources/fonts/",
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
                // new CopyWebpackPlugin({
                //     patterns: [
                //         {
                //             from: `${__dirname}/node_modules/three/examples/jsm/libs/draco`,
                //             toType: "dir",
                //             to: "draco"
                //         }
                //     ]
                // }),
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
                    path: require.resolve("path-browserify"),
                    url: require.resolve("url/"),
                    querystring: require.resolve("querystring-es3"),
                    process: require.resolve("process/browser"),
                    os: require.resolve("os-browserify/browser"),
                    stream: require.resolve("stream-browserify")
                }
            }
        },
        // 日志级别
        logLevel: "INFO",

        // 浏览器无活动超时：§695 19 fixtures 挂起族根因是 SwiftShader
        // ~10s/帧 × 60帧 = 600s 渲染期间无 karma 活动信号 → 断连。
        // 提升到 600s 配合 maxFrames=30（350s 渲染）+ 15s FrameComplete。
        browserNoActivityTimeout: 600000,

        // 浏览器响应 ping 的超时：SwiftShader 下重负载用例（dynamic-filter 等）
        // 主线程可能偶发阻塞 60-120s，默认 60s 会误判 DISCONNECTED 整批重跑
        pingTimeout: 180000,

        // 浏览器断开超时（SwiftShader 下重负载 3D 用例可能卡顿，放宽）
        browserDisconnectTimeout: 60000,

        // 断开后自动重连次数：1（不重试）。长会话下 SwiftShader 软渲染会
        // 持续劣化（~19min 后 ping 超时，ml-0901 基线 B4/B5 实证），重试
        // 拉起的仍是同一个劣化浏览器，每次重连白烧 5-10 分钟且大概率再断
        // ——快速失败回到 runner，由它起新浏览器进程续跑剩余用例。
        browserDisconnectTolerance: 1
        // §722: karma 6.4.4 无 restartOnDisconnectedBrowser 选项（断连后剩余
        // 用例被 mocha 会话状态污染为整批跳过）——修复在 runner 层：
        // run-mbstyle-render-tests-chunked.js 的 resumeMissing 按缺失 fixture
        // 以 4 个/全新浏览器会话续跑（§695 会话级跳过的最终修复）。
    };
};

module.exports = { options };
