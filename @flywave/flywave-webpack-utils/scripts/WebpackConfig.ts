/* Copyright (C) 2025 flywave.gl contributors */

import * as path from "path";
import { fileURLToPath } from "url";
import { type Configuration, type WebpackPluginInstance } from "webpack";
import { CustomizeRule, mergeWithRules } from "webpack-merge";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";
import { execSync } from "child_process";
import { createRequire } from "module";
const require = createRequire(import.meta.url);


// The typings don't yet work for copy-webpack-plugin & webpack 5, hence we ignore them for now,
// see: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/49528
const CopyWebpackPlugin: any = require("copy-webpack-plugin");
// Uncomment this when the above issue is fixed.
// import * as CopyWebpackPlugin from "copy-webpack-plugin";

import HtmlWebpackPlugin from "html-webpack-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export interface FlywaveWebpackConfig {
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

export interface CopyPattern {
    from: string;
    to?: string;
    toType?: "dir" | "file" | "template";
    transform?: (content: Buffer) => string | Buffer;
    globOptions?: {
        dot?: boolean;
        ignore?: string[];
    };
}

/**
 * Get TsconfigPathsPlugin configuration array for all subprojects
 * Use pnpm command to get all current subprojects, then configure TsconfigPathsPlugin for each project
 */
function getSubprojectTsconfigPathsPlugins(projectRoot: string): TsconfigPathsPlugin[] {
    try {
        // Use pnpm command to get all subproject information
        const pnpmOutput = execSync('pnpm ls -r --depth -1 --json', { cwd: projectRoot, encoding: 'utf-8' });
        const packages = JSON.parse(pnpmOutput);

        // Filter out subprojects under the @flywave scope (excluding private packages and root project)
        const flywavePackages = packages.filter((pkg: any) =>
            pkg.name.startsWith('@flywave/') &&
            pkg.path !== projectRoot
        );

        // Create TsconfigPathsPlugin configuration for each subproject
        return flywavePackages.map((pkg: any) => {
            const tsconfigPath = path.resolve(pkg.path, 'tsconfig.json');
            return new TsconfigPathsPlugin({
                configFile: tsconfigPath
            });
        });
    } catch (error) {
        console.error('Error getting subprojects:', error);
        // If acquisition fails, return default configuration
        return [];
    }
}

/**
 * 创建基础Webpack配置
 */
export function createBaseConfig(config?: FlywaveWebpackConfig): Configuration {
    const projectRoot = config?.projectRoot || path.resolve(__dirname, '../../../');
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

/**
 * 创建浏览器配置
 */
export function createBrowserConfig(config?: FlywaveWebpackConfig): Configuration {
    const baseConfig = createBaseConfig(config);

    return {
        ...baseConfig,
    };
}

/**
 * 创建解码器配置
 */
export function createDecoderConfig(config?: FlywaveWebpackConfig): Configuration {
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

/**
 * 创建资源复制配置
 */
export function createAssetsConfig(config?: FlywaveWebpackConfig): CopyPattern[] {
    const assets: CopyPattern[] = [];

    // Add theme resources
    if (config?.themePath) {
        assets.push({
            from: path.join(config.themePath, "resources"),
            to: "resources",
            toType: "dir"
        });
    }

    // Add font resources
    if (config?.fontResourcesPath) {
        assets.push({
            from: path.join(config.fontResourcesPath, "resources"),
            to: "resources/fonts",
            toType: "dir"
        });
    }

    // Add Draco library
    if (config?.threeDracoPath) {
        assets.push({
            from: config.threeDracoPath,
            to: "resources/libs",
            toType: "dir"
        });
    }

    // Add additional resources
    if (config?.additionalAssets) {
        assets.push(...config.additionalAssets.map(asset => ({
            from: asset.from,
            to: asset.to,
            toType: asset.toType
        })));
    }

    // Configure glob options for each resource
    assets.forEach(asset => {
        asset.globOptions = {
            dot: true,
            ignore: [".npmignore", ".gitignore"]
        };
    });

    return assets.filter(asset => asset.from) as CopyPattern[];
}

export function addWebpackConfig(
    config?: Configuration,
    flywaveConfig?: FlywaveWebpackConfig
) {
    if (Array.isArray(config) || typeof config === "function") {
        throw new Error("config passed to addFlywaveWebpackConfig must be a Configuration object");
    }
    const userConfig = config !== undefined ? config : {};
    const mode = process.env.NODE_ENV === "production" ? "production" : "development";
    const mainEntry = flywaveConfig === undefined ? undefined : flywaveConfig.mainEntry;
    const WebpackMergeMatchLoader = mergeWithRules({
        module: {
            rules: {
                test: CustomizeRule.Match,
                use: {
                    loader: CustomizeRule.Match,
                    options: CustomizeRule.Merge
                }
            }
        }
    });
    const baseConfig: Configuration = {
        output: {
            filename: "[name].bundle.js"
        },
        devtool: "source-map",
        resolve: {
            extensions: [".webpack.js", ".web.js", ".js"]
        },
        performance: {
            hints: false
        },
        mode,
        externals: {
            three: "THREE"
        }
    };
    const typescriptConfig: Configuration = {
        resolve: {
            extensions: [".web.ts", ".ts", ".tsx"]
        },
        module: {
            rules: [{ test: /\.tsx?$/, loader: "esbuild-loader" }]
        }
    };

    const mainConfig = mainEntry?.match(/\.tsx?$/)
        ? WebpackMergeMatchLoader(baseConfig, typescriptConfig)
        : baseConfig;

    const bundles = [
        WebpackMergeMatchLoader(
            {
                ...mainConfig,
                plugins: createPlugins(
                    flywaveConfig === undefined ? undefined : flywaveConfig.htmlTemplate
                ),
                stats: {
                    all: false,
                    timings: true,
                    exclude: "resources/",
                    errors: true,
                    entrypoints: true,
                    warnings: true
                }
            },
            userConfig
        )
    ];

    if (mainEntry !== undefined) {
        bundles[0] = WebpackMergeMatchLoader(
            {
                entry: {
                    "flywave.gl": {
                        import: mainEntry,
                        library: {
                            // all options under `output.library` can be used here
                            name: config?.output?.library,
                            type: "umd"
                        }
                    }
                }
            },
            bundles[0]
        );
    }
    if (flywaveConfig !== undefined && flywaveConfig.decoderEntry !== undefined) {
        const decoderConfig = flywaveConfig.decoderEntry.endsWith(".ts")
            ? WebpackMergeMatchLoader(baseConfig, typescriptConfig)
            : baseConfig;
        bundles.push(
            WebpackMergeMatchLoader(
                {
                    target: "webworker",
                    entry: {
                        "flywave.decoder": flywaveConfig.decoderEntry
                    },
                    ...decoderConfig
                },
                userConfig
            )
        );
    }
    return bundles;
}

function createPlugins(htmlTemplate?: string): WebpackPluginInstance[] {
    const plugins = [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: `../flywave-map-theme/resources`,
                    to: "resources",
                    toType: "dir"
                }
            ]
        })
    ];
    if (htmlTemplate !== undefined) {
        plugins.push(
            new HtmlWebpackPlugin({
                template: htmlTemplate
            }) as any
        );
    }
    return plugins;
}