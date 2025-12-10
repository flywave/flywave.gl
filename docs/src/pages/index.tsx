/* Copyright (C) 2025 flywave.gl contributors */

import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Translate from '@docusaurus/Translate';
const Heading = require("@theme/Heading").default;

import styles from "./index.module.css";
//@ts-ignore
import FlywaveGlobe from "@site/src/components/FlywaveGlobe";

// src/components/icons/index.js
export const GlobeIcon = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

export const GamepadIcon = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 12h4m-2-2v4"/>
    <rect x="3" y="8" width="18" height="8" rx="1"/>
    <path d="M14 8h.01M18 8h.01"/>
  </svg>
);

export const LinkIcon = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

export const TextIcon = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 6.1H3m18 6H3m15 6H3M21 12h-4"/>
  </svg>
);

export const ShieldIcon = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

export const CubeIcon = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

function HomepageHeader() {
    const { siteConfig } = useDocusaurusContext();
    return (
        <header className={styles.heroBanner}>
            <div className="container">
                <div className={styles.heroContent}>
                    <div className={styles.heroText}>
                        <Heading as="h1" className={styles.heroTitle}>{siteConfig.title}</Heading>
                        <p className={styles.heroSubtitle}>{siteConfig.tagline}</p>
                        <div className={styles.heroDescription}>
                            <p>
                                <Translate id="homepage.description">
                                    一个基于 TypeScript 构建的开源 3D 地图渲染引擎，利用 WebGL 和 Three.js
                                    实现高性能、可扩展且模块化的地图可视化解决方案。
                                </Translate>
                            </p>
                        </div>
                        <div className={styles.buttons}>
                            <Link className={styles.primaryButton} to="/docs">
                                <Translate id="homepage.gettingStarted">
                                    入门指南 - 5分钟 ⏱️
                                </Translate>
                            </Link>
                            <Link className={styles.secondaryButton} to="/examples">
                                <Translate id="homepage.viewExamples">
                                    查看示例
                                </Translate>
                            </Link>
                        </div>
                    </div>
                    <div className={styles.heroVisual}>
                        <FlywaveGlobe />
                    </div>
                </div>
            </div>
        </header>
    );
}

function FeatureCard({
    icon,
    title,
    description
}: {
    icon: string;
    title: ReactNode;
    description: ReactNode;
}) {
    return (
        <div className={styles.featureCard}>
            <div className={styles.featureIcon}>{icon}</div>
            <h3 className={styles.featureTitle}>{title}</h3>
            <p className={styles.featureDescription}>{description}</p>
        </div>
    );
}

function FeaturesSection() {
    return (
        <section className={styles.featuresSection}>
            <div className="container">
                <div className={styles.sectionHeader}>
                    <div className={styles.sectionTag}>
                        FEATURES
                    </div>
                    <p className={styles.sectionSubtitle}>
                        <Translate id="homepage.features.subtitle">
                            Flywave.gl 提供全面的 3D 地图渲染能力，专为高性能可视化设计
                        </Translate>
                    </p>
                </div>
                <div className={styles.featuresGrid}>
                    <FeatureCard
                        icon="🌍"
                        title={<Translate id="homepage.features.data.title">多源数据支持</Translate>}
                        description={<Translate id="homepage.features.data.description">全面支持 3D Tiles、地形数据（DEM、Quantized Mesh等）、矢量瓦片等多种数据格式，构建丰富的三维地理信息可视化。</Translate>}
                    />
                    <FeatureCard
                        icon="👆"
                        title={<Translate id="homepage.features.navigation.title">流畅交互操作</Translate>}
                        description={<Translate id="homepage.features.navigation.description">优化的地图漫游体验，支持平滑的缩放、旋转和倾斜操作，提供直观自然的3D地图交互体验。</Translate>}
                    />
                    <FeatureCard
                        icon="🔗"
                        title={<Translate id="homepage.features.threejs.title">Three.js 深度集成</Translate>}
                        description={<Translate id="homepage.features.threejs.description">与 Three.js 无缝集成，充分利用 WebGL 的强大功能，便于复用 Three.js 生态资源和扩展自定义功能。</Translate>}
                    />
                    <FeatureCard
                        icon="✍️"
                        title={<Translate id="homepage.features.text.title">高级文字系统</Translate>}
                        description={<Translate id="homepage.features.text.description">支持多语言的高质量文本渲染系统，包含中文在内的多种语言显示，以及灵活的标注功能。</Translate>}
                    />
                    <FeatureCard
                        icon="🛡️"
                        title={<Translate id="homepage.features.typescript.title">TypeScript 优势</Translate>}
                        description={<Translate id="homepage.features.typescript.description">采用 TypeScript 构建，提供完整的类型定义和智能提示，增强代码可维护性，模块化架构支持按需加载。</Translate>}
                    />
                    <FeatureCard
                        icon="⚙️"
                        title={<Translate id="homepage.features.modular.title">模块化架构</Translate>}
                        description={<Translate id="homepage.features.modular.description">基于模块化设计，支持灵活的功能组合和扩展，便于构建高度定制化的3D地图应用。</Translate>}
                    />
                </div>
            </div>
        </section>
    );
}

function QuickStartSection() {
    return (
        <section className={styles.quickStartSection}>
            <div className="container">
                <Heading as="h2" className={styles.quickStartTitle}>
                    <Translate id="homepage.quickstart.title">
                        快速开始
                    </Translate>
                </Heading>
                <p className={styles.quickStartDescription}>
                    <Translate id="homepage.quickstart.description">
                        要开始使用 flywave.gl，您可以查看我们的示例教程，了解如何创建第一个地图应用。
                    </Translate>
                </p>
                <div className={styles.buttons}>
                    <Link className={`${styles.primaryButton} button--lg`} to="/examples">
                        <Translate id="homepage.quickstart.viewExamples">
                            查看示例
                        </Translate>
                    </Link>
                    <Link
                        className={`${styles.secondaryButton} button--lg ${styles["margin-left--sm"]}`}
                        to="/docs/"
                    >
                        <Translate id="homepage.quickstart.tutorialOverview">
                            教程概览
                        </Translate>
                    </Link>
                </div>
            </div>
        </section>
    );
}

export default function Home(): ReactNode {
    return (
        <Layout>
            <HomepageHeader />
            <main>
                <div className="fade-in">
                    <FeaturesSection />
                </div>
                <div className="slide-in-up">
                    <QuickStartSection />
                </div>
            </main>
        </Layout>
    );
}