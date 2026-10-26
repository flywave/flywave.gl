/* Copyright (C) 2025 flywave.gl contributors */

import { CESIUM_ION_TOKEN } from "./src/token-config";

/** Difficulty level of an example (v2 metadata, defaults to "beginner"). */
type ExampleLevel = "beginner" | "intermediate" | "advanced";

/** Data access policy of an example (v2 metadata, defaults to "open-data"). */
type ExampleDataPolicy = "offline" | "open-data" | "token";

/**
 * Definition of one example as generated into `example-definitions.js`.
 *
 * During the v2 migration most examples carry no metadata yet, so every field
 * except `src` is optional and all consumers must apply defaults. Plain string
 * values (v1 format) are still accepted for backwards compatibility.
 */
interface ExampleDefinition {
    /** Example entry source path, relative to the examples package root. */
    src?: string;
    title?: string;
    titleZh?: string;
    /** Category code (see `CATEGORIES`); legacy codes are remapped. */
    category?: string;
    level?: ExampleLevel;
    dataPolicy?: ExampleDataPolicy;
    tags?: string[];
    apis?: string[];
    /** Concern ids (U1-U40, U6 reserved) used by the "find by concern" filter. */
    concerns?: string[];
    /** Internal examples are hidden unless `?showInternal=1` is present. */
    internal?: boolean;
    /** Optional sort key inside a category (ascending). */
    order?: number;
}

type ExampleDefinitionMap = Record<string, ExampleDefinition | string>;

interface BrowserCategory {
    code: string;
    name: string;
    nameZh: string;
}

/**
 * The nine v2 example categories in display order. Categories without
 * examples are not rendered.
 */
const CATEGORIES: BrowserCategory[] = [
    { code: "getting-started", name: "Getting Started", nameZh: "入门指南" },
    { code: "data-sources", name: "Data Sources", nameZh: "数据源" },
    { code: "terrain-elevation", name: "Terrain & Elevation", nameZh: "地形与高程" },
    { code: "tiles-3d", name: "3D Tiles", nameZh: "3D Tiles" },
    { code: "styling-theming", name: "Styling & Theming", nameZh: "样式与主题" },
    { code: "rendering-effects", name: "Rendering Effects", nameZh: "渲染效果" },
    { code: "interaction", name: "Interaction", nameZh: "交互" },
    { code: "models-integration", name: "Models & Integration", nameZh: "模型与集成" },
    { code: "internal", name: "Internal Tools", nameZh: "内部工具" }
];

/** Maps legacy v1 category codes (example `config.code` field) to v2 codes. */
const LEGACY_CATEGORY_MAP: Record<string, string> = {
    "getting-started": "getting-started",
    "3dtiles-model-rendering": "tiles-3d",
    "terrain-elevation": "terrain-elevation",
    "advanced-rendering": "rendering-effects",
    "text-display": "styling-theming",
    "threejs-integration": "models-integration",
    "real-world-applications": "models-integration"
};

/**
 * Name-prefix fallback for examples without a usable category code.
 * First matching pattern wins.
 */
const CATEGORY_NAME_PATTERNS: Array<[RegExp, string]> = [
    [/^getting-started/, "getting-started"],
    [/^(3dtiles|tiles-)/, "tiles-3d"],
    [/^(terrain|dem-|heightmap|brush)/, "terrain-elevation"],
    [/^(draw-controls|camera-collision|gpu-pick|gpu-depth|picking)/, "interaction"],
    [/^(threejs|gltf|splat|real-world|demo)/, "models-integration"],
    [/^(post-processing|fog|color-grading|ssr|cloud|weather|depth-reading)/, "rendering-effects"],
    [/^(text|features)/, "styling-theming"],
    [/^test|-test$/, "internal"]
];

