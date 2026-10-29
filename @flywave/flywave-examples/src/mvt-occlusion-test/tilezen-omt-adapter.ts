/* Copyright (C) 2025 flywave.gl contributors */

/**
 * tilezen 皮肤 → OpenMapTiles schema 的机械适配层。
 *
 * 不重新设计任何颜色/宽度/层次：运行时加载现有 tilezen_base 皮肤，
 * 仅重写条件表达式里与数据 schema 相关的部分（HERE/tilezen 层名与
 * kind 属性 → OpenMapTiles 的层名与 class 属性），保留皮肤的全部
 * 视觉设计与条目顺序。
 *
 * schema 差异（本适配层消化的全部内容）：
 * - 层名：roads→transportation、buildings→building、boundaries→boundary、
 *   places→place、earth→landcover（landuse/water 两边同名）；
 * - 属性：kind→class、kind_detail→class（OMT 道路 class 就是细等级）；
 * - 值映射：见 KIND_CLASS_MAP / KIND_STRUCTURED（highway/major_road/
 *   minor_road 是 tilezen 的粗分级，OMT 用细 class 值展开）。
 */

import { type StyleSet, type Theme } from "@flywave/flywave.gl";

/** tilezen 层名 → OpenMapTiles 层名。 */
const LAYER_MAP: Record<string, string> = {
    roads: "transportation",
    buildings: "building",
    boundaries: "boundary",
    places: "place",
    earth: "landcover"
    // landuse、water 两边同名，不映射
};

/**
 * kind 值 → OpenMapTiles class 值。数组 = OMT 的多个 class 用一个皮肤
 * 条目承接（in 展开）；单值 = 1:1。表外的 kind 值原样保留（OMT 无此
 * class 时特征自然不匹配，落入地面底色，无害）。
 */
const KIND_CLASS_MAP: Record<string, string | string[]> = {
    // transportation：tilezen 粗分级 → OMT 细 class
    highway: ["motorway", "trunk"],
    major_road: ["primary", "secondary", "tertiary"],
    minor_road: ["residential", "unclassified", "living_street", "service"],
    rail: "rail",
    light_rail: "rail",
    tram: "tram",
    ferry: "ferry",
    path: "path",
    pedestrian: "pedestrian",
    // landuse
    urban: ["residential", "suburb"],
    urban_area: ["residential", "suburb"],
    religion: "religious",
    // landcover
    wood: "wood",
    natural_wood: "wood",
    forest: "wood",
    meadow: "grassland",
    beach: "sand",
    // places
    locality: "hamlet",
    region: "state"
};

/** kind_detail（roads 细等级）→ OMT class：全部 1:1，无需表。 */

/**
 * 需要结构替换的 kind（值映射表达不了的）。替换表达式在目标层上下文
 * 生成：boundaries 的 country/region 在 OMT 里是 admin_level 数值。
 */
const KIND_STRUCTURED: Record<string, (layer: string) => unknown[] | null> = {
    country: layer =>
        layer === "boundary" ? ["<=", ["get", "admin_level"], 2] : null,
    region: layer =>
        layer === "boundary"
            ? ["all", [">", ["get", "admin_level"], 2], ["<=", ["get", "admin_level"], 4]]
            : null
};

type JsonExpr = unknown[];

/** 在表达式树里找 $layer 的比较目标（决定本条目的层上下文）。 */
function findLayerTarget(when: unknown): string | undefined {
    if (!Array.isArray(when)) {
        return undefined;
    }
    const [op, ...args] = when;
    if (
        (op === "==" || op === "!=") &&
        args.length === 2 &&
        Array.isArray(args[0]) &&
        args[0][0] === "get" &&
        args[0][1] === "$layer" &&
        typeof args[1] === "string"
    ) {
        return args[1];
    }
    for (const arg of args) {
        const found = findLayerTarget(arg);
        if (found !== undefined) {
            return found;
        }
    }
    return undefined;
}

