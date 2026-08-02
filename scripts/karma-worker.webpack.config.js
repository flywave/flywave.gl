/*
 * Webpack config to build the karma decoder-worker bundle for
 * MBStyleCompatRenderTest. Output is served by karma and passed to MapView
 * via `decoderUrl` so the mbstyle decoder runs in a real Web Worker.
 *
 * Usage: webpack --config scripts/karma-worker.webpack.config.js
 */
const path = require("path");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");

const root = path.resolve(__dirname, "..");

module.exports = {
    mode: "development",
    target: "webworker",
    entry: path.join(root, "scripts/karma-worker-entry.ts"),
    output: {
        path: path.join(root, "@flywave/flywave-mbstyle-datasource/test"),
        filename: "karma-worker.bundle.js",
        library: { type: "umd" }
    },
    devtool: "inline-source-map",
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            configFile: path.resolve(root, "tsconfig.karma.json"),
                            transpileOnly: true,
                            compilerOptions: { module: "esnext", target: "es2017" }
                        }
                    }
                ],
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: [".ts", ".js"],
        plugins: [
            new TsconfigPathsPlugin({
                configFile: path.resolve(root, "tsconfig.karma.json"),
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
    },
    stats: "errors-warnings"
};