/** Display labels of the concern chips (U1-U40, U6 is reserved and unused). */
const CONCERN_LABELS: Record<string, string> = {
    U1: "快速上手",
    U2: "投影选择",
    U3: "底图样式",
    U4: "GeoJSON 显示",
    U5: "大数据量",
    U7: "影像服务接入",
    U8: "三维地形",
    U9: "地形修正",
    U10: "倾斜摄影/3D Tiles",
    U11: "3D Tiles 样式",
    U12: "模型放置",
    U13: "模型动画",
    U14: "点云",
    U15: "高斯泼溅",
    U16: "拾取高亮",
    U17: "信息窗",
    U18: "绘制测量",
    U19: "轨迹回放",
    U20: "实时数据驱动",
    U21: "3D 柱状可视化",
    U22: "文字标注",
    U23: "大气日照",
    U24: "天气效果",
    U25: "夜景",
    U26: "后期效果",
    U27: "反射水面",
    U28: "阴影",
    U29: "相机动画",
    U30: "跟随目标",
    U31: "相机碰撞",
    U32: "高程查询",
    U33: "性能内存",
    U34: "调试面板",
    U35: "React 集成",
    U36: "打包集成",
    U37: "截图导出",
    U38: "后端回退",
    U39: "多语言",
    U40: "版权合规"
};

interface LevelFilter {
    code: ExampleLevel | "all";
    label: string;
    badge: string;
    title: string;
}

/** Level filter bar definition. */
const LEVEL_FILTERS: LevelFilter[] = [
    { code: "all", label: "全部 All", badge: "", title: "All levels 全部等级" },
    { code: "beginner", label: "入门", badge: "B", title: "Beginner 入门" },
    { code: "intermediate", label: "进阶", badge: "I", title: "Intermediate 进阶" },
    { code: "advanced", label: "高级", badge: "A", title: "Advanced 高级" }
];

/** Data policy badge definitions; token examples are marked red. */
const DATA_POLICY_META: Record<ExampleDataPolicy, { label: string; className: string }> = {
    offline: { label: "Offline 离线", className: "badge-policy-offline" },
    "open-data": { label: "Open Data 开放数据", className: "badge-policy-open-data" },
    token: { label: "Token 令牌", className: "badge-policy-token" }
};

/** Styles for the v2 UI additions, injected once from the script. */
const BROWSER_CSS = `
.filter-toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.filter-chip { border: 1px solid var(--border-color); background: var(--background-panel);
    color: var(--text-secondary); border-radius: 999px; padding: 3px 12px; font-size: 12px;
    font-family: inherit; cursor: pointer; transition: all 0.15s ease; }
.filter-chip:hover { border-color: var(--primary-blue); color: var(--text-primary); }
.filter-chip.active { background: var(--primary-blue); border-color: var(--primary-blue); color: #fff; }
.concern-block { margin-top: 8px; border: 1px solid var(--border-color);
    border-radius: var(--border-radius); background: var(--background-panel); overflow: hidden; }
.concern-header { display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; font-size: 13px; font-weight: 500; color: var(--text-secondary);
    cursor: pointer; user-select: none; }
.concern-header:hover { color: var(--text-primary); }
.concern-chevron { transition: transform 0.2s ease; }
.concern-block.open .concern-chevron { transform: rotate(90deg); }
.concern-chips { display: none; flex-wrap: wrap; gap: 6px; padding: 0 12px 10px 12px; }
.concern-block.open .concern-chips { display: flex; }
.concern-chip { border: 1px solid var(--border-color); background: var(--background-element);
    color: var(--text-secondary); border-radius: 999px; padding: 2px 10px; font-size: 11px;
    font-family: inherit; cursor: pointer; transition: all 0.15s ease; }
.concern-chip:hover { border-color: var(--accent-teal); color: var(--text-primary); }
.concern-chip.active { background: var(--accent-teal); border-color: var(--accent-teal); color: #fff; }
.example-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.badge { display: inline-block; font-size: 10px; line-height: 1; padding: 3px 7px;
    border-radius: 999px; font-weight: 600; white-space: nowrap; }
.badge-level-beginner { background: #e8f5e9; color: #2e7d32; }
.badge-level-intermediate { background: #fff8e1; color: #b26a00; }
.badge-level-advanced { background: #ede7f6; color: #5e35b1; }
.badge-policy-offline { background: #e8f5e9; color: #2e7d32; }
.badge-policy-open-data { background: #e3f2fd; color: #1565c0; }
.badge-policy-token { background: #fdecea; color: #c62828; }
.badge-internal { background: #eceff1; color: #546e7a; }
#exampleList.searching .category-title { display: none; }
#sourceBar { display: none; align-items: center; gap: 8px; height: 65px;
    padding: 0 var(--spacing-md); flex-shrink: 0; border-top: 1px solid var(--border-color);
    background: var(--background-panel); font-size: 13px; color: var(--text-secondary); }
#sourceBar a { color: var(--primary-blue); font-weight: 500; }
#sourceBar a:hover { text-decoration: underline; }
`;

