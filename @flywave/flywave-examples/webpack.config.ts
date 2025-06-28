/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as webpack from "webpack";
import { merge } from "webpack-merge";
import * as path from "path";
import * as glob from "glob";
import HtmlWebpackPlugin from "html-webpack-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

const exampleFilter = process.env["FILTER_EXAMPLE"];
const prepareOnly = process.env["PREPARE_ONLY"] === "true";

const harpMapThemePath = path.dirname(require.resolve("@flywave/flywave-map-theme/package.json"));
const harpFontResourcesPath = path.dirname(require.resolve("@here/harp-fontcatalog/package.json"));

const isProduction = process.env.NODE_ENV === "production";
const harpBundleSuffix = isProduction ? ".min" : "";

const themeList = {
    default: "resources/berlin_tilezen_base.json",
    berlinDay: "resources/berlin_tilezen_base.json",
    berlinReducedDay: "resources/berlin_tilezen_day_reduced.json",
    berlinReducedNight: "resources/berlin_tilezen_night_reduced.json",
    berlinStreets: "resources/berlin_tilezen_effects_streets.json",
    berlinOutlines: "resources/berlin_tilezen_effects_outlines.json"
};

interface CacheConfig {
    type: "filesystem";
    buildDependencies: {
        config: string[];
    };
    name: string;
}

function getCacheConfig(name: string): CacheConfig | false {
    // Use a separate cache for each configuration, otherwise cache writing fails.
    return process.env.HARP_NO_HARD_SOURCE_CACHE
        ? false
        : {
              type: "filesystem",
              buildDependencies: {
                  config: [__filename]
              },
              name: "flywave-examples_" + name
          };
}

function resolveOptional(path: string, message?: string): string | undefined {
    try {
        return require.resolve(path);
    } catch (error) {
        if (!message) {
            message = "some examples may not work";
        }
        console.log(`warning: unable to find '${path}': ${message}`);
        return undefined;
    }
}

const commonConfig: webpack.Configuration = {
    context: __dirname,
    devtool: prepareOnly ? undefined : "source-map",
    externals: [
        // {
        //     three: "THREE"
        // },
        ({ context, request }, cb) => {
            return /three\.module\.js$/.test(request)
                ? cb(null, "THREE")
                : cb(undefined, undefined);
        }
    ],
    resolve: {
        extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"],
        alias: {
            "react-native": "react-native-web"
        },
        plugins: [
            new TsconfigPathsPlugin({
                configFile: path.resolve(__dirname, "./tsconfig.json"),
                logLevel: "INFO"
            })
        ],
        fallback: {
            fs: false
        }
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader",
                exclude: /node_modules/,
                options: {
                    configFile: path.join(process.cwd(), "tsconfig.json"),
                    transpileOnly: prepareOnly,
                    projectReferences: true
                }
            }
        ]
    },
    output: {
        path: path.join(process.cwd(), "dist/examples"),
        filename: "[name].bundle.js"
    },
    performance: {
        hints: false
    },
    stats: {
        all: false,
        timings: true,
        exclude: "resources/",
        errors: true,
        entrypoints: true,
        warnings: true
    },
    mode: (process.env.NODE_ENV as webpack.Configuration["mode"]) || "development",
    plugins: [
        new webpack.DefinePlugin({
            THEMES: JSON.stringify(themeList)
        })
    ]
};

const decoderConfig = merge(commonConfig, {
    target: "webworker",
    entry: {
        decoder: "./decoder/decoder.ts"
    }
});

const webpackEntries = glob
    .sync(path.join(__dirname, "./src/*.{ts,tsx}"))
    .reduce((result: Record<string, string>, entry: string) => {
        const name = path.basename(entry).replace(/.tsx?$/, "");
        if (name.startsWith("common")) {
            return result;
        }
        result[name] = entry;
        return result;
    }, {});

const htmlEntries = glob
    .sync(path.join(__dirname, "./src/*.html"))
    .reduce((result: Record<string, string>, entry: string) => {
        result[path.basename(entry).replace(/.html$/, "")] = entry;
        return result;
    }, {});

