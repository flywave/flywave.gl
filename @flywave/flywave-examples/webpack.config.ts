/* Copyright (C) 2025 flywave.gl contributors */

import CopyWebpackPlugin from "copy-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import * as path from "path";
import type { Configuration } from "webpack";
import { merge } from "webpack-merge";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";
import { execSync } from "child_process";

const require = createRequire(import.meta.url);

const webpack = require("webpack");
const glob = require("glob");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const exampleFilter = process.env["FILTER_EXAMPLE"];

const flywaveMapThemePath = path.resolve(__dirname, "../flywave-map-theme");

let flywaveFontResourcesPath: string;
let threePath: string;
let threeDracoPath: string;

try {
    flywaveFontResourcesPath = path.dirname(
        require.resolve("@here/harp-fontcatalog/package.json")
    );
} catch (e) {
    console.warn("Could not resolve @here/harp-fontcatalog, using fallback path");
    flywaveFontResourcesPath = path.resolve(__dirname, "../../node_modules/@here/harp-fontcatalog");
}

try {
    threePath = `${path.dirname(require.resolve("three"))}/three.cjs`;
    threeDracoPath = `${path.dirname(require.resolve("three"))}/../examples/jsm/libs`;
} catch (e) {
    console.warn("Could not resolve three, using fallback path");
    threePath = path.resolve(__dirname, "../../node_modules/three/three.cjs");
    threeDracoPath = path.resolve(__dirname, "../../node_modules/three/examples/jsm/libs");
}

const themeList = {
    default: "resources/tilezen_base.json",
    berlinDay: "resources/tilezen_base.json",
    berlinReducedDay: "resources/berlin_tilezen_day_reduced.json",
    berlinReducedNight: "resources/berlin_tilezen_night_reduced.json",
    berlinStreets: "resources/berlin_tilezen_effects_streets.json",
    berlinOutlines: "resources/berlin_tilezen_effects_outlines.json"
};

interface FlywaveWebpackConfig {
    mainEntry?: string;
    decoderEntry?: string;
    htmlTemplate?: string;
    themePath?: string;
    fontResourcesPath?: string;
    threeDracoPath?: string;
    tsConfigPath?: string;
    projectRoot?: string;
    outputPath?: string;
    devServerPort?: number;
    enableTsconfigPaths?: boolean;
    enableExamples?: boolean;
    enableCodeBrowser?: boolean;
    additionalAssets?: Array<{ from: string; to: string; toType?: "dir" | "file" | "template" }>;
}

interface CacheConfig {
    type: "filesystem";
    buildDependencies: {
        config: string[];
    };
    name: string;
}

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

function getSubprojectTsconfigPathsPlugins(projectRoot: string): TsconfigPathsPlugin[] {
    try {
        const pnpmOutput = execSync('pnpm ls -r --depth -1 --json', { cwd: projectRoot, encoding: 'utf-8' });
        const packages = JSON.parse(pnpmOutput);

        const flywavePackages = packages.filter((pkg: any) =>
            pkg.name.startsWith('@flywave/') &&
            pkg.path !== projectRoot
        );

        return flywavePackages.map((pkg: any) => {
            const tsconfigPath = path.resolve(pkg.path, 'tsconfig.json');
            return new TsconfigPathsPlugin({
                configFile: tsconfigPath
            });
        });
    } catch (error) {
        console.error('Error getting subprojects:', error);
        return [];
    }
}

function createBaseConfig(config?: FlywaveWebpackConfig): Configuration {
    const projectRoot = config?.projectRoot || path.resolve(__dirname, '../../');
    const tsConfigPath = config?.tsConfigPath || path.resolve(process.cwd(), "tsconfig.json");

    const resolvePlugins = [];
    if (config?.enableTsconfigPaths) {
        resolvePlugins.push(...getSubprojectTsconfigPathsPlugins(projectRoot));
    }

    return {
        devtool: "source-map",
        resolve: {
            extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"],
            alias: {
                "react-native": "react-native-web",
            },
            plugins: resolvePlugins,
            fallback: {
                assert: false,
                fs: false
            }
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader",
                    options: {
                        transpileOnly: true,
                        configFile: tsConfigPath,
                    }
                },
                {
                    test: /\.(HDR|hdr|mp4|png|eot|webp|tiff|svg|woff2|woff|ttf|jpg|gif|jpeg|ico|exr|wasm)$/,
                    type: "asset/resource",
                    generator: {
                        filename: "files/[name].[hash:8].[ext]"
                    }
                }
            ]
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
        mode: process.env.NODE_ENV === "production" ? "production" : "development"
    };
}

