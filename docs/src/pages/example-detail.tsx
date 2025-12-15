/* Copyright (C) 2025 flywave.gl contributors */

import React, { useState, useRef, useEffect, useCallback, useReducer } from "react";
import { useLocation } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import { Editor } from "@monaco-editor/react";

import styles from "./example-detail.module.css";
import { EXAMPLES_CONFIG } from "../examples";
import { EXAMPLE_CATEGORIES } from "@flywave/flywave-examples/src/example-categories";
import { CESIUM_ION_TOKEN } from "@flywave/flywave-examples/src/token-config";

export interface Example {
    id: string;
    title: string;
    description: string;
    category: string;
    categoryCode?: string;
    order?: number;
    code: string;
    language: string;
    image?: string;
}

// 定义站点配置的类型
interface SiteConfig {
    title?: string;
    tagline?: string;
    themeConfig?: {
        footer?: {
            copyright?: string;
        };
    };
    customFields?: {
        copyright?: string;
        cesiumIonToken?: string;
    };
}

// 使用 useReducer 来强制更新组件
const updateReducer = (state: number) => state + 1;

export default function ExampleDetail() {
    const location = useLocation();
    const { siteConfig } = useDocusaurusContext();
    const previewRef = useRef<HTMLDivElement>(null);
    const [exampleId, setExampleId] = useState<string>("hello-world");
    const [code, setCode] = useState<string>("");
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [editorWidth, setEditorWidth] = useState<number>(50);
    const [isResizing, setIsResizing] = useState<boolean>(false);
    const [isDarkTheme, setIsDarkTheme] = useState<boolean>(true);
    const [copyrightText, setCopyrightText] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [, forceUpdate] = useReducer(updateReducer, 0); // 用于强制更新

    // 获取当前示例对象
    const currentExample = EXAMPLES_CONFIG.find(ex => ex.id === exampleId) || EXAMPLES_CONFIG[0];

    // 初始化版权信息
    useEffect(() => {
        const config = siteConfig as SiteConfig;
        if (config?.customFields?.copyright) {
            setCopyrightText(config.customFields.copyright);
        } else if (config?.themeConfig?.footer?.copyright) {
            setCopyrightText(config.themeConfig.footer.copyright);
        } else {
            setCopyrightText(
                `Copyright © ${new Date().getFullYear()} flywave.gl. Built with Docusaurus.`
            );
        }
    }, [siteConfig]);

    // 初始化和处理URL参数
    useEffect(() => {
        const initExample = () => {
            if (EXAMPLES_CONFIG.length === 0) {
                console.error("示例配置为空");
                setIsLoading(false);
                return;
            }
            
            // 支持两种URL参数格式：查询参数 ?id=... 或路径参数 /example-detail/...
            // 首先尝试从查询参数获取
            const urlParams = new URLSearchParams(location.search);
            let urlExampleId = urlParams.get("id");
            
            // 如果查询参数中没有找到id，尝试从路径中解析（处理类似 /example-detail/xxx 的格式）
            if (!urlExampleId) {
                const pathSegments = location.pathname.split('/');
                // 查找可能包含id的路径段
                for (let i = 0; i < pathSegments.length; i++) {
                    if (pathSegments[i] === 'example-detail' && i + 1 < pathSegments.length) {
                        const potentialId = pathSegments[i + 1];
                        // 检查是否是有效的示例ID（存在于EXAMPLES_CONFIG中）
                        if (EXAMPLES_CONFIG.some(ex => ex.id === potentialId)) {
                            urlExampleId = potentialId;
                            break;
                        }
                    }
                }
            }
            
            // 如果仍然没有找到，使用默认值
            if (!urlExampleId) {
                urlExampleId = "hello-world";
            }
            
            // 确保示例存在
            const targetExample = EXAMPLES_CONFIG.find(ex => ex.id === urlExampleId) || EXAMPLES_CONFIG[0];
            
            // 设置示例ID和代码
            setExampleId(targetExample.id);
            setCode(targetExample.code);
            
            setIsLoading(false);
            
            // 立即运行示例，使用目标示例的代码，避免依赖可能未更新的状态
            setTimeout(() => {
                if (previewRef.current) {
                    runCodeWithContent(targetExample.code);
                }
            }, 50);
        };

        // 确保 EXAMPLES_CONFIG 已加载
        if (EXAMPLES_CONFIG.length > 0) {
            initExample();
        } else {
            // 如果 EXAMPLES_CONFIG 还没加载，等待一会儿再试
            const timer = setTimeout(initExample, 100);
            return () => clearTimeout(timer);
        }
    }, [location.pathname, location.search, EXAMPLES_CONFIG.length]); // 监听 EXAMPLES_CONFIG 长度变化

    // 监听URL变化并规范化URL格式，确保不带尾随斜杠
    useEffect(() => {
        // 检查当前URL是否包含尾随斜杠，并规范化为不带斜杠的格式
        if (location.pathname.includes('/example-detail/') && location.search.includes('id=')) {
            // 如果路径是 /example-detail/ 形式（带斜杠），将其规范化为 /example-detail 形式（不带斜杠）
            const normalizedPath = location.pathname.replace(/\/example-detail\/$/, '/example-detail');
            if (normalizedPath !== location.pathname) {
                // URL包含尾随斜杠，需要规范化，但不触发页面重新加载
                const normalizedUrl = `${normalizedPath}${location.search}`;
                // 仅在URL实际发生变化时进行替换
                if (normalizedUrl !== `${location.pathname}${location.search}`) {
                    window.history.replaceState({}, document.title, normalizedUrl);
                }
            }
        }
    }, [location.pathname, location.search]);

    // 监听路由变化，处理语言切换时的URL问题
    useEffect(() => {
        const handleLocationChange = () => {
            // 支持两种URL参数格式：查询参数 ?id=... 或路径参数 /example-detail/...
            const urlParams = new URLSearchParams(location.search);
            let urlExampleId = urlParams.get("id");
            
            // 如果查询参数中没有找到id，尝试从路径中解析
            if (!urlExampleId) {
                const pathSegments = location.pathname.split('/');
                // 查找可能包含id的路径段
                for (let i = 0; i < pathSegments.length; i++) {
                    if (pathSegments[i] === 'example-detail' && i + 1 < pathSegments.length) {
                        const potentialId = pathSegments[i + 1];
                        // 检查是否是有效的示例ID（存在于EXAMPLES_CONFIG中）
                        if (EXAMPLES_CONFIG.some(ex => ex.id === potentialId)) {
                            urlExampleId = potentialId;
                            break;
                        }
                    }
                }
            }
            
            if (!urlExampleId) {
                urlExampleId = "hello-world";
            }
            
            // 确保示例存在
            const targetExample = EXAMPLES_CONFIG.find(ex => ex.id === urlExampleId) || EXAMPLES_CONFIG[0];
            
            // 如果当前示例ID与URL参数不匹配，更新示例
            if (targetExample.id !== exampleId) {
                setExampleId(targetExample.id);
                setCode(targetExample.code);
                
                // 运行新示例
                setTimeout(() => {
                    if (previewRef.current) {
                        runCodeWithContent(targetExample.code);
                    }
                }, 0);
            }
        };

        // 监听location变化，包括语言切换
        handleLocationChange();
    }, [location.pathname, location.search, EXAMPLES_CONFIG, exampleId]);

    // 监听浏览器的 popstate 事件，处理前进后退和语言切换
    useEffect(() => {
        const handlePopState = () => {
            // URL发生变化时重新解析参数
            const urlParams = new URLSearchParams(location.search);
            let urlExampleId = urlParams.get("id");
            
            if (!urlExampleId) {
                const pathSegments = location.pathname.split('/');
                for (let i = 0; i < pathSegments.length; i++) {
                    if (pathSegments[i] === 'example-detail' && i + 1 < pathSegments.length) {
                        const potentialId = pathSegments[i + 1];
                        if (EXAMPLES_CONFIG.some(ex => ex.id === potentialId)) {
                            urlExampleId = potentialId;
                            break;
                        }
                    }
                }
            }
            
            if (!urlExampleId) {
                urlExampleId = "hello-world";
            }
            
            const targetExample = EXAMPLES_CONFIG.find(ex => ex.id === urlExampleId) || EXAMPLES_CONFIG[0];
            if (targetExample.id !== exampleId) {
                setExampleId(targetExample.id);
                setCode(targetExample.code);
                
                setTimeout(() => {
                    if (previewRef.current) {
                        runCodeWithContent(targetExample.code);
                    }
                }, 0);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [location.pathname, location.search, EXAMPLES_CONFIG, exampleId]);

    // 监听主题变化
    useEffect(() => {
        const handleThemeChange = () => {
            const isDark = document.documentElement.getAttribute("data-theme") === "dark";
            setIsDarkTheme(isDark);
        };

        handleThemeChange();

        const observer = new MutationObserver(handleThemeChange);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"]
        });

        return () => observer.disconnect();
    }, []);

    // 处理拖拽事件
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const container = document.querySelector(`.${styles.panelsContainer}`);
            if (!container) return;
            const containerRect = container.getBoundingClientRect();
            const relativeX = e.clientX - containerRect.left;
            const percentage = Math.min(Math.max((relativeX / containerRect.width) * 100, 20), 80);
            setEditorWidth(percentage);
        };

        const handleMouseUp = () => setIsResizing(false);

        if (isResizing) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [isResizing]);

    const handleRunCode = useCallback(() => {
        runCodeWithContent(code);
    }, [code]);

    const handleResetCode = () => {
        setCode(currentExample.code);
    };

    const handleFullscreen = () => {
        if (previewRef.current) {
            const iframe = previewRef.current.querySelector("iframe");
            if (iframe) {
                iframe.requestFullscreen?.().catch(err => {
                    console.error("全屏模式错误:", err);
                });
            }
        }
    };

    const handleBackToHome = () => {
        // 获取当前语言前缀
        const currentLangPrefix = window.location.pathname.startsWith('/zh/') ? '/zh' : 
                                  window.location.pathname.startsWith('/en/') ? '/en' : '';
        
        // 返回示例页面，保持语言前缀
        const homeUrl = currentLangPrefix ? `${currentLangPrefix}/examples` : '/examples';
        window.location.href = homeUrl;
    };

    const handleExampleSelect = (selectedExampleId: string) => {
        // 确保示例存在
        const selectedExample = EXAMPLES_CONFIG.find(ex => ex.id === selectedExampleId);
        if (!selectedExample) {
            console.error(`找不到示例: ${selectedExampleId}`);
            return;
        }

        // 同时更新ID和代码，确保同步
        setExampleId(selectedExample.id);
        setCode(selectedExample.code);

        // 更新URL参数，保持当前语言路径前缀，但去除路径末尾的斜杠
        const currentPath = window.location.pathname;
        const currentLangPrefix = currentPath.startsWith('/zh/') ? '/zh' : 
                                  currentPath.startsWith('/en/') ? '/en' : '';
        
        // 构建正确的URL路径，处理语言前缀，但不包含末尾斜杠
        let newUrlPath = currentLangPrefix ? `${currentLangPrefix}/example-detail` : '/example-detail';
        
        // 确保路径不以斜杠结尾，使查询参数直接连接
        if (newUrlPath.endsWith('/')) {
            newUrlPath = newUrlPath.slice(0, -1);
        }
        
        // 构建完整的URL，使用window.location.origin确保正确的协议和主机
        const newUrlString = `${window.location.origin}${newUrlPath}?id=${selectedExample.id}`;
        
        // 使用 replaceState 更新URL但不触发页面重载
        window.history.replaceState({}, '', newUrlString);

        // 立即运行新代码，使用新的代码内容，避免依赖可能未更新的状态
        setTimeout(() => {
            if (previewRef.current) {
                // 使用新示例的代码直接运行，而不依赖state
                runCodeWithContent(selectedExample.code);
            }
        }, 0);
    };

    // 新增一个函数，直接使用代码内容运行，避免依赖状态
    const runCodeWithContent = (codeContent: string) => {
        if (!previewRef.current || !codeContent) return;

        setIsRunning(true);

        // 清除之前的预览内容
        previewRef.current.innerHTML = '<div class="loading">正在加载示例...</div>';

        // 创建 iframe 来运行代码
        const iframe = document.createElement("iframe");
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "none";
        iframe.setAttribute("title", "示例预览");

        // 添加加载超时处理
        const timeoutId = setTimeout(() => {
            if (previewRef.current) {
                previewRef.current.innerHTML = '<div class="error">加载超时，请检查网络连接或重试</div>';
                setIsRunning(false);
            }
        }, 15000);

        // 等待 iframe 加载完成
        iframe.onload = () => {
            clearTimeout(timeoutId);
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc) {
                    throw new Error("无法访问 iframe 文档");
                }

                const isDarkTheme = document.documentElement.getAttribute("data-theme") === "dark";

                iframeDoc.open();
                iframeDoc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              :root {
                --background-color: ${isDarkTheme ? "#1e1e1e" : "#ffffff"};
                --font-color: ${isDarkTheme ? "#d4d4d4" : "#333333"};
                --error-color: #f48771;
                --loading-color: ${isDarkTheme ? "#888888" : "#666666"};
              }
              
              body {
                margin: 0;
                padding: 0;
                overflow: hidden;
                font-family: Arial, sans-serif;
                background: var(--background-color);
                color: var(--font-color);
              }
              #preview {
                width: 100vw;
                height: 100vh;
              }
              .error {
                color: var(--error-color);
                padding: 20px;
                font-family: monospace;
                overflow: auto;
                max-height: 100vh;
                background: var(--background-color);
              }
              .loading {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                font-size: 16px;
                color: var(--loading-color);
                background: var(--background-color);
              }
              @media screen and (max-width: 768px) {
                body {
                  font-size: 14px;
                }
                .error {
                  padding: 10px;
                }
              }
            #mapCanvas {
                position: absolute;
                border: 0px;
                left: 0px;
                width: 100%;
                height: 100%;
                overflow: hidden;
                z-index: -1;
            }
            </style>
            <script type="importmap">
            {
                "imports": { 
                    "three": "https://unpkg.com/three@0.178.0/build/three.module.js",
                    "three/examples/jsm/loaders/FBXLoader.js": "https://unpkg.com/three@0.178.0/examples/jsm/loaders/FBXLoader.js",
                    "@turf/turf": "https://cdn.jsdelivr.net/npm/@turf/turf@6.5.0/+esm",
                    "dat.gui": "https://unpkg.com/dat.gui@0.7.9/build/dat.gui.module.js",  
                    "@flywave/flywave.gl": "https://flywave.github.io/flywave.gl/flywave.gl.module.js",
                    "three-nebula": "./three-nebula.module.js"
                }
            }
            </script>
          </head>
            <body>
               <canvas id="mapCanvas"></canvas> 
                <script type="module"> 
                const CESIUM_ION_TOKEN = "${CESIUM_ION_TOKEN}";
                window.FLYWAVE_BASE_URL = ".";
               ${codeContent}
            </script>
          </body>
          </html>
        `);
                iframeDoc.close();
            } catch (error) {
                clearTimeout(timeoutId);
                if (previewRef.current) {
                    previewRef.current.innerHTML = `<div class="error">运行错误: ${error.message}</div>`;
                }
                setIsRunning(false);
            } finally {
                setIsRunning(false);
            }
        };

        // iframe 加载错误处理
        iframe.onerror = () => {
            clearTimeout(timeoutId);
            if (previewRef.current) {
                previewRef.current.innerHTML = '<div class="error">iframe 加载失败，请检查网络连接或重试</div>';
            }
            setIsRunning(false);
        };

        // 将 iframe 添加到预览区域
        previewRef.current.innerHTML = "";
        previewRef.current.appendChild(iframe);
    };

    // 按类别分组示例
    const examplesByCategory: { [key: string]: Example[] } = {};
    EXAMPLES_CONFIG.forEach(example => {
        const categoryKey = example.categoryCode || example.category;
        if (!examplesByCategory[categoryKey]) {
            examplesByCategory[categoryKey] = [];
        }
        examplesByCategory[categoryKey].push(example);
    });

    // 对每个分类中的示例按order字段排序
    Object.keys(examplesByCategory).forEach(categoryKey => {
        examplesByCategory[categoryKey].sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
            }
            if (a.order !== undefined) {
                return -1;
            }
            if (b.order !== undefined) {
                return 1;
            }
            return a.title.localeCompare(b.title);
        });
    });

    // 获取当前语言环境
    const currentLocale = typeof window !== 'undefined' ? 
      (window.location.pathname.startsWith('/zh/') || document.documentElement.lang.includes('zh') ? 'zh' : 'en') : 'en';

    // 根据EXAMPLE_CATEGORIES定义的顺序对分类进行排序
    const sortedCategories = [...EXAMPLE_CATEGORIES];
    const categoriesWithExamples = sortedCategories.filter(category => 
        examplesByCategory[category.code] && examplesByCategory[category.code].length > 0
    );

    const definedCategoryCodes = new Set(EXAMPLE_CATEGORIES.map(cat => cat.code));
    const undefinedCategories = Object.keys(examplesByCategory).filter(
        categoryCode => !definedCategoryCodes.has(categoryCode)
    );

    if (isLoading || EXAMPLES_CONFIG.length === 0) {
        //@ts-ignore
        return (<Layout wrapperClassName={styles.layoutWrapper} noFooter={true}>
                <div className={styles.mainWrapper}>
                    <div className={styles.loadingContainer}>
                        <div className={styles.loadingSpinner}>加载中...</div>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        //@ts-ignore
        <Layout wrapperClassName={styles.layoutWrapper} noFooter={true}>
            <div className={styles.mainWrapper}>
                <div className={styles.exampleDetailContainer}>
                    <div className={styles.sidebar}>
                        <div className={styles.sidebarHeader}>
                            <h2 className={styles.sidebarTitle}>
                                {currentLocale === 'zh' ? '示例列表' : 'Example List'}
                            </h2>
                            <div className={styles.sidebarActions}>
                                <button
                                    className={styles.sidebarBackButton}
                                    onClick={handleBackToHome}
                                >
                                    ← {currentLocale === 'zh' ? '返回示例首页' : 'Back to Examples'}
                                </button>
                            </div>
                        </div>
                        <div className={styles.exampleList}>
                            {/* 显示已定义的分类 */}
                            {categoriesWithExamples.map(category => {
                                const examples = examplesByCategory[category.code] || [];
                                return (
                                    <div key={category.code} className={styles.exampleCategory}>
                                        <div className={styles.categoryTitle}>
                                            {currentLocale === 'zh' && category.nameZh ? category.nameZh : category.name}
                                        </div>
                                        {examples.map(ex => (
                                            <div
                                                key={ex.id}
                                                className={`${styles.exampleItem} ${
                                                    ex.id === exampleId ? styles.active : ""
                                                }`}
                                                onClick={() => handleExampleSelect(ex.id)}
                                            >
                                                <div className={styles.exampleImage}>
                                                    {ex.image ? (
                                                        <img 
                                                            src={ex.image} 
                                                            alt={ex.title}
                                                            className={styles.exampleThumbnail}
                                                        />
                                                    ) : (
                                                        <div className={styles.placeholderImage}>
                                                            {ex.title}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className={styles.exampleContent}>
                                                    <div className={styles.exampleTitle}>
                                                        {ex.title}
                                                    </div>
                                                    <div className={styles.exampleDescription}>
                                                        {ex.description}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                            
                            {/* 显示未定义的分类 */}
                            {undefinedCategories.map(categoryCode => {
                                const examples = examplesByCategory[categoryCode] || [];
                                const categoryName = examples.length > 0 ? examples[0].category : categoryCode;
                                return (
                                    <div key={categoryCode} className={styles.exampleCategory}>
                                        <div className={styles.categoryTitle}>{categoryName}</div>
                                        {examples.map(ex => (
                                            <div
                                                key={ex.id}
                                                className={`${styles.exampleItem} ${
                                                    ex.id === exampleId ? styles.active : ""
                                                }`}
                                                onClick={() => handleExampleSelect(ex.id)}
                                            >
                                                <div className={styles.exampleImage}>
                                                    {ex.image ? (
                                                        <img 
                                                            src={ex.image} 
                                                            alt={ex.title}
                                                            className={styles.exampleThumbnail}
                                                        />
                                                    ) : (
                                                        <div className={styles.placeholderImage}>
                                                            {ex.title}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className={styles.exampleContent}>
                                                    <div className={styles.exampleTitle}>
                                                        {ex.title}
                                                    </div>
                                                    <div className={styles.exampleDescription}>
                                                        {ex.description}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className={styles.mainContent}>
                        <div className={styles.header}>
                            <div className={styles.headerContent}>
                                <h1 className={styles.headerTitle}>{currentExample.title}</h1>
                                <div className={styles.headerActions}>
                                    <button
                                        className={`${styles.actionButton} ${styles.primary}`}
                                        onClick={handleRunCode}
                                        disabled={isRunning}
                                    >
                                        {isRunning ? 
                                            (currentLocale === 'zh' ? "运行中..." : "Running...") : 
                                            (currentLocale === 'zh' ? "运行代码" : "Run Code")}
                                    </button>
                                    <button
                                        className={`${styles.actionButton} ${styles.secondary}`}
                                        onClick={handleResetCode}
                                        title={currentLocale === 'zh' ? "重置代码到初始状态" : "Reset code to initial state"}
                                    >
                                        {currentLocale === 'zh' ? "重置代码" : "Reset Code"}
                                    </button>
                                    <button
                                        className={`${styles.actionButton} ${styles.secondary}`}
                                        onClick={handleFullscreen}
                                    >
                                        {currentLocale === 'zh' ? "全屏预览" : "Fullscreen Preview"}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className={styles.panelsContainer}>
                            <div
                                className={styles.editorPanel}
                                style={{ width: `${editorWidth}%` }}
                            >
                                <div className={styles.panelHeader}>
                                    <span>{currentLocale === 'zh' ? "代码编辑器" : "Code Editor"}</span>
                                </div>
                                <div className={styles.editorWrapper}>
                                    <Editor
                                        language={currentExample.language}
                                        value={code}
                                        onChange={value => setCode(value || "")}
                                        theme={isDarkTheme ? "vs-dark" : "light"}
                                        options={{
                                            minimap: { enabled: false },
                                            scrollBeyondLastLine: false,
                                            automaticLayout: true,
                                            fontSize: 13,
                                            lineNumbers: "on",
                                            roundedSelection: false,
                                            smoothScrolling: true,
                                            wordWrap: "on",
                                            folding: true,
                                            renderLineHighlight: "all",
                                            scrollbar: {
                                                vertical: "auto",
                                                horizontal: "auto"
                                            }
                                        }}
                                    />
                                </div>
                                <div
                                    className={styles.resizer}
                                    onMouseDown={() => setIsResizing(true)}
                                />
                            </div>
                            <div
                                className={styles.previewPanel}
                                style={{ width: `${100 - editorWidth}%` }}
                            >
                                <div className={styles.panelHeader}>
                                    <span>{currentLocale === 'zh' ? "实时预览" : "Live Preview"}</span>
                                </div>
                                <div className={styles.previewWrapper}>
                                    <div ref={previewRef} className={styles.previewContent}>
                                        <div className={styles.previewPlaceholder}>
                                            <p>{currentLocale === 'zh' ? "实时预览区域" : "Live Preview Area"}</p>
                                            <p>{currentLocale === 'zh' ? '点击"运行代码"按钮查看效果' : 'Click "Run Code" button to see the result'}</p>
                                            <p>{currentLocale === 'zh' ? `当前示例: ${currentExample.title}` : `Current Example: ${currentExample.title}`}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                {/* 动态读取配置的底部版权信息 */}
                <div className={styles.footerOnlyCopyright}>
                    <div className={styles.footerCopyright}>{copyrightText}</div>
                </div>
            </div>
        </Layout>
    );
}
