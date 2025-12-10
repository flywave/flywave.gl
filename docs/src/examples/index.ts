/* Copyright (C) 2025 flywave.gl contributors */

import type { Example } from "../pages/example-detail";
import { EXAMPLE_CATEGORIES } from "@flywave/flywave-examples/src/example-categories";

// 动态导入所有示例配置
const examples: Example[] = [];

// 通过模块导入方式动态获取示例列表和配置
// 仅扫描@flywave/flywave-examples/src目录下的示例文件夹
const exampleContext = require.context("@flywave/flywave-examples/src", true, /config\.ts$/);

// 用于跟踪已添加的示例ID，防止重复
const addedExampleIds = new Set<string>();

// 获取当前语言环境
const getCurrentLocale = (): string => {
  if (typeof window !== 'undefined') {
    // 尝试从 URL 获取语言参数
    const urlParams = new URLSearchParams(window.location.search);
    const lang = urlParams.get('locale');
    if (lang && (lang === 'zh' || lang === 'en')) return lang;
    
    // 尝试从 localStorage 获取
    const storedLocale = localStorage.getItem('locale');
    if (storedLocale && (storedLocale === 'zh' || storedLocale === 'en')) return storedLocale;
    
    // 尝试从 Docusaurus 的语言路径获取
    if (window.location.pathname.startsWith('/zh/')) {
      return 'zh';
    }
    
    // 检查 HTML 根元素的语言属性
    const htmlLang = document.documentElement.lang;
    if (htmlLang && (htmlLang.includes('zh') || htmlLang.includes('en'))) {
      return htmlLang.includes('zh') ? 'zh' : 'en';
    }
  }
  return 'en'; // 默认语言
};

// 动态导入每个示例的配置和代码
exampleContext.keys().forEach((configKey: string) => {
    try {
        // 确保只处理@flywave/flywave-examples/src目录下的config.ts文件
        if (configKey.startsWith("./") && configKey.includes("/config.ts")) {
            // 从路径中提取示例名称
            const examplePath = configKey.replace("./", "").replace("/config.ts", "");
            const pathParts = examplePath.split("/");
            const exampleId = pathParts[0];

            // 检查示例是否已经添加过，防止重复
            if (exampleId && exampleId !== "src" && !addedExampleIds.has(exampleId)) {
                // 导入配置文件
                const config = exampleContext(configKey).default;

                // 获取编译后的示例代码作为原始字符串资源
                let code = "";
                try {
                    const jsModule = require(`!!raw-loader!@flywave/flywave-examples/src/${exampleId}/index.js`);
                    code = jsModule.default || jsModule;
                } catch (codeError) {
                    console.warn(`无法获取示例代码: ${exampleId}`, codeError);
                }

                // 根据当前语言环境决定使用哪种语言的标题和描述
                const currentLocale = getCurrentLocale();
                const title = currentLocale === 'zh' && config.titleZh ? config.titleZh : config.title;
                const description = currentLocale === 'zh' && config.descriptionZh ? config.descriptionZh : config.description;

                // 根据分类code获取分类名称（根据当前语言环境）
                const categoryInfo = EXAMPLE_CATEGORIES.find(cat => cat.code === config.code);
                let categoryName = config.code || "未分类";
                if (categoryInfo) {
                  categoryName = currentLocale === 'zh' && categoryInfo.nameZh ? categoryInfo.nameZh : categoryInfo.name;
                }

                examples.push({
                    id: exampleId,
                    title: title,
                    description: description,
                    category: categoryName,  // 使用映射后的分类名称
                    categoryCode: config.code,  // 保存分类code用于排序
                    order: config.order || 0,  // 保存排序字段
                    code: code,
                    language: "javascript",
                    image: config.thumbnail || ""
                });

                // 记录已添加的示例ID
                addedExampleIds.add(exampleId);
            }
        }
    } catch (error) {
        console.error(`加载示例配置失败: ${configKey}`, error);
    }
});

// 导出示例配置
export const EXAMPLES_CONFIG: Example[] = examples;
