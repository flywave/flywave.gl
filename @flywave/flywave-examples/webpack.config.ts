/* Copyright (C) 2025 flywave.gl contributors */

import {
    type FlywaveWebpackConfig,
    createAssetsConfig,
    createBaseConfig,
    createDecoderConfig
} from "@flywave/flywave-webpack-utils/scripts/WebpackConfig";
import CopyWebpackPlugin from "copy-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import * as fs from "fs";
import { createRequire } from "module";
import * as path from "path";
import { fileURLToPath } from "url";
import type { Configuration } from "webpack";
import { merge } from "webpack-merge";

const require = createRequire(import.meta.url);
const webpack = require("webpack");
const glob = require("glob");
const typescript = require("typescript");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const exampleFilter = process.env["FILTER_EXAMPLE"];

const flywaveMapThemePath = path.dirname(
    require.resolve("@flywave/flywave-map-theme/package.json")
);
const flywaveFontResourcesPath = path.dirname(
    require.resolve("@here/harp-fontcatalog/package.json")
);
const threeMainPath = path.dirname(require.resolve("three"));
const threeDracoPath = `${threeMainPath}/../examples/jsm/libs`;

const themeList = {
    default: "resources/tilezen_base.json",
    berlinDay: "resources/tilezen_base.json",
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

// 定义flywave-webpack-utils配置
const flywaveConfig: FlywaveWebpackConfig = {
    tsConfigPath: path.join(__dirname, "tsconfig.json"),
    projectRoot: path.resolve(__dirname, "../../"),
    enableTsconfigPaths: true,
    themePath: flywaveMapThemePath,
    fontResourcesPath: flywaveFontResourcesPath,
    threeDracoPath
};

// 使用flywave-webpack-utils创建基础配置
const commonConfig: Configuration = merge(createBaseConfig(flywaveConfig), {
    resolve: {
        alias: {
            "@flywave/flywave.gl": path.resolve(__dirname, "../flywave.gl/src/index.ts")
        }
    },
    externals: ["three", "three/tsl", "three/webgpu"],
    output: {
        path: path.join(process.cwd(), "dist/examples"),
        filename: "[name].bundle.js",
        libraryTarget: "module"
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"]
            },
            {
                test: /\.(scss|sass)$/,
                use: ["style-loader", "css-loader", "sass-loader"]
            }
        ]
    },
    experiments: {
        outputModule: true
    },
    plugins: [
        new webpack.DefinePlugin({
            THEMES: JSON.stringify(themeList),
            CESIUM_ION_TOKEN: JSON.stringify(
                process.env.CESIUM_ION_TOKEN ||
                    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlOTFkYWMzNC1mYjI1LTRlYTYtYTc2ZS04NWI1MTU2OTVlMDYiLCJpZCI6Mzg2NzksImlhdCI6MTY0MTE5NTAyNn0.4xsIJgYTK81yhRu67GG0x2FMit6zpYFCWsvWSwiFVV4"
            )
        })
    ]
});

const decoderConfig = merge(
    createDecoderConfig({
        ...flywaveConfig,
        decoderEntry: "./decoder/decoder.ts"
    }),
    {
        target: "webworker",
        resolve: {
            alias: {
                "@flywave/flywave.gl": path.resolve(__dirname, "../flywave.gl/src")
            }
        },
        output: {
            filename: "flywave-decoders.js"
        },
        experiments: {
            outputModule: false
        }
    }
);

const webpackEntries = glob
    .sync(path.join(__dirname, "./src/*.{ts,tsx}"))
    .reduce((result: Record<string, string>, entry: string) => {
        const name = path.basename(entry).replace(/.tsx?$/, "");
        // Only these two are real top-level app pages. Every other top-level
        // module (token-config, example-categories, …) is shared
        // infrastructure and must NOT become a browsable example page.
        if (name !== "example-browser" && name !== "codebrowser") {
            return result;
        }
        result[name] = entry;
        return result;
    }, {});

