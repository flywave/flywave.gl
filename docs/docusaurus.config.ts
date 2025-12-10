/* Copyright (C) 2025 flywave.gl contributors */

import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
const path = require("path");
const fs = require("fs");

const flywavePath = path.resolve(__dirname, '../@flywave/flywave.gl/dist');
const examplesPath = path.resolve(__dirname, '../@flywave/flywave-examples/resources/');
const examplesSrcPath = path.resolve(__dirname, '../@flywave/flywave-examples/src/real-world-ecological-farming'); 
const examplesSrcPath3dtilesAnimation = path.resolve(__dirname, '../@flywave/flywave-examples/src/3dtiles-animation'); 

const config: Config = {
    title: "FlywaveGL",
    url: "https://flywave.gl",
    baseUrl: "/flywave.gl/",

    favicon: "img/favicon.ico",
    tagline: "3D 地图渲染引擎",

    future: {
        v4: true
    },

    organizationName: "flywave",
    projectName: "FlywaveGL",

    onBrokenLinks: "warn",
    onBrokenAnchors: "warn", 
    i18n: {
        defaultLocale: "en",
        locales: ["en", "zh"],
        localeConfigs: {
            en: {
                label: "English",
                direction: "ltr"
            },
            zh: {
                label: "中文",
                direction: "ltr"
            }
        }
    },

    presets: [
        [
            "@docusaurus/preset-classic",
            {
                docs: {
                    breadcrumbs: false,
                    sidebarPath: "./sidebars.ts",
                    editUrl: "https://github.com/flywave/flywave.gl/tree/main/docs/"
                },
                blog: {
                    showReadingTime: true,
                    feedOptions: {
                        type: ["rss", "atom"],
                        xslt: true
                    },
                    editUrl: "https://github.com/flywave/flywave.gl/tree/main/docs/",
                    onInlineTags: "warn",
                    onInlineAuthors: "warn",
                    onUntruncatedBlogPosts: "warn",
                    authorsMapPath: "blog/authors.yml"
                },
                theme: {
                    customCss: "./src/css/custom.css"
                }
            } satisfies Preset.Options
        ]
    ],
    // 更新 staticDirectories 配置
    staticDirectories: [
        "./static",  // 确保包含静态目录
        flywavePath, 
        examplesPath,
        // 保留根目录映射（如果需要）
        examplesSrcPath, 
        examplesSrcPath3dtilesAnimation
    ],
    markdown: {
        format: 'mdx',
        mermaid: true,
        // 处理损坏的 Markdown 图像
        mdx1Compat: {
          admonitions: true,
          comments: true,
          headingIds: true,
        },
        // 忽略损坏的 Markdown 图像
        hooks: {
          onBrokenMarkdownImages: 'warn', // 或 'ignore' 
        },
    },
    themeConfig: {
        image: "img/docusaurus-social-card.jpg",
        colorMode: {
            defaultMode: 'light',
            disableSwitch: false,
            respectPrefersColorScheme: false
        },
        sidebar: {
            hideable: true,
            autoCollapseCategories: true
        },
        navbar: {
            title: "FlywaveGL",
            logo: {
                alt: "FlywaveGL Logo",
                src: "img/logo.svg"
            },
            items: [
                {
                    type: "docSidebar",
                    sidebarId: "tutorialSidebar",
                    position: "left",
                    label: "Documentation"
                },
                { to: "/examples", label: "Examples", position: "left" },
                { to: "/blog", label: "Blog", position: "left" },
                {
                    href: "https://github.com/flywave/flywave.gl",
                    label: "GitHub",
                    position: "right"
                },
                {
                    type: 'localeDropdown',
                    position: 'right',
                },
            ]
        },
        footer: {
            style: "dark",
            links: [
                {
                    title: "文档",
                    items: [
                        {
                            label: "入门指南",
                            to: "/docs"
                        },
                        {
                            label: "API 参考",
                            to: "/docs/api" // 更新为正确的 API 路径
                        }
                    ]
                },
                {
                    title: "示例",
                    items: [
                        {
                            label: "基础示例",
                            to: "/examples"
                        }
                    ]
                },
                {
                    title: "社区",
                    items: [
                        {
                            label: "GitHub",
                            href: "https://github.com/flywave/flywave.gl"
                        }
                    ]
                },
                {
                    title: "更多",
                    items: [
                        {
                            label: "博客",
                            to: "/blog"
                        }
                    ]
                }
            ],
            copyright: `Copyright © ${new Date().getFullYear()} flywave.gl. Built with Docusaurus.`
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
            additionalLanguages: ["batch", "json5", "powershell"]
        }
    } satisfies Preset.ThemeConfig
};

export default config;