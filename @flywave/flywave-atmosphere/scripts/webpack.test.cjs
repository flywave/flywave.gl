/* Copyright (C) 2025 flywave.gl contributors */
/*
 * 单元测试 runner 配置：把 test 目录（含 clouds 子目录）下的 *.test.ts
 * 背景：包内 lib 是 extensionless ESM，mocha 直接 glob ./test/*.js 匹配不到任何
 * .ts 文件（链路断裂）；ts-node/tsx 均不可用，webpack+ts-loader 是仓库内已验证
 * 的方案（同 @flywave/flywave-3dtile-datasource/scripts/webpack.test.cjs）。
 * atmosphere 零 @flywave 运行时依赖，仅需打包 three/webgpu。
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
        fallback: { path: false }
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
