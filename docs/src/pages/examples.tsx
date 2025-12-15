/* Copyright (C) 2025 flywave.gl contributors */

import React from "react";
import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Translate from '@docusaurus/Translate';
const Heading = require("@theme/Heading").default;

import styles from "./examples.module.css";
import { EXAMPLES_CONFIG } from "../examples";
import { EXAMPLE_CATEGORIES } from "@flywave/flywave-examples/src/example-categories";

interface Example {
    id: string;
    title: string;
    description: string;
    category: string;
    categoryCode?: string;
    order?: number;
    image?: string;
    code?: string;
    language?: string;
}

function ExamplesHeader() {
    const { siteConfig } = useDocusaurusContext();
    return (
        <header className={styles.heroBanner}>
            <div className="container">
                <Heading as="h1" className={styles.heroTitle}>
                    <Translate id="examples.title" description="The title for the examples page">
                        Examples
                    </Translate>
                </Heading>
                <p className={styles.heroSubtitle}>
                    <Translate id="examples.subtitle" description="The subtitle for the examples page">
                        Learn various features of flywave.gl through practical examples
                    </Translate>
                </p>
            </div>
        </header>
    );
}

function getExampleLink(exampleId: string): string {
    // 获取当前语言前缀
    const currentLangPrefix = typeof window !== 'undefined' 
        ? (window.location.pathname.startsWith('/zh/') ? '/zh' : 
           window.location.pathname.startsWith('/en/') ? '/en' : '') 
        : '';
    
    // 跳转到示例详情页，保持语言前缀
    return currentLangPrefix ? `${currentLangPrefix}/example-detail?id=${exampleId}` : `/example-detail?id=${exampleId}`;
}

function ExampleCard({ example }: { example: Example }) {
    return (
        <div className={styles.exampleCard}>
            <div className={styles.exampleImage}>
                {example.image ? (
                    <img 
                        src={example.image} 
                        alt={example.title}
                        className={styles.exampleThumbnail}
                    />
                ) : (
                    <div className={styles.placeholderImage}>{example.title}</div>
                )}
            </div>
            <div className={styles.exampleContent}>
                <h3>{example.title}</h3>
                <p className={styles.exampleDescription}>{example.description}</p>
                <p className={styles.exampleCategory}>{example.category}</p>
                <Link className={styles.exampleButton} to={getExampleLink(example.id)}>
                    <Translate id="examples.viewDetails" description="Button text to view example details">
                        View Details
                    </Translate>
                </Link>
            </div>
        </div>
    );
}

export default function Examples(): ReactNode {
    // 按类别分组示例
    const examplesByCategory: { [key: string]: Example[] } = {};
    EXAMPLES_CONFIG.forEach(example => {
        // 使用categoryCode作为键进行分组，如果没有则使用category
        const categoryKey = example.categoryCode || example.category;
        if (!examplesByCategory[categoryKey]) {
            examplesByCategory[categoryKey] = [];
        }
        examplesByCategory[categoryKey].push(example);
    });

    // 对每个分类中的示例按order字段排序
    Object.keys(examplesByCategory).forEach(categoryKey => {
        examplesByCategory[categoryKey].sort((a, b) => {
            // 如果都有order字段，按order排序
            if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
            }
            // 如果只有a有order字段，a排在前面
            if (a.order !== undefined) {
                return -1;
            }
            // 如果只有b有order字段，b排在前面
            if (b.order !== undefined) {
                return 1;
            }
            // 如果都没有order字段，按标题排序
            return a.title.localeCompare(b.title);
        });
    });

    // 根据EXAMPLE_CATEGORIES定义的顺序对分类进行排序
    const sortedCategories = [...EXAMPLE_CATEGORIES];
    
    // 获取当前语言环境
    const currentLocale = typeof window !== 'undefined' ? 
      (window.location.pathname.startsWith('/zh/') || document.documentElement.lang.includes('zh') ? 'zh' : 'en') : 'en';

    // 过滤出有示例的分类
    const categoriesWithExamples = sortedCategories.filter(category => 
        examplesByCategory[category.code] && examplesByCategory[category.code].length > 0
    );

    // 添加没有在EXAMPLE_CATEGORIES中定义但有示例的分类
    const definedCategoryCodes = new Set(EXAMPLE_CATEGORIES.map(cat => cat.code));
    const undefinedCategories = Object.keys(examplesByCategory).filter(
        categoryCode => !definedCategoryCodes.has(categoryCode)
    );

    return (
        <Layout>
            <ExamplesHeader />
            <main>
                <div className="container">
                    {/* 显示已定义的分类 */}
                    {categoriesWithExamples.map(category => {
                        const examples = examplesByCategory[category.code] || [];
                        return (
                            <div key={category.code} className={`${styles.categorySection} slide-in-up`}>
                                <Heading as="h2" className={styles.categoryTitle}>
                                    {currentLocale === 'zh' && category.nameZh ? category.nameZh : category.name}
                                </Heading>
                                <div className={styles.examplesGrid}>
                                    {examples.map(example => (
                                        <div key={example.id}>
                                            <ExampleCard example={example} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    
                    {/* 显示未定义的分类 */}
                    {undefinedCategories.map(categoryCode => {
                        const examples = examplesByCategory[categoryCode] || [];
                        const categoryName = examples.length > 0 ? examples[0].category : categoryCode;
                        return (
                            <div key={categoryCode} className={`${styles.categorySection} slide-in-up`}>
                                <Heading as="h2" className={styles.categoryTitle}>
                                    {categoryName}
                                </Heading>
                                <div className={styles.examplesGrid}>
                                    {examples.map(example => (
                                        <div key={example.id}>
                                            <ExampleCard example={example} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </main>
        </Layout>
    );
}