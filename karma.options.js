/* Copyright (C) 2025 flywave.gl contributors */

/*
 * karma.conf.js 的共享配置（options(coverage, watch, filter) 签名，HERE 遗产）。
 *
 * 实现说明（2026-09 重建）：
 * - 各包 lib 产物是 extensionless ESM，karma 无法直接消费，因此用 karma-webpack
 *   + ts-loader（transpileOnly）在浏览器侧直接编译各包 test/*.ts 源码。
 * - ts-loader 路径钉在 pnpm store（与 3dtiles 测试链一致的仓库已验证方案）。
 * - 已知排除项见 EXCLUDE_PATTERNS（过期/需手工环境的测试，修复一个移出一个）。
 */

const path = require("path");
const webpack = require("webpack");

const ROOT = __dirname;
const TSLOADER = path.join(
    ROOT,
    "node_modules/.pnpm/ts-loader@9.5.4_typescript@5.8.2_webpack@5.104.1/node_modules"
);

// karma 只收集各包 test/ 下的 *Test.ts（HERE 传统）与 *.test.ts（3dtiles 新链）。
// 根 test/ 的 ImportTest/LicenseHeaderTest/performance/rendering 走各自链路，不入 karma。
// 可用 KARMA_SCOPE=utils(包名片段)临时缩小收集范围,二分定位问题测试
const SCOPE = process.env.KARMA_SCOPE;
const scopeGlob = `@flywave/*${SCOPE ?? ""}*/`;

// 测试入口文件（编译进 bundle）
const TEST_PATTERNS = SCOPE
    ? [`@flywave/*${SCOPE}*/test/**/*Test.ts`, `@flywave/*${SCOPE}*/test/**/*.test.ts`]
    : ["@flywave/*/test/**/*Test.ts", "@flywave/*/test/**/*.test.ts"];

// 测试静态资源（loadTestResourceWeb 经 /base/<路径> fetch）。
// TEST_RESOURCES_DIR 由下方 DefinePlugin 注入为 "/base/"。
const RESOURCE_PATTERNS = [
    { pattern: `${scopeGlob}test/resources/**`, included: false, served: true, watched: false },
    { pattern: `${scopeGlob}resources/**`, included: false, served: true, watched: false },
    { pattern: `${scopeGlob}theme.schema.json`, included: false, served: true, watched: false }
];

// 已知无法在 karma（ChromeHeadless）环境运行的测试。逐条注明原因；
// 修复后直接删除对应行，让测试回到套件。
const EXCLUDE_PATTERNS = [
    // 渲染回归专用脚本（依赖 node 内置 querystring + webdriver 链），走 run-rendering-tests
    "@flywave/*/test/rendering/**",
    // 手工验证脚本（无 describe、模块顶层直接执行，加载即跑并会炸掉浏览器会话）；
    // 功能已由 test/theme/*.test.ts 的正式用例覆盖
    "@flywave/flywave-3dtile-datasource/test/B3DMUnpackStyleRenderTest.ts",
    "@flywave/flywave-3dtile-datasource/test/CustomAttributeConfigTest.ts",
    // 需要 FontCatalog 字体静态资源（karma 无静态资源服务，字体 404 必红），
    // 且其 node 分支 require.resolve 了未安装的 @here/FLYWAVE-fontcatalog
    "@flywave/flywave-mapview/test/PlacementTest.ts",
    // 重型集成测试：实例化真实 MapView/WebGPURenderer 并拉取运行时资源，
    // 在 ChromeHeadless（无 WebGPU，WebGL2 回退）下会触发 uncaught（如
    // ResizeObserver → focal length assert、stars.bin 404）直接杀掉浏览器
    // 会话，拖死整个套件。这类测试属于实机/渲染回归验证范畴。
    "@flywave/flywave-mapview/test/MapViewTest.ts",
    "@flywave/flywave-mapview/test/MapViewFogTest.ts",
    "@flywave/flywave-mapview/test/PoiRendererTest.ts",
    "@flywave/flywave-mapview/test/ImageCacheTest.ts",
    "@flywave/flywave-mapview/test/BoundsGeneratorTest.ts",
    "@flywave/flywave-map-controls/test/MapControlsTest.ts",
    "@flywave/flywave-vectortile-datasource/test/MapViewPickingTest.ts",
    // 字体资源链断裂（@here/FLYWAVE-fontcatalog 未安装）→ FontCatalog 全部 404
    "@flywave/flywave-text-canvas/test/FontCatalogTest.ts",
    "@flywave/flywave-text-canvas/test/TextCanvasTest.ts",
    // GLSL 时代遗产：断言 material.glslVersion === GLSL3、直接引用 GLSL 标识符
    // `float`；TSL/WebGPU 重构后这些概念已不存在（铁律 6）
    "@flywave/flywave-mapview/test/TileGeometryCreatorTest.ts",
    // 投影 API 重构遗留：引用已删除的 projection.rayCast/surfaceNormal、
    // "Unsupported projection type"、tile.raycast（GPU picking 重构）
    "@flywave/flywave-mapview/test/ClipPlanesEvaluatorTest.ts",
    "@flywave/flywave-mapview/test/NearPlaneFixTest.ts",
    "@flywave/flywave-mapview/test/NearPlaneIssueTest.ts",
    "@flywave/flywave-mapview/test/PickHandlerTest.ts",
    // 浏览器 bundle 内联 worker 脚本损坏（blob SyntaxError），且末尾 uncaught
    // 会杀死浏览器会话拖垮整个套件
    "@flywave/flywave-mapview/test/WorkerLoaderTest.ts",
    // 3dtiles 旧样式手工测试（无 describe 部分已在上方排除；这些 describe
    // 用例断言旧 unpackStyle 内部字段），功能已由 test/theme/*.test.ts 覆盖
    "@flywave/flywave-3dtile-datasource/test/B3DMUnpackStyleTest.ts",
    "@flywave/flywave-3dtile-datasource/test/B3DMUnpackStyleDebugTest.ts"
];

