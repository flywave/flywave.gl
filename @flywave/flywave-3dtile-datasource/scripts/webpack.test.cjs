/* Copyright (C) 2025 flywave.gl contributors */
/*
 * 主题系统测试 runner 配置：把 test/theme/*.test.ts 打成单文件 CJS 后交给 mocha 运行。
 * 背景：包内 lib 是 extensionless ESM，mocha 直接 glob ./test/*.js 匹配不到任何 .ts
 * 文件（链路断裂）；ts-node/tsx 均不可用，webpack+ts-loader 是仓库内已验证的方案。
 */
const PKG = __dirname + "/..";
const ROOT = PKG + "/../..";
const TSLOADER =
    ROOT + "/node_modules/.pnpm/ts-loader@9.5.4_typescript@5.8.2_webpack@5.104.1/node_modules";

module.exports = {
    context: PKG,
    mode: "none",
    target: "node",
    entry: "./test/run.cjs",
    output: { path: PKG + "/test-dist", filename: "run.cjs" },
    resolve: {
        extensions: [".ts", ".js"],
        alias: {
            "@flywave/flywave-geoutils/src": PKG + "/../flywave-geoutils/src",
            "@flywave/flywave-geoutils$": PKG + "/../flywave-geoutils/src",
            "@flywave/flywave-mapview/src": PKG + "/../flywave-mapview/src",
            "@flywave/flywave-mapview$": PKG + "/../flywave-mapview/src",
            "@flywave/flywave-utils/src": PKG + "/../flywave-utils/src",
            "@flywave/flywave-utils$": PKG + "/../flywave-utils/src",
            "@flywave/flywave-draco/src": PKG + "/../flywave-draco/src",
            "@flywave/flywave-draco$": PKG + "/../flywave-draco/src",
            "@flywave/flywave-gltf/src": PKG + "/../flywave-gltf/src",
            "@flywave/flywave-gltf$": PKG + "/../flywave-gltf/src",
            "@flywave/flywave-splats/src": PKG + "/../flywave-splats/src",
            "@flywave/flywave-splats$": PKG + "/../flywave-splats/src",
            "@flywave/flywave-datasource-protocol/src": PKG + "/../flywave-datasource-protocol/src",
            "@flywave/flywave-datasource-protocol$": PKG + "/../flywave-datasource-protocol/src"
        }
    },
    resolveLoader: {
        modules: [TSLOADER, PKG + "/node_modules", ROOT + "/node_modules"]
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
                        target: "ES2022",
                        esModuleInterop: true
                    }
                }
            }
        ]
    },
    stats: "errors-warnings"
};