// 添加对新示例文件夹结构的支持
const exampleFolders = glob
    .sync(path.join(__dirname, "./src/*/index.ts"))
    .reduce((result: Record<string, string>, entry: string) => {
        const folderName = path.basename(path.dirname(entry));
        // A folder counts as an example only when it carries a config.ts;
        // shared barrels like src/common/index.ts must not become pages.
        if (!fs.existsSync(path.join(path.dirname(entry), "config.ts"))) {
            return result;
        }
        result[folderName] = entry;
        return result;
    }, {});

// 合并两种入口方式
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

// Usage example:
//    FILTER_EXAMPLE=shadows yarn start
//
if (exampleFilter) {
    filterExamples(exampleFilter);
}

const browserConfig = merge(commonConfig, {
    //@ts-ignore
    devServer: {
        port: 8080,
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true" },
        proxy: [
            {
                context: ["/api"],
                target: "http://60.16.5.72:45566",
                changeOrigin: true,
                secure: false,
                headers: {
                    Cookie: "FWAUSERID=s93tubaq4f8ruer6qrcztcbqso; FWAUTHTOKEN=somh5s4t7trztyw5dbrusq4ner; FWCSRF=gs6ek4wahf8c9jkxiw1eqy1gro"
                }
            }
        ]
    },
    entry: webpackEntries,
    output: {
        filename: "[name]_bundle.js",
        libraryTarget: "module"
    },
    optimization: {
        splitChunks: {
            chunks: "all",
            minSize: 1000,
            name: false // 使用 webpack 自动生成的名称，避免冲突
        }
    },
    cache: getCacheConfig("browser")
});