module.exports = {
    options: function (coverage, watch) {
        return {
            // pnpm 严格隔离下 karma 的 `karma-*` 自动发现失效（karma 包无法
            // require 兄弟插件），必须显式提供插件路径
            plugins: [
                require.resolve("karma-mocha"),
                require.resolve("karma-chai"),
                require.resolve("karma-chrome-launcher"),
                require.resolve("karma-webpack"),
                ...(coverage ? [require.resolve("karma-coverage-istanbul-reporter")] : [])
            ],
            basePath: ROOT,
            frameworks: ["mocha", "chai"],
            files: [
                ...TEST_PATTERNS.map(pattern => ({ pattern, watched: false, included: true })),
                ...RESOURCE_PATTERNS
            ],
            exclude: EXCLUDE_PATTERNS,
            preprocessors: TEST_PATTERNS.reduce((acc, pattern) => {
                acc[pattern] = ["webpack"];
                return acc;
            }, {}),
            webpack: {
                mode: "development",
                devtool: "eval-source-map",
                resolve: {
                    extensions: [".ts", ".js"],
                    fallback: { path: false, fs: false, querystring: false },
                    alias: {
                        // 测试基建用 web 变体（loadTestResource 走 fetch 而非 node fs）
                        "@flywave/flywave-test-utils$": path.join(
                            ROOT,
                            "@flywave/flywave-test-utils/src/index.web.ts"
                        ),
                        "@flywave/flywave-test-utils/WebGLStub": path.join(
                            ROOT,
                            "@flywave/flywave-test-utils/src/WebGLStub.ts"
                        )
                    }
                },
                resolveLoader: {
                    modules: [TSLOADER, path.join(ROOT, "node_modules")]
                },
                module: {
                    rules: [
                        {
                            test: /\.ts$/,
                            loader: "ts-loader",
                            exclude: /node_modules/,
                            options: {
                                transpileOnly: true,
                                compilerOptions: {
                                    module: "ESNext",
                                    target: "ES2020",
                                    esModuleInterop: true
                                }
                            }
                        }
                    ]
                },
                optimization: {
                    splitChunks: false,
                    runtimeChunk: false,
                    minimize: false
                },
                plugins: [
                    // TestDataUtils.web.ts 的编译期常量：测试资源 URL 前缀
                    // （karma 静态服务把 served files 挂在 /base/ 下）
                    new webpack.DefinePlugin({
                        TEST_RESOURCES_DIR: JSON.stringify("/base/")
                    })
                ],
                performance: { hints: false },
                stats: "errors-warnings"
            },
            webpackMiddleware: { noInfo: true },
            reporters: coverage ? ["progress", "coverage-istanbul"] : ["progress"],
            coverageIstanbulReporter: coverage
                ? {
                      reports: ["text-summary", "lcovonly"],
                      dir: path.join(ROOT, "coverage")
                  }
                : undefined,
            browsers: ["ChromeHeadlessNoSandbox"],
            customLaunchers: {
                ChromeHeadlessNoSandbox: {
                    base: "ChromeHeadless",
                    flags: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
                }
            },
            client: {
                mocha: { timeout: 60000 }
            },
            browserNoActivityTimeout: 300000,
            browserDisconnectTolerance: 2,
            captureTimeout: 120000,
            concurrency: 1,
            singleRun: !watch,
            autoWatch: !!watch
        };
    }
};