/**
 * Guidance shown inside the content frame when a token based example is
 * selected but no Cesium Ion token is configured. Bilingual on purpose.
 */
const TOKEN_GUIDANCE_HTML = `
<div style="max-width: 720px; margin: 0 auto; padding: 48px 24px; font-family: sans-serif;
    color: #0f172a; text-align: left;">
    <h1 style="font-size: 26px; margin: 0 0 20px 0;">Cesium Ion Token Required 需要访问令牌</h1>
    <p style="font-size: 14px; line-height: 1.7; margin: 0 0 12px 0;">
        This example uses Cesium Ion hosted assets (imagery, terrain or 3D Tiles) and requires a
        valid Cesium Ion access token. No token was found in this build, so the example was not
        loaded.
    </p>
    <p style="font-size: 14px; line-height: 1.7; margin: 0 0 20px 0;">
        该示例使用 Cesium Ion 托管的影像、地形或 3D Tiles 数据，需要有效的 Cesium Ion
        访问令牌。当前环境未检测到令牌，因此未加载该示例。
    </p>
    <h2 style="font-size: 16px; margin: 0 0 10px 0;">How to configure 如何配置</h2>
    <ol style="font-size: 14px; line-height: 1.9; margin: 0; padding-left: 20px;">
        <li>
            Register at cesium.com/ion and create an access token.
            在 cesium.com/ion 注册并创建一个访问令牌。
        </li>
        <li>
            Set the environment variable before building 构建前设置环境变量:
            <br /><code style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px;
            padding: 2px 6px; font-size: 13px;">export CESIUM_ION_TOKEN=your_token_here</code>
        </li>
        <li>
            Or inject it at runtime before opening the example 或在打开示例前于运行时注入:
            <br /><code style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px;
            padding: 2px 6px; font-size: 13px;">window.CESIUM_ION_TOKEN = "your_token_here";</code>
        </li>
        <li>Rebuild and reload this page. 重新构建并刷新本页面。</li>
    </ol>
</div>`;

type DomElementProps = Record<string, string>;

function createDomElement<T = HTMLElement>(name: string, options?: DomElementProps): T {
    const element = document.createElement(name) as any as T;
    if (options !== undefined) {
        Object.assign(element as any, options as any);
    }
    return element;
}

/**
 * Convert example link name to readable link title.
 *
 * When converting a path all path component extensions are removed.
 *
 * Example:
 *
 *     dist/hello.html -> hello
 *     dist/hello_react-native-web.html -> hello / react-native-web
 *
 * @returns human readable example name with components separated with '/'
 */
function getName(pageUrl: string) {
    const name = basename(pageUrl)
        .replace(/\.[a-z]+$/, "")
        .split("_");
    return name.join(" / ");
}

/**
 * Get base name of file, so all parent folders and trailing '/' are removed.
 */
function basename(path: string) {
    const i = path.lastIndexOf("/");
    if (i === -1) {
        return path;
    } else {
        return path.substr(i + 1);
    }
}

/**
 * Example browser HTML / DOM app.
 */