function filterExamples(pattern: string) {
    function filterEntries(entries: Record<string, string>) {
        Object.keys(entries).forEach(entryName => {
            if (entryName.indexOf(pattern) == -1) {
                delete entries[entryName];
            }
        });
    }
    filterEntries(webpackEntries);
    filterEntries(htmlEntries);
}

// Usage example:
//    FILTER_EXAMPLE=shadows yarn start
//
if (exampleFilter) {
    filterExamples(exampleFilter);
}

const browserConfig = merge(commonConfig, {
    entry: webpackEntries,
    output: {
        filename: "[name]_bundle.js"
    },
    optimization: {
        splitChunks: {
            chunks: "all",
            minSize: 1000,
            name: "common"
        }
    },
    cache: getCacheConfig("browser")
});

const exampleBrowserConfig = merge(commonConfig, {
    entry: {
        "example-browser": "./example-browser.ts"
    },
    cache: getCacheConfig("example_browser")
});

const codeBrowserConfig = merge(commonConfig, {
    entry: {
        codebrowser: "./codebrowser.ts"
    },
    cache: getCacheConfig("code_browser")
});

browserConfig.plugins!.push(
    ...Object.keys(browserConfig.entry as Record<string, string>).map(
        chunk =>
            new HtmlWebpackPlugin({
                title: "flywave",
                template: "template/example.html",
                chunks: ["common", chunk],
                filename: `${chunk}.html`
            })
    )
);

const allEntries = Object.assign({}, webpackEntries, htmlEntries);

/**
 * Generate example definitions for 'index.html' in following form:
 *
 * {
 *     [examplePage: string]: string // maps example page to example source
 * }
 */
const exampleDefs = Object.keys(allEntries).reduce(function (
    r: Record<string, string>,
    entry: string
) {
    r[entry + ".html"] = path.relative(__dirname, allEntries[entry]);
    return r;
},
{});

interface CopyPattern {
    from: string;
    to?: string;
    toType?: "dir" | "file" | "template";
    transform?: (content: Buffer) => string | Buffer;
    globOptions?: {
        dot?: boolean;
        ignore?: string[];
    };
}

const srcFiles: CopyPattern[] = glob
    .sync(path.join(__dirname, "src", "*.{ts,tsx,html}"))
    .map(from => {
        return { from, to: "src/[name].[ext]" };
    });

const htmlFiles: CopyPattern[] = glob.sync(path.join(__dirname, "src/*.html")).map(from => {
    return {
        from,
        to: "[name].[ext]"
    };
});

const assets: (string | CopyPattern)[] = [
    {
        from: __dirname + "/example-definitions.js.in",
        to: "example-definitions.js",
        transform: (content: Buffer) => {
            return content.toString().replace("{{EXAMPLES}}", JSON.stringify(exampleDefs, null, 4));
        }
    },
    ...srcFiles,
    path.join(__dirname, "index.html"),
    ...htmlFiles,
    path.join(__dirname, "codebrowser.html"),
    { from: path.join(__dirname, "resources"), to: "resources", toType: "dir" },
    { from: path.join(harpMapThemePath, "resources"), to: "resources", toType: "dir" },
    {
        from: path.join(harpFontResourcesPath, "resources"),
        to: "resources/fonts",
        toType: "dir"
    },
    require.resolve("three")
].filter(asset => {
    // ignore stuff that is not found
    if (asset === undefined || asset === null) {
        return false;
    } else if (typeof asset === "string") {
        return true;
    } else if (typeof asset === "object") {
        return asset.from;
    }
    return false;
}) as (string | CopyPattern)[];

assets.forEach(asset => {
    if (typeof asset === "object") {
        asset.globOptions = {
            dot: true,
            ignore: [".npmignore", ".gitignore"]
        };
    }
});

browserConfig.plugins!.push(new CopyWebpackPlugin({ patterns: assets }));

const configs: webpack.Configuration[] = [
    decoderConfig,
    browserConfig,
    codeBrowserConfig,
    exampleBrowserConfig
];
export default configs;
