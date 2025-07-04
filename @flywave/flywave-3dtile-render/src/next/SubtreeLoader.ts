import { Tiles3DLoaderOptions } from "./Loader";
import parse3DTilesSubtree from "./parsers/helpers/parse-3d-tile-subtree";
import type { Subtree } from "./types";
import { VERSION } from "./utils/version";

/**
 * Loader for 3D Tiles Subtree
 */
export const Tile3DSubtreeLoader = {
    dataType: null as unknown as Subtree,
    batchType: null as never,
    id: "3d-tiles-subtree",
    name: "3D Tiles Subtree",
    module: "3d-tiles",
    version: VERSION,
    extensions: ["subtree"],
    mimeTypes: ["application/octet-stream"],
    tests: ["subtree"],
    parse: parse3DTilesSubtree,
    options: {}
} as const;

/**
 * 加载3D Tiles子树文件
 * @param url 子树文件URL
 * @param loader 加载器实例 (默认为Tile3DSubtreeLoader)
 * @param options 加载选项
 * @param context 上下文对象 (可选，包含fetch等实用工具)
 * @returns 解析后的子树对象
 */
export async function loadSubtree(
    url: string,
    loader: typeof Tile3DSubtreeLoader = Tile3DSubtreeLoader,
    options: Tiles3DLoaderOptions = {},
    context?: any
): Promise<Subtree> {
    // 获取fetch函数 - 优先使用上下文提供的，否则使用全局fetch
    const fetchFn = context?.fetch || globalThis.fetch;

    if (!fetchFn) {
        throw new Error("Fetch function is required to load subtree");
    }

    try {
        // 1. 获取子树文件
        const response = await fetchFn(url, {
            headers: options.headers
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch subtree: ${response.status} ${response.statusText}`);
        }

        // 2. 读取二进制数据
        const arrayBuffer = await response.arrayBuffer();

        // 3. 使用加载器解析数据
        return await loader.parse(arrayBuffer, options, context);
    } catch (error) {
        throw new Error(`Subtree loading failed: ${error.message}`);
    }
}