function exampleBrowser(exampleDefinitions: ExampleDefinitionMap) {
    const navPanel = document.getElementById("navPanel") as HTMLDivElement;
    const exampleFrameElement = document.getElementById("exampleFrame") as HTMLIFrameElement;
    const exampleListElement = document.getElementById("exampleList") as HTMLDivElement;
    const filterInput = document.getElementById("filterInput") as HTMLInputElement;

    /** Internal examples are only rendered with `?showInternal=1`. */
    const showInternal = new URLSearchParams(window.location.search).get("showInternal") === "1";

    /** Whether a Cesium Ion token is available for `dataPolicy: "token"` examples. */
    const tokenAvailable =
        typeof CESIUM_ION_TOKEN === "string" && CESIUM_ION_TOKEN.trim().length > 0;

    const categoryByCode = new Map(CATEGORIES.map(category => [category.code, category]));

    interface ExampleEntry {
        pageUrl: string;
        definition: ExampleDefinition;
        category: string;
        item: HTMLDivElement;
        link: HTMLAnchorElement;
        searchText: string;
        sortOrder: number;
    }

    interface CategorySection {
        section: HTMLDivElement;
        items: ExampleEntry[];
    }

    const entries: ExampleEntry[] = [];
    const categorySections = new Map<string, CategorySection>();
    /** Normalized definitions of rendered examples, keyed by page url. */
    const renderedDefinitions: Record<string, ExampleDefinition> = {};

    let isSearching: boolean = false;
    let selectedLevel: ExampleLevel | "all" = "all";
    let selectedConcern: string | undefined;

    /**
     * Query params parsed out of hash.
     *
     * Used by xyz example to reload with params while keeping internal state.
     */
    let queryParams = "";

    const sourceBar = createDomElement<HTMLDivElement>("div", { id: "sourceBar" });
    const sourceLabel = createDomElement<HTMLSpanElement>("span", {
        textContent: "源码 / Source:"
    });
    const sourceLink = createDomElement<HTMLAnchorElement>("a", {
        target: "_blank",
        rel: "noopener"
    });
    sourceBar.appendChild(sourceLabel);
    sourceBar.appendChild(sourceLink);

    installStyles();
    installHamburgerHandler();
    populateExamplesMenu();
    installLevelFilter();
    installConcernFilter();
    installFilter(filterInput);
    navPanel.appendChild(sourceBar);

    function installStyles() {
        const styleElement = document.createElement("style");
        styleElement.textContent = BROWSER_CSS;
        document.head.appendChild(styleElement);
    }

    function installHamburgerHandler() {
        const expandButton = document.getElementById("hamburgerMenu") as HTMLAnchorElement;
        const closeButton = document.getElementById("closeButton") as HTMLButtonElement;

        expandButton.addEventListener("click", event => {
            navPanel.classList.add("animating"); // Add animating class to prevent display: none during animation
            navPanel.classList.toggle("collapsed");
            // Adjust iframe position based on sidebar state
            if (navPanel.classList.contains("collapsed")) {
                exampleFrameElement.style.left = "0";
                exampleFrameElement.style.width = "100%";
            } else {
                exampleFrameElement.style.left = getComputedStyle(
                    document.documentElement
                ).getPropertyValue("--sidebar-width");
                exampleFrameElement.style.width =
                    "calc(100% - " +
                    getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width") +
                    ")";
            }
            // Ensure iframe fills the available space without scrollbars
            setTimeout(() => {
                exampleFrameElement.style.height = "100vh";
                navPanel.classList.remove("animating"); // Remove animating class after animation completes
            }, 300); // Match the CSS transition time
            event.preventDefault();
        });
        closeButton.addEventListener("click", event => {
            navPanel.classList.add("animating"); // Add animating class to prevent display: none during animation
            navPanel.classList.toggle("collapsed");
            // Adjust iframe position based on sidebar state
            if (navPanel.classList.contains("collapsed")) {
                exampleFrameElement.style.left = "0";
                exampleFrameElement.style.width = "100%";
            } else {
                exampleFrameElement.style.left = getComputedStyle(
                    document.documentElement
                ).getPropertyValue("--sidebar-width");
                exampleFrameElement.style.width =
                    "calc(100% - " +
                    getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width") +
                    ")";
            }
            // Ensure iframe fills the available space without scrollbars
            setTimeout(() => {
                exampleFrameElement.style.height = "100vh";
                navPanel.classList.remove("animating"); // Remove animating class after animation completes
            }, 300); // Match the CSS transition time
            event.preventDefault();
        });
    }

    /**
     * Dynamically import thumbnail using Webpack's dynamic import
     * This ensures images are properly bundled and available after build
     */
    async function loadThumbnail(thumbnail: HTMLDivElement, exampleName: string): Promise<void> {
        // Add loading class initially
        thumbnail.classList.add("loading");

        try {
            // Try to dynamically import the thumbnail image
            // Webpack will handle bundling these assets correctly
            const thumbnailModule = await import(`./src/${exampleName}/thumbnail.png`);
            thumbnail.style.backgroundImage = `url('${thumbnailModule.default}')`;
            thumbnail.classList.remove("loading");
            thumbnail.classList.add("loaded");
        } catch (error) {
            // If the specific thumbnail doesn't exist, use a styled fallback
            thumbnail.classList.remove("loading");
            thumbnail.classList.add("loaded", "fallback");
        }
    }

    /**
     * Fills in defaults for optional v2 fields and accepts plain string
     * definitions from before the v2 migration.
     */
    function normalizeDefinition(value: ExampleDefinition | string): ExampleDefinition {
        const definition: ExampleDefinition =
            typeof value === "string" ? { src: value } : { ...value };
        if (definition.level === undefined) {
            definition.level = "beginner";
        }
        if (definition.dataPolicy === undefined) {
            definition.dataPolicy = "open-data";
        }
        if (definition.internal === undefined) {
            definition.internal = false;
        }
        return definition;
    }

    /**
     * Resolves the v2 category of an example: the configured category code
     * wins, then legacy codes are remapped, then the example name prefix is
     * used as fallback. Returns `undefined` for examples that cannot be
     * mapped onto one of the nine v2 categories (they are not rendered).
     */
    function resolveCategory(definition: ExampleDefinition, pageUrl: string): string | undefined {
        const configured = definition.category;
        if (configured !== undefined) {
            if (categoryByCode.has(configured)) {
                return configured;
            }
            const legacy = LEGACY_CATEGORY_MAP[configured];
            if (legacy !== undefined) {
                return legacy;
            }
        }
        const name = basename(pageUrl).replace(/\.html$/, "");
        for (const [pattern, code] of CATEGORY_NAME_PATTERNS) {
            if (pattern.test(name)) {
                return code;
            }
        }
        return undefined;
    }

    function populateExamplesMenu() {
        Object.keys(exampleDefinitions)
            .sort()
            .forEach(pageUrl => {
                const definition = normalizeDefinition(exampleDefinitions[pageUrl]);
                const categoryCode = resolveCategory(definition, pageUrl);
                if (categoryCode === undefined) {
                    return;
                }
                const categoryMeta = categoryByCode.get(categoryCode);
                if (categoryMeta === undefined) {
                    return;
                }

                const linkName = getName(pageUrl).replace(new RegExp("-", "g"), " ");
                const linkElements = linkName.split(" / ");
                const visibleText =
                    linkElements.length === 1 ? linkName : linkElements.slice(1).join(" / ");
                const displayTitle = definition.titleZh ?? definition.title ?? visibleText;

                // Create container for example item with thumbnail
                const exampleItem = createDomElement<HTMLDivElement>("div", {
                    className: "example-item"
                });

                // Create thumbnail element
                const thumbnail = document.createElement("div");
                thumbnail.className = "example-thumbnail";

                // Extract example name for dynamic import
                const exampleName = pageUrl.split("/").pop()?.replace(".html", "") || "";

                // Load thumbnail asynchronously
                loadThumbnail(thumbnail, exampleName);

                // Create info container
                const infoContainer = createDomElement<HTMLDivElement>("div", {
                    className: "example-info"
                });

                // Create title element
                const titleElement = createDomElement<HTMLHeadingElement>("h3", {
                    className: "example-title",
                    textContent: displayTitle
                });

                // Create category element
                const categoryElement = createDomElement<HTMLParagraphElement>("p", {
                    className: "example-category",
                    textContent: categoryMeta.nameZh
                });

                // Append info elements
                infoContainer.appendChild(titleElement);
                infoContainer.appendChild(categoryElement);
                infoContainer.appendChild(createBadges(definition));

                // Create link element (hidden, for navigation)
                const linkElement = createDomElement<HTMLAnchorElement>("a", {
                    href: "#" + pageUrl,
                    className: "link",
                    style: "display: none;"
                });

                // Add click handler to example item to trigger link
                exampleItem.addEventListener("click", event => {
                    linkElement.click();
                });

                // Append thumbnail and info to example item
                exampleItem.appendChild(thumbnail);
                exampleItem.appendChild(infoContainer);
                exampleItem.appendChild(linkElement);

                renderedDefinitions[pageUrl] = definition;
                entries.push({
                    pageUrl,
                    definition,
                    category: categoryCode,
                    item: exampleItem,
                    link: linkElement,
                    searchText: buildSearchText(
                        definition,
                        linkName,
                        linkElements.length > 1 ? linkElements[0] : ""
                    ),
                    sortOrder: definition.order ?? Number.MAX_SAFE_INTEGER
                });
            });

        // Create category sections in fixed v2 order, skipping empty ones.
        CATEGORIES.forEach(category => {
            const categoryEntries = entries
                .filter(entry => entry.category === category.code)
                .sort((a, b) => a.sortOrder - b.sortOrder || a.pageUrl.localeCompare(b.pageUrl));
            if (categoryEntries.length === 0) {
                return;
            }
            const section = createDomElement<HTMLDivElement>("div", {
                className: "category-section"
            });

            // Create category title
            const categoryTitle = createDomElement<HTMLHeadingElement>("h2", {
                className: "category-title",
                textContent: `${category.nameZh} · ${category.name}`
            });

            // Append title to section
            section.appendChild(categoryTitle);

            // Append examples to section
            categoryEntries.forEach(entry => {
                section.appendChild(entry.item);
            });

            categorySections.set(category.code, { section, items: categoryEntries });
            exampleListElement.appendChild(section);
        });
    }

    /** Creates the level / data policy / internal badge row of a card. */
    function createBadges(definition: ExampleDefinition): HTMLDivElement {
        const badges = createDomElement<HTMLDivElement>("div", { className: "example-badges" });
        const levelFilter = LEVEL_FILTERS.find(
            filter => filter.code === (definition.level ?? "beginner")
        );
        if (levelFilter !== undefined && levelFilter.badge !== "") {
            badges.appendChild(
                createDomElement<HTMLSpanElement>("span", {
                    className: `badge badge-level-${levelFilter.code}`,
                    title: levelFilter.title,
                    textContent: levelFilter.badge
                })
            );
        }
        const policyMeta = DATA_POLICY_META[definition.dataPolicy ?? "open-data"];
        badges.appendChild(
            createDomElement<HTMLSpanElement>("span", {
                className: `badge ${policyMeta.className}`,
                title: policyMeta.label,
                textContent: policyMeta.label
            })
        );
        if (showInternal && definition.internal === true) {
            badges.appendChild(
                createDomElement<HTMLSpanElement>("span", {
                    className: "badge badge-internal",
                    title: "Internal 内部示例",
                    textContent: "Internal 内部"
                })
            );
        }
        return badges;
    }

    /** Builds the lowercased haystack used by the search box. */
    function buildSearchText(
        definition: ExampleDefinition,
        nameWithCategory: string,
        categoryName: string
    ): string {
        return [
            nameWithCategory,
            categoryName,
            definition.title,
            definition.titleZh,
            ...(definition.tags ?? []),
            ...(definition.apis ?? []),
            ...(definition.concerns ?? []).map(id => `${id} ${CONCERN_LABELS[id] ?? ""}`)
        ]
            .filter(part => typeof part === "string")
            .join(" ")
            .toLowerCase();
    }

    /** Installs the level filter chips below the search input. */
    function installLevelFilter() {
        const filterBlock = document.querySelector(".filterBlock");
        if (filterBlock === null) {
            return;
        }
        const toolbar = createDomElement<HTMLDivElement>("div", { className: "filter-toolbar" });
        LEVEL_FILTERS.forEach(levelFilter => {
            const chip = createDomElement<HTMLButtonElement>("button", {
                className: "filter-chip" + (levelFilter.code === "all" ? " active" : ""),
                type: "button",
                title: levelFilter.title,
                textContent: levelFilter.label
            });
            chip.addEventListener("click", () => {
                selectedLevel = levelFilter.code;
                toolbar
                    .querySelectorAll(".filter-chip")
                    .forEach(element => element.classList.remove("active"));
                chip.classList.add("active");
                applyFilters();
            });
            toolbar.appendChild(chip);
        });
        filterBlock.appendChild(toolbar);
    }

    /** Installs the collapsible "find by concern" panel below the search input. */
    function installConcernFilter() {
        const filterBlock = document.querySelector(".filterBlock");
        if (filterBlock === null) {
            return;
        }
        const block = createDomElement<HTMLDivElement>("div", { className: "concern-block" });
        const header = createDomElement<HTMLDivElement>("div", {
            className: "concern-header",
            title: "Find examples by concern / 按关注点查找示例"
        });
        const headerLabel = createDomElement<HTMLSpanElement>("span", {
            textContent: "按需求查找 / Find by concern"
        });
        const chevron = createDomElement<HTMLSpanElement>("span", {
            className: "concern-chevron",
            textContent: "▸"
        });
        header.appendChild(headerLabel);
        header.appendChild(chevron);

        const chips = createDomElement<HTMLDivElement>("div", { className: "concern-chips" });
        Object.keys(CONCERN_LABELS).forEach(id => {
            const chip = createDomElement<HTMLButtonElement>("button", {
                className: "concern-chip",
                type: "button",
                title: id,
                textContent: `${id} ${CONCERN_LABELS[id]}`
            });
            chip.addEventListener("click", () => {
                selectedConcern = selectedConcern === id ? undefined : id;
                chips
                    .querySelectorAll(".concern-chip")
                    .forEach(element => element.classList.remove("active"));
                if (selectedConcern === id) {
                    chip.classList.add("active");
                }
                applyFilters();
            });
            chips.appendChild(chip);
        });

        header.addEventListener("click", () => {
            block.classList.toggle("open");
        });
        block.appendChild(header);
        block.appendChild(chips);
        filterBlock.appendChild(block);
    }

    /**
     * Applies the search query, level filter and concern filter on top of the
     * internal-example visibility rule, then hides empty category sections.
     */
    function applyFilters() {
        const filterValue = (filterInput.value || "").trim().toLowerCase();

        entries.forEach(entry => {
            let visible = showInternal || entry.definition.internal !== true;
            if (
                visible &&
                selectedLevel !== "all" &&
                (entry.definition.level ?? "beginner") !== selectedLevel
            ) {
                visible = false;
            }
            if (
                visible &&
                selectedConcern !== undefined &&
                !(entry.definition.concerns ?? []).includes(selectedConcern)
            ) {
                visible = false;
            }
            if (visible && filterValue.length > 0 && !entry.searchText.includes(filterValue)) {
                visible = false;
            }
            entry.item.classList.toggle("filtered", !visible);
        });

        categorySections.forEach(sectionInfo => {
            const anyVisible = sectionInfo.items.some(
                entry => !entry.item.classList.contains("filtered")
            );
            sectionInfo.section.classList.toggle("filtered", !anyVisible);
        });
    }

    function goInSearchMode() {
        // Flat result list: hide category titles while searching
        exampleListElement.classList.add("searching");

        // Only try to access magnifier-placeholder if it exists
        const magnifierPlaceholder = document.getElementById("magnifier-placeholder");
        if (magnifierPlaceholder) {
            magnifierPlaceholder.style.cssText = "display:none;";
        }

        // Only try to access clearFilterButton if it exists
        const clearFilterButton = document.getElementById("clearFilterButton");
        if (clearFilterButton) {
            clearFilterButton.style.cssText = "";
        }
        isSearching = true;
    }

    function leaveSearchMode() {
        exampleListElement.classList.remove("searching");

        // Only try to access magnifier-placeholder if it exists
        const magnifierPlaceholder = document.getElementById("magnifier-placeholder");
        if (magnifierPlaceholder) {
            magnifierPlaceholder.style.cssText = "";
        }

        // Only try to access clearFilterButton if it exists
        const clearFilterButton = document.getElementById("clearFilterButton");
        if (clearFilterButton) {
            clearFilterButton.style.cssText = "display:none;";
        }

        filterInput.value = "";
        isSearching = false;
        applyFilters();
    }

    function installFilter(input: HTMLInputElement) {
        input.addEventListener("input", e => {
            const filterValue = (input.value || "").trim();

            if (filterValue.length > 0 && !isSearching) {
                goInSearchMode();
            }

            if (filterValue.length === 0 && isSearching) {
                leaveSearchMode();
            }

            applyFilters();
        });

        // Only add clear filter button event listener if the element exists
        const clearFilterButton = document.getElementById("clearFilterButton");
        if (clearFilterButton) {
            clearFilterButton.addEventListener("click", leaveSearchMode);
        }
    }

    /** Updates the sidebar source bar that links to the code browser. */
    function updateSourceBar(definition: ExampleDefinition | undefined) {
        if (definition === undefined || !definition.src) {
            sourceBar.style.display = "none";
            return;
        }
        sourceLink.href = `codebrowser.html?src=${encodeURIComponent(definition.src)}`;
        sourceLink.textContent = "查看源码 / View source";
        sourceBar.style.display = "flex";
    }

    /**
     * Shows configuration guidance inside the content frame instead of
     * loading an example that requires a missing Cesium Ion token.
     */
    function showTokenGuidance() {
        exampleFrameElement.style.backgroundColor = "#fffaf3";
        exampleFrameElement.style.backgroundImage = "none";
        const frameDocument = exampleFrameElement.contentWindow?.document;
        if (frameDocument !== undefined) {
            frameDocument.body.innerHTML = TOKEN_GUIDANCE_HTML;
        }
    }

    /**
     * Shows an example.
     *
     * @param pageUrl - example page url, must exist in `examples` map
     */
    function showExample(pageUrl: string) {
        const expandButton = document.getElementById("hamburgerMenu") as HTMLAnchorElement;
        expandButton.classList.toggle("expanded", !navPanel.classList.contains("collapsed"));
        const definition = renderedDefinitions[pageUrl];
        if (definition === undefined) {
            exampleListElement.style.bottom = "365px";
            updateSourceBar(undefined);
            exampleFrameElement.contentWindow!.document.body.innerHTML =
                `<p style="color:#888;font-size:20px;font-family:sans-serif;text-align:center;` +
                `top: 50%; margin-top: -100px; position: absolute; width: 100% ">` +
                `<strong style="font-size:80px; ">404</strong><br/>Example not found</p>`;
            return;
        }

        // update the hash
        window.location.hash = "#" + pageUrl;
        if (queryParams) {
            window.location.search = queryParams;
        }

        if (definition.dataPolicy === "token" && !tokenAvailable) {
            // Do not load the example; explain how to configure the token.
            showTokenGuidance();
        } else {
            // Set a soft background color before loading the page
            exampleFrameElement.style.backgroundColor = "#f8fafc";
            exampleFrameElement.style.backgroundImage =
                "radial-gradient(circle at 10% 20%, rgba(33, 150, 243, 0.05) 0%, transparent 20%), radial-gradient(circle at 90% 80%, rgba(0, 188, 212, 0.05) 0%, transparent 20%)";

            // load page in frame
            exampleFrameElement.src = pageUrl + queryParams;
        }

        // highlight selected element in list
        entries.forEach(entry => {
            const selected = entry.link.hash.substr(1) === pageUrl;
            entry.link.classList.toggle("selected", selected);
            entry.item.classList.toggle("selected", selected);
        });

        // update the source view link
        updateSourceBar(definition);
        exampleListElement.style.bottom = "65px";

        // Ensure iframe fills the available space without scrollbars
        setTimeout(() => {
            exampleFrameElement.style.height = "100vh";
            exampleFrameElement.style.overflow = "hidden";
        }, 100);

        // Keep the sidebar in its current state when showing examples - do not auto-collapse
    }

    /**
     * Show example based on `location.hash` if it's not empty.
     */
    function showExampleFromHash() {
        const hash = window.location.hash;
        if (hash) {
            let pageUrl;

            //check if query parameters are added after the pageUrl in hash
            queryParams = "";
            const match = window.location.hash.match(/([^\?]*)\?(.*)/);
            if (match !== null && match.length > 2) {
                //query parameters found: the file name should not include the query parameters
                pageUrl = match[1].substring(1);
                queryParams = "?" + match[2];
            } else {
                pageUrl = window.location.hash.substring(1);
            }

            // possibly merge current window query string with one parsed-out from hash
            if (window.location.search) {
                queryParams = queryParams
                    ? window.location.search + "&" + queryParams.substr(1)
                    : window.location.search;
            }
            showExample(pageUrl);
        }
    }

    // Set initial state - collapse the navPanel on page load
    navPanel.classList.add("collapsed");
    exampleFrameElement.style.left = "0";
    exampleFrameElement.style.width = "100%";

    window.addEventListener("hashchange", showExampleFromHash);
    showExampleFromHash();
}

/**
 * Example definition map generated by `webpack.config.js` into
 * `example-definitions.js`.
 */
declare const examples: ExampleDefinitionMap;

exampleBrowser(examples);
