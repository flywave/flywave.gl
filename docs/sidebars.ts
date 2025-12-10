/* Copyright (C) 2025 flywave.gl contributors */

import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
    // 常规文档侧边栏
    tutorialSidebar: [
        {
            type: "doc",
            id: "README",
            label: "Getting Started"
        },
        {
            type: "category",
            label: "Getting Started",
            items: [
                {
                    type: "doc",
                    id: "getting-started/installation",
                    label: "Installation"
                },
                {
                    type: "doc",
                    id: "getting-started/usage",
                    label: "Basic Usage"
                },
                {
                    type: "doc",
                    id: "getting-started/examples",
                    label: "Examples"
                }
            ]
        },
        {
            type: "category",
            label: "Development",
            items: [
                {
                    type: "doc",
                    id: "development/setup",
                    label: "Environment Setup"
                },
                {
                    type: "doc",
                    id: "development/guide",
                    label: "Development Guide"
                },
                {
                    type: "doc",
                    id: "development/scripts",
                    label: "Development Scripts"
                },
                {
                    type: "doc",
                    id: "development/build",
                    label: "Building Source Code"
                },
                {
                    type: "doc",
                    id: "development/testing",
                    label: "Testing"
                }
            ]
        },
        {
            type: "doc",
            label: "API Reference",
            id: "api/index"
        }
    ]
};

export default sidebars;