function createDecoderConfig(config?: FlywaveWebpackConfig): Configuration {
    const baseConfig = createBaseConfig(config);
    const outputPath = config?.outputPath || path.join(process.cwd(), "dist");

    return {
        ...baseConfig,
        target: "webworker",
        entry: {
            decoder: config?.decoderEntry || "./src/DecoderBundleMain.ts"
        },
        output: {
            path: outputPath,
            filename: process.env.NODE_ENV === "production" ? "flywave-decoders.min.js" : "flywave-decoders.js"
        }
    };
}

function createAssetsConfig(config?: FlywaveWebpackConfig): CopyPattern[] {
    const assets: CopyPattern[] = [];

    if (config?.themePath) {
        assets.push({
            from: path.join(config.themePath, "resources"),
            to: "resources",
            toType: "dir"
        });
    }

    if (config?.fontResourcesPath) {
        assets.push({
            from: path.join(config.fontResourcesPath, "resources"),
            to: "resources/fonts",
            toType: "dir"
        });
    }

    if (config?.threeDracoPath) {
        assets.push({
            from: config.threeDracoPath,
            to: "resources/libs",
            toType: "dir"
        });
    }

    if (config?.additionalAssets) {
        assets.push(...config.additionalAssets.map(asset => ({
            from: asset.from,
            to: asset.to,
            toType: asset.toType
        })));
    }

    assets.forEach(asset => {
        asset.globOptions = {
            dot: true,
            ignore: [".npmignore", ".gitignore"]
        };
    });

    return assets.filter(asset => asset.from) as CopyPattern[];
}

function getCacheConfig(name: string): CacheConfig | false {
    return process.env.NO_HARD_SOURCE_CACHE
        ? false
        : {
            type: "filesystem",
            buildDependencies: {
                config: [__filename]
            },
            name: "flywave-examples_" + name
        };
}

const flywaveConfig: FlywaveWebpackConfig = {
    tsConfigPath: path.join(__dirname, "tsconfig.json"),
    projectRoot: path.resolve(__dirname, '../../'),
    enableTsconfigPaths: true,
    themePath: flywaveMapThemePath,
    fontResourcesPath: flywaveFontResourcesPath,
    threeDracoPath: threeDracoPath
};