const exampleBrowserConfig = merge(commonConfig, {
    entry: {
        "example-browser": "./example-browser.ts",
        // Source viewer page (codebrowser.html) expected alongside the browser.
        codebrowser: "./codebrowser.ts"
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

/**
 * A single entry of the generated `example-definitions.js` map.
 *
 * `src` is the source path consumed by the code browser; all other fields are
 * optional v2 metadata picked from the example's `config.ts`. The example
 * browser treats every field except `src` as optional.
 */
interface ExampleDefinition {
    src: string;
    title?: string;
    titleZh?: string;
    category?: string;
    level?: string;
    dataPolicy?: string;
    tags?: string[];
    apis?: string[];
    concerns?: string[];
    internal?: boolean;
    order?: number;
}

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|gif|svg)$/i;
const LEVELS = ["beginner", "intermediate", "advanced"];
const DATA_POLICIES = ["offline", "open-data", "token"];

function pickStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const result = value.filter((item): item is string => typeof item === "string");
    return result.length > 0 ? result : undefined;
}

/**
 * Evaluates a per-example `config.ts` at build time.
 *
 * Example configs are plain object literals that may import a thumbnail
 * image; image imports are stubbed out because only metadata is needed here.
 * Returns `undefined` when the file is missing or cannot be evaluated so the
 * example simply falls back to the name-based defaults in the browser.
 */
function loadExampleConfig(entryPath: string): Record<string, unknown> | undefined {
    const configPath = path.join(path.dirname(entryPath), "config.ts");
    if (!fs.existsSync(configPath)) {
        return undefined;
    }
    try {
        const transpiled = typescript.transpileModule(fs.readFileSync(configPath, "utf8"), {
            compilerOptions: {
                module: typescript.ModuleKind.CommonJS,
                target: typescript.ScriptTarget.ES2019,
                esModuleInterop: true
            }
        }).outputText;
        const configModule = { exports: {} as Record<string, unknown> };
        const configRequire = (request: string) => {
            if (IMAGE_FILE_PATTERN.test(request)) {
                return { default: "" };
            }
            throw new Error(`unsupported import in example config: ${request}`);
        };
        new Function("require", "module", "exports", transpiled)(
            configRequire,
            configModule,
            configModule.exports
        );
        const exported = configModule.exports as { default?: unknown };
        if (typeof exported.default === "object" && exported.default !== null) {
            return exported.default as Record<string, unknown>;
        }
    } catch (error) {
        // Malformed configs must never break the whole examples build; the
        // browser falls back to defaults for this example.
    }
    return undefined;
}

/**
 * Builds the definition object of one example, merging the entry source path
 * with the v2 metadata fields collected from the example's `config.ts`.
 */
function buildExampleDefinition(pageUrl: string, entryPath: string): ExampleDefinition {
    const definition: ExampleDefinition = { src: path.relative(__dirname, entryPath) };
    const config = loadExampleConfig(entryPath);
    if (config === undefined) {
        return definition;
    }
    if (typeof config.title === "string") {
        definition.title = config.title;
    }
    if (typeof config.titleZh === "string") {
        definition.titleZh = config.titleZh;
    }
    // `code` is the legacy name of the category field, keep accepting both.
    if (typeof config.code === "string") {
        definition.category = config.code;
    } else if (typeof config.category === "string") {
        definition.category = config.category;
    }
    if (LEVELS.includes(config.level as string)) {
        definition.level = config.level as string;
    }
    if (DATA_POLICIES.includes(config.dataPolicy as string)) {
        definition.dataPolicy = config.dataPolicy as string;
    }
    const tags = pickStringArray(config.tags);
    if (tags !== undefined) {
        definition.tags = tags;
    }
    const apis = pickStringArray(config.apis);
    if (apis !== undefined) {
        definition.apis = apis;
    }
    const concerns = pickStringArray(config.concerns);
    if (concerns !== undefined) {
        definition.concerns = concerns;
    }
    if (typeof config.internal === "boolean") {
        definition.internal = config.internal;
    }
    if (typeof config.order === "number") {
        definition.order = config.order;
    }
    return definition;
}

/**
 * Generate example definitions for 'index.html' in following form:
 *
 * {
 *     [examplePage: string]: ExampleDefinition // page url to example metadata
 * }
 */
const exampleDefs = Object.keys(allEntries).reduce(function (
    r: Record<string, ExampleDefinition>,
    entry: string
) {
    r[entry + ".html"] = buildExampleDefinition(entry + ".html", allEntries[entry]);
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

const srcFiles: CopyPattern[] = [
    ...glob.sync(path.join(__dirname, "src", "*.{ts,tsx,html}")).map((from: any) => {
        return { from, to: "src/[name].[ext]" };
    }),
    ...glob.sync(path.join(__dirname, "src", "*/*/index.ts")).map((from: any) => {
        const folderName = path.basename(path.dirname(from));
        return { from, to: `src/${folderName}/[name].[ext]` };
    }),
    ...glob.sync(path.join(__dirname, "src", "*/*/config.json")).map((from: any) => {
        const folderName = path.basename(path.dirname(from));
        return { from, to: `src/${folderName}/[name].[ext]` };
    }),
    ...glob.sync(path.join(__dirname, "src", "*/*/assets/**/*")).map((from: any) => {
        const folderName = path.basename(path.dirname(path.dirname(from)));
        const relativePath = path.relative(path.join(__dirname, "src", folderName, "assets"), from);
        return { from, to: `src/${folderName}/assets/${relativePath}` };
    })
];

const htmlFiles: CopyPattern[] = glob.sync(path.join(__dirname, "src/*.html")).map((from: any) => {
    return {
        from,
        to: "[name].[ext]"
    };
});

// 添加额外的资源到配置中
const additionalAssets: Array<{ from: string; to: string; toType?: "dir" | "file" | "template" }> =
    [
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
        ...srcFiles
            .filter(asset => asset.to)
            .map(asset => ({ from: asset.from, to: asset.to!, toType: asset.toType })),
        ...htmlFiles
            .filter(asset => asset.to)
            .map(asset => ({ from: asset.from, to: asset.to!, toType: asset.toType })),
        { from: path.join(__dirname, "index.html"), to: "index.html" },
        { from: path.join(__dirname, "codebrowser.html"), to: "codebrowser.html" }
    ];

// 更新flywaveConfig中的additionalAssets
flywaveConfig.additionalAssets = additionalAssets;

// 为transform函数处理特殊内容
const assets = createAssetsConfig(flywaveConfig).map(asset => {
    if (asset.to === "example-definitions.js") {
        return {
            ...asset,
            transform: (content: Buffer) => {
                return content
                    .toString()
                    .replace("{{EXAMPLES}}", JSON.stringify(exampleDefs, null, 4));
            }
        };
    }
    return asset;
});

browserConfig.plugins!.push(new CopyWebpackPlugin({ patterns: assets }));

const configs: Configuration[] = [decoderConfig, browserConfig, exampleBrowserConfig];

export default configs;