function rewriteOperand(operand: unknown, layer: string): unknown {
    // tilezen 的 kind/kind_detail 在 OMT 里统一叫 class
    if (Array.isArray(operand) && operand[0] === "get") {
        if (operand[1] === "kind_detail") {
            return ["get", "class"];
        }
        if (operand[1] === "kind") {
            return ["get", "class"];
        }
    }
    return operand;
}

function rewriteValue(field: string, value: unknown, layer: string): unknown {
    if (field === "$layer") {
        return typeof value === "string" ? (LAYER_MAP[value] ?? value) : value;
    }
    if (field === "kind" && typeof value === "string") {
        const structured = KIND_STRUCTURED[value];
        if (structured !== undefined) {
            return structured(layer) ?? value;
        }
        const mapped = KIND_CLASS_MAP[value];
        return mapped ?? value;
    }
    return value;
}

function rewriteWhen(when: unknown, layer: string): unknown {
    if (!Array.isArray(when)) {
        return when;
    }
    const [op, ...args] = when;

    // 全局属性重写：get kind/kind_detail → get class（含任意自定义 op
    // 内的操作数，如 "$="）
    if (op === "get" && (args[0] === "kind" || args[0] === "kind_detail")) {
        return ["get", "class"];
    }

    // ["ref", "extrudedBuildingsCondition"] → 展开为 OMT 楼体条件
    if (op === "ref" && args[0] === "extrudedBuildingsCondition") {
        return ["all", ["==", ["get", "$layer"], "building"], ["==", ["geometry-type"], "Polygon"]];
    }

    // ==/!=/in 且左操作数是 get：重写字段名与值
    if (
        (op === "==" || op === "!=" || op === "in") &&
        args.length === 2 &&
        Array.isArray(args[0]) &&
        args[0][0] === "get"
    ) {
        const field = args[0][1] as string;
        const rewrittenOperand = rewriteOperand(args[0], layer);
        const target = args[1];

        if (op === "in" && Array.isArray(target) && target[0] === "literal") {
            const values = (target[1] as unknown[])
                .map(v => rewriteValue(field, v, layer))
                .flatMap(v => (Array.isArray(v) ? v : [v]));
            return [op, rewrittenOperand, ["literal", values]];
        }

        const rewrittenValue = rewriteValue(field, target, layer);
        // 值映射展开成数组（如 highway → motorway+trunk）时升级为 in
        if (Array.isArray(rewrittenValue)) {
            return [op === "==" ? "in" : op, rewrittenOperand, ["literal", rewrittenValue]];
        }
        // 结构替换（country/region → admin_level 表达式）
        if (Array.isArray(rewrittenValue) && rewrittenValue[0] === "<=") {
            return rewrittenValue;
        }
        if (
            rewrittenValue !== target &&
            field === "kind" &&
            typeof rewrittenValue === "object" &&
            rewrittenValue !== null
        ) {
            // KIND_STRUCTURED 返回的完整表达式
            return rewrittenValue;
        }
        return [op, rewrittenOperand, rewrittenValue];
    }

    // 其余：递归重写参数
    return [op, ...args.map(a => rewriteWhen(a, layer))];
}

/**
 * 拉取现有 tilezen 皮肤并把其 "tilezen" styleset 转换为 OpenMapTiles
 * schema。除条件表达式外（层名/kind→class），一切保持皮肤原样。
 *
 * 附加桥接（HERE→OMT 的管线差异，不是新配色）：
 * - HERE 数据的特征自带 color/height 属性、由解码器注入；OMT 数据没有。
 *   楼体高度走 OMT 的 render_height / render_min_height（emitter 对
 *   technique.height 未设时查特征 "height"，OMT 里不存在该名）；
 * - 皮肤的 minZoomLevel 按 HERE 数据的显示层级设计（楼体 16 级），
 *   OMT 免费数据的存储瓦片最高 maxDataLevel（14）级，条目门槛高于它时
 *   解码期直接把特征全数丢弃（实证：minZoomLevel:16 → 楼体零渲染），
 *   因此把门槛夹到 maxDataLevel；
 * - 参考对齐（alignToReference）：皮肤是深蓝描边风格，与 harp 参考图
 *   （浅色街道 + 暖米楼体）的既有观感对齐——只动两处，取值全部来自
 *   皮肤自有色值，见函数注释。
 */
