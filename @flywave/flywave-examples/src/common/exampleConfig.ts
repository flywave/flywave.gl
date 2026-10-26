/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Difficulty level of an example, used for filtering and badge display.
 */
export type ExampleLevel = "beginner" | "intermediate" | "advanced";

/**
 * How an example acquires its data. Drives the offline-availability badge and
 * any token setup hints shown by the gallery.
 */
export type ExampleDataPolicy = "offline" | "open-data" | "token";

/**
 * Metadata for a single example, consumed by the example gallery/index pages.
 *
 * Instances are expected to be exported as `config` from an example's
 * `config.ts` (or inlined in its `index.ts`) and picked up by the build.
 */
export interface ExampleConfig {
    /** Display title (English). */
    title: string;
    /** Display title (Chinese). Optional fallback to {@link ExampleConfig.title}. */
    titleZh?: string;
    /** Short description (English). */
    description: string;
    /** Short description (Chinese). Optional fallback to {@link ExampleConfig.description}. */
    descriptionZh?: string;
    /** URL of the preview thumbnail image. */
    thumbnail: string;
    /** URL of the browsable source code. */
    code: string;
    /** Sort key inside a category; lower values are shown first. */
    order: number;
    /** Difficulty level. Optional; unclassified examples sort last per group. */
    level?: ExampleLevel;
    /** Free-form search tags (English). */
    tags?: string[];
    /** Names of the main engine APIs this example demonstrates. */
    apis?: string[];
    /** Notes about pitfalls or caveats worth calling out (English). */
    concerns?: string[];
    /** Data acquisition policy. Optional; treated as `"open-data"` when omitted. */
    dataPolicy?: ExampleDataPolicy;
    /** True for internal/diagnostic examples hidden from the public gallery. */
    internal?: boolean;
}

/**
 * A gallery category grouping examples in the example index.
 */
export interface IExampleCategory {
    /** Category name (English). */
    name: string;
    /** Category name (Chinese). */
    nameZh?: string;
    /** Stable category code used by example configs and URLs. */
    code: string;
}

/**
 * Canonical example categories for the v2 example gallery. The legacy
 * `src/example-categories.ts` will be migrated to re-export this table.
 */
export const EXAMPLE_CATEGORIES: IExampleCategory[] = [
    { name: "Getting Started", nameZh: "入门指南", code: "getting-started" },
    { name: "Data Sources", nameZh: "数据源", code: "data-sources" },
    { name: "Terrain & Elevation", nameZh: "地形与高程", code: "terrain-elevation" },
    { name: "3D Tiles", nameZh: "3D Tiles", code: "tiles-3d" },
    { name: "Styling & Theming", nameZh: "样式与主题", code: "styling-theming" },
    { name: "Rendering Effects", nameZh: "渲染效果", code: "rendering-effects" },
    { name: "Interaction", nameZh: "交互", code: "interaction" },
    { name: "Models & Integration", nameZh: "模型与集成", code: "models-integration" },
    { name: "Internal Tools", nameZh: "内部工具", code: "internal" }
];

/**
 * Bilingual labels for {@link ExampleLevel} values.
 */
export const LEVEL_LABELS: Record<ExampleLevel, { en: string; zh: string }> = {
    beginner: { en: "Beginner", zh: "入门" },
    intermediate: { en: "Intermediate", zh: "进阶" },
    advanced: { en: "Advanced", zh: "高级" }
};

/**
 * Bilingual labels for {@link ExampleDataPolicy} values.
 */
export const DATA_POLICY_LABELS: Record<ExampleDataPolicy, { en: string; zh: string }> = {
    offline: { en: "Offline data", zh: "离线数据" },
    "open-data": { en: "Open data", zh: "开放数据" },
    token: { en: "Requires token", zh: "需要 Token" }
};