const commonConfig: Configuration = merge(createBaseConfig(flywaveConfig), {
    resolve: {
        alias: {
            "@flywave/flywave.gl": path.resolve(__dirname, "../flywave.gl/src/index.ts")
        },
    }, 
    output: {
        path: path.join(process.cwd(), "dist/examples"),
        filename: "[name].bundle.js", 
        libraryTarget: "module"
    },
    experiments: {
        outputModule: true
    },
    plugins: [
        new webpack.DefinePlugin({
            THEMES: JSON.stringify(themeList),
            FLYWAVE_BASE_URL: JSON.stringify("./"),
            CESIUM_ION_TOKEN: JSON.stringify(process.env.CESIUM_ION_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlOTFkYWMzNC1mYjI1LTRlYTYtYTc2ZS04NWI1MTU2OTVlMDYiLCJpZCI6Mzg2NzksImlhdCI6MTY0MTE5NTAyNn0.4xsIJgYTK81yhRu67GG0x2FMit6zpYFCWsvWSwiFVV4'),
        })
    ]
});

const decoderConfig = merge(createDecoderConfig({
    ...flywaveConfig,
    decoderEntry: "./decoder/decoder.ts"
}), {
    target: "webworker",
    resolve: {
        alias: {
            three: threePath,
            "@flywave/flywave.gl": path.resolve(__dirname, "../flywave.gl/src")
        },
    },
    output: {
        filename: "flywave-decoders.js"
    },
    experiments: {
        outputModule: false
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

const exampleFolders = glob
    .sync(path.join(__dirname, "./src/*/index.ts"))
    .reduce((result: Record<string, string>, entry: string) => {
        const folderName = path.basename(path.dirname(entry));
        result[folderName] = entry;
        return result;
    }, {});

Object.assign(webpackEntries, exampleFolders);

const htmlEntries = glob
    .sync(path.join(__dirname, "./src/*.html"))
    .reduce((result: Record<string, string>, entry: string) => {
        result[path.basename(entry).replace(/.html$/, "")] = entry;
        return result;
    }, {});

function filterExamples(pattern: string) {
    function filterEntries(entries: Record<string, string>) {
        Object.keys(entries).forEach(entryName => {
            if (!entryName.includes(pattern)) {
                delete entries[entryName];
            }
        });
    }
    filterEntries(webpackEntries);
    filterEntries(htmlEntries);
}

if (exampleFilter) {
    filterExamples(exampleFilter);
}

const browserConfig = merge(commonConfig, {
    //@ts-ignore
    devServer: {
        port: 8080,
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true" }
    },
    entry: webpackEntries,
    output: {
        filename: "[name]_bundle.js",
        libraryTarget: "module"
    },
    externals: ["three"],
    optimization: {
        splitChunks: {
            chunks: "all",
            minSize: 1000,
            name: false
        }
    },
    cache: getCacheConfig("browser")
});

const exampleBrowserConfig = merge(commonConfig, {
    entry: {
        "example-browser": "./example-browser.ts"
    },
    output: {
        libraryTarget: "module"
    },
    cache: getCacheConfig("example_browser")
});
 
browserConfig.plugins!.push(
    ...Object.keys(browserConfig.entry as Record<string, string>).map(
        chunk =>
            new HtmlWebpackPlugin({
                title: "flywave",
                template: "template/example.html",
                chunks: [chunk],
                filename: `${chunk}.html`,
                scriptLoading: "module"
            })
    )
);

const allEntries = Object.assign({}, webpackEntries, htmlEntries);

const exampleDefs = Object.keys(allEntries).reduce(function (
    r: Record<string, string>,
    entry: string
) {
    r[entry + ".html"] = path.relative(__dirname, allEntries[entry]);
    return r;
},
    {});

const srcFiles: CopyPattern[] = [
    ...glob.sync(path.join(__dirname, "src", "*.{ts,tsx,html}")).map(from => {
        return { from, to: "src/[name].[ext]" };
    }),
    ...glob.sync(path.join(__dirname, "src", "*/*/index.ts")).map(from => {
        const folderName = path.basename(path.dirname(from));
        return { from, to: `src/${folderName}/[name].[ext]` };
    }),
    ...glob.sync(path.join(__dirname, "src", "*/*/config.json")).map(from => {
        const folderName = path.basename(path.dirname(from));
        return { from, to: `src/${folderName}/[name].[ext]` };
    }),
    ...glob.sync(path.join(__dirname, "src", "*/*/assets/**/*")).map(from => {
        const folderName = path.basename(path.dirname(path.dirname(from)));
        const relativePath = path.relative(path.join(__dirname, "src", folderName, "assets"), from);
        return { from, to: `src/${folderName}/assets/${relativePath}` };
    })
];

const htmlFiles: CopyPattern[] = glob.sync(path.join(__dirname, "src/*.html")).map(from => {
    return {
        from,
        to: "[name].[ext]"
    };
});

const additionalAssets: Array<{ from: string; to: string; toType?: "dir" | "file" | "template" }> = [
    { from: path.join(__dirname, "resources"), to: "", toType: "dir" },
    { from: path.join(flywaveMapThemePath, "resources"), to: "resources", toType: "dir" },
    { from: path.join(flywaveMapThemePath, "resources"), to: "resources", toType: "dir" },
    { from: threeDracoPath, to: "resources/libs", toType: "dir" },
    {
        from: path.join(flywaveFontResourcesPath, "resources"),
        to: "resources/fonts",
        toType: "dir"
    },
    {
        from: __dirname + "/example-definitions.js.in",
        to: "example-definitions.js",
        toType: "file"
    },
    ...srcFiles.filter(asset => asset.to).map(asset => ({ from: asset.from, to: asset.to!, toType: asset.toType })),
    ...htmlFiles.filter(asset => asset.to).map(asset => ({ from: asset.from, to: asset.to!, toType: asset.toType })),
    { from: path.join(__dirname, "index.html"), to: "index.html" },
    { from: path.join(__dirname, "codebrowser.html"), to: "codebrowser.html" }
];

flywaveConfig.additionalAssets = additionalAssets;

const assets = createAssetsConfig(flywaveConfig).map(asset => {
    if (asset.to === "example-definitions.js") {
        return {
            ...asset,
            transform: (content: Buffer) => {
                return content.toString().replace("{{EXAMPLES}}", JSON.stringify(exampleDefs, null, 4));
            }
        };
    }
    return asset;
});

browserConfig.plugins!.push(new CopyWebpackPlugin({ patterns: assets }));

const configs: Configuration[] = [
    decoderConfig,
    browserConfig,
    exampleBrowserConfig
];

export default configs;