export async function loadTilezenStylesetForOpenMapTiles(
    maxDataLevel: number
): Promise<Theme["styles"]> {
    const skin = (await fetch("resources/tilezen_base.json").then(r => r.json())) as Theme;
    const original = skin.styles?.tilezen;
    if (!Array.isArray(original)) {
        throw new Error("tilezen_base.json styles.tilezen missing");
    }
    const transformed = (original as unknown[]).map(entry => {
        const styleEntry = entry as {
            when?: unknown;
            technique?: string;
            attr?: Record<string, unknown>;
            minZoomLevel?: number;
        };
        if (styleEntry.when === undefined) {
            return entry;
        }
        const layer = findLayerTarget(styleEntry.when) ?? "";
        const when = rewriteWhen(styleEntry.when, layer);
        const attr = bridgeOmTAttrs(styleEntry);
        const adapted: Record<string, unknown> = { ...styleEntry, when };
        if (attr !== undefined) {
            adapted.attr = attr;
        }
        // 数据源给不出比 maxDataLevel 更细的瓦片，条目门槛必须放行
        if (
            typeof styleEntry.minZoomLevel === "number" &&
            styleEntry.minZoomLevel > maxDataLevel
        ) {
            adapted.minZoomLevel = maxDataLevel;
        }
        alignToReference(adapted);
        return adapted;
    }) as StyleSet;
    (globalThis as { __adapted?: unknown }).__adapted = transformed;
    return { tilezen: transformed };
}

/**
 * 与 harp 参考图对齐的两处观感调整（取值均来自皮肤自身）：
 * 1. 道路描边 #3A4C69（该皮肤的深蓝描边签名色，所有道路 casing 条目
 *   共用）→ 皮肤的浅中性色 #DDDDDD（entry32 自带）。参考图街道为浅色
 *   细线，深蓝描边会让内街在 z16 全部糊成深蓝网。
 * 2. 楼体 emissive #78858C/0.85（冷灰蓝恒定自发光，为该皮肤的暗色调
 *   服务）→ 关闭。它把暖米楼体洗成灰蓝，参考图是干净的受光楼面。
 */
function alignToReference(entry: Record<string, unknown>): void {
    if (typeof entry.color === "string" && entry.color.toLowerCase() === "#3a4c69") {
        entry.color = "#DDDDDD";
    }
    if (entry.technique === "extruded-polygon") {
        entry.emissive = "#000000";
        entry.emissiveIntensity = 0;
    }
}

/**
 * 仅桥接 HERE→OMT 的属性管线差异，不注入任何颜色——皮肤条目的顶层
 * color（含 ["ref",…]）引擎原生解析，写进 attr 反而会覆盖皮肤原色
 * （StyleSetEvaluator 先处理顶层再处理 attr，后者胜出）。
 */
function bridgeOmTAttrs(entry: {
    technique?: string;
    attr?: Record<string, unknown>;
    when?: unknown;
}): Record<string, unknown> | undefined {
    if (entry.technique !== "extruded-polygon") {
        return undefined;
    }
    // OMT 高度属性桥接：emitter 查特征 "height"/"min_height"，OMT 叫
    // render_height/render_min_height；缺省 8m。楼体色沿用皮肤顶层 color。
    return {
        ...(entry.attr ?? {}),
        height: ["coalesce", ["get", "render_height"], 8],
        floorHeight: ["coalesce", ["get", "render_min_height"], 0]
    };
}

// 调试句柄：页面控制台检查转换产物
declare global {
    interface Window {
        __adapted?: unknown;
    }
}
