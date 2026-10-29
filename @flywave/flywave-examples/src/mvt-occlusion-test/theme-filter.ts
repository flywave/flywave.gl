/* Copyright (C) 2025 flywave.gl contributors */

/**
 * theme 级隔离：按 `?mode=theme&only=…` 只保留皮肤里的一类条目，其余照常
 * 走真实瓦片/解码/technique 管线，两引擎平面投影 + 同一组灯光同机位对比。
 * harp 参考页内联了同一份过滤逻辑，token 语义必须保持一致。
 *
 * token（逗号分隔，任一命中即保留）：
 * - buildings        extruded-polygon
 * - roads            layer roads 的 solid-line / dashed-line
 * - lines            所有 solid-line / dashed-line
 * - fills            所有 fill
 * - water            description === "water" 的 fill
 * - landuse          layer landuse 的 fill
 * - labels           text / line-marker
 * - desc:<name>      description 精确匹配
 * - ro:<n>           renderOrder 精确匹配
 * - none             全部剔除（只剩地面底板）
 */

interface StyleEntryLike {
    technique?: string;
    description?: string;
    layer?: string;
    renderOrder?: number;
    when?: unknown;
}

const LINE_TECHNIQUES = new Set(["solid-line", "dashed-line"]);
const LABEL_TECHNIQUES = new Set(["text", "line-marker"]);

/** 条目的源图层：优先 `layer` 字段，否则从 when 表达式里找 `["get","$layer"]` 比较值。 */
function entryLayer(entry: StyleEntryLike): string | undefined {
    if (typeof entry.layer === "string") {
        return entry.layer;
    }
    const stack: unknown[] = [entry.when];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!Array.isArray(node)) {
            continue;
        }
        if (
            node[0] === "==" &&
            Array.isArray(node[1]) &&
            node[1][0] === "get" &&
            node[1][1] === "$layer" &&
            typeof node[2] === "string"
        ) {
            return node[2];
        }
        for (const child of node) {
            stack.push(child);
        }
    }
    return undefined;
}

function matches(entry: StyleEntryLike, token: string): boolean {
    const technique = entry.technique ?? "";
    switch (token) {
        case "buildings":
            return technique === "extruded-polygon";
        case "roads": {
            // 适配器已把 tilezen 的 roads 层改写成 OpenMapTiles 的 transportation
            const layer = entryLayer(entry);
            return (
                LINE_TECHNIQUES.has(technique) && (layer === "roads" || layer === "transportation")
            );
        }
        case "lines":
            return LINE_TECHNIQUES.has(technique);
        case "fills":
            return technique === "fill";
        case "water":
            return technique === "fill" && entry.description === "water";
        case "landuse":
            return technique === "fill" && entryLayer(entry) === "landuse";
        case "labels":
            return LABEL_TECHNIQUES.has(technique);
        case "none":
            return false;
        default:
            if (token.startsWith("desc:")) {
                return entry.description === token.slice(5);
            }
            if (token.startsWith("ro:")) {
                return entry.renderOrder === Number(token.slice(3));
            }
            return false;
    }
}

export function filterStyleEntries<T extends StyleEntryLike>(entries: T[], only: string): T[] {
    const tokens = only
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0);
    if (tokens.length === 0) {
        return entries;
    }
    return entries.filter(entry => tokens.some(token => matches(entry, token)));
}

/** harp berlin_tilezen_base 的三盏灯，原值复制，两引擎共用。 */
export const HARP_THEME_LIGHTS = [
    { type: "ambient", color: "#FFFFFF", name: "ambientLight", intensity: 0.9 },
    {
        type: "directional",
        color: "#CCCBBB",
        name: "light1",
        intensity: 0.8,
        direction: { x: 1, y: 5, z: 0.5 }
    },
    {
        type: "directional",
        color: "#F4DB9C",
        name: "light2",
        intensity: 0.8,
        direction: { x: -1, y: -3, z: 1 }
    }
] as const;
