/* Copyright (C) 2025 flywave.gl contributors */

/* eslint-disable no-console */

import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import { createRequire } from "module";
const require = createRequire(import.meta.url);
/**
 * 修复可能导致 acorn 解析错误的内容
 * 基于搜索到的资料：TypeDoc 注释中的花括号需要转义
 */
function fixAcornConflicts(content: string): string {
    return (
        content
            // 转义花括号以避免 acorn 解析错误
            .replace(/{/g, "&#123;")
            .replace(/}/g, "&#125;")
            .replace(/<T>/g, "&lt;T&gt;")
            .replace("**Returns:**", "**Returns:**\n\n```typescript\n")
    );
}
/**
 * 处理生成的 Markdown 文件以修复 acorn 解析错误
 */
function processGeneratedMarkdownFiles(): void {
    const apiDocsPath = path.resolve("docs/docs/api");

    if (!fs.existsSync(apiDocsPath)) {
        console.log("API docs directory not found, skipping acorn fixes");
        return;
    }

    const files = fs.readdirSync(apiDocsPath);
    let fixedFiles = 0;

    files.forEach(file => {
        if (file.endsWith(".md")) {
            const filePath = path.join(apiDocsPath, file);
            let content = fs.readFileSync(filePath, "utf8");

            // 使用统一的函数处理所有非TypeScript代码块
            content = fixAcornConflicts(content);

            fs.writeFileSync(filePath, content);
            fixedFiles++;
        }
    });

    console.log("✅ Fixed acorn conflicts in " + fixedFiles + " markdown files");
}

async function main() {
    const reportFolder = path.resolve("input");
    const reportTempFolder = path.resolve("temp");

    fs.mkdirSync(reportFolder, { recursive: true });
    fs.mkdirSync(reportTempFolder, { recursive: true });

    // 定义所有要处理的包
    const packages = [
        "@flywave/flywave-mapview",
        "@flywave/flywave-features-datasource",
        "@flywave/flywave-geojson-datasource",
        "@flywave/flywave-terrain-datasource",
        "@flywave/flywave-vectortile-datasource",
        "@flywave/flywave-3dtile-datasource",
        "@flywave/flywave-draw-controls",
        "@flywave/flywave-map-controls",
        "@flywave/flywave-inspector"
    ];

    // 先构建所有包
    for (const packageName of packages) {
        const packageJson = require(`${packageName}/package.json`);

        const config = ExtractorConfig.prepare({
            packageJson,
            packageJsonFullPath: path.resolve(`${packageName}/package.json`),
            configObjectFullPath: path.resolve(`${packageName}`),
            configObject: {
                projectFolder: path.resolve(packageName),
                mainEntryPointFilePath: path.resolve(`${packageName}/lib/src/index.d.ts`),
                compiler: {
                    tsconfigFilePath: path.resolve(`${packageName}/tsconfig.json`),
                    overrideTsconfig: {
                        include: ["lib/**/*.d.ts"],
                        exclude: [
                            "src/**/*",
                            "node_modules/**/*",
                            "dist/**/*",
                            "**/*.test.ts",
                            "**/*.spec.ts",
                            "**/test/**/*"
                        ]
                    }
                },
                docModel: {
                    enabled: true,
                    apiJsonFilePath: `${reportFolder}/<unscopedPackageName>.api.json`
                },
                apiReport: {
                    enabled: true,
                    reportFolder,
                    reportTempFolder,
                    reportFileName: "<unscopedPackageName>.api.md"
                }
            }
        });

        const result = Extractor.invoke(config, {
            localBuild: true,
            messageCallback: message => {
                let loc = "";
                if (message.sourceFilePath !== undefined) {
                    loc += `${message.sourceFilePath}:`;
                    if (message.sourceFileLine !== undefined) {
                        loc += `${message.sourceFileLine}:`;
                        if (message.sourceFileColumn !== undefined) {
                            loc += `${message.sourceFileColumn}:`;
                        }
                    }
                    loc += " ";
                }
                console.warn(`${loc}(${message.category}) ${message.text} (${message.messageId})`);
            }
        });
        if (!result.succeeded) {
            throw new Error(`failed to extract api when processing '${packageName}'`);
        }
    }

    // 生成文档
    console.log(
        execSync("pnpm exec api-documenter markdown --output-folder docs/docs/api ").toString()
    );

    // 修复 acorn 解析错误
    console.log("🔧 Fixing acorn parsing conflicts...");
    processGeneratedMarkdownFiles();

    // 删除临时文件夹
    if (fs.existsSync(reportFolder)) {
        fs.rmSync(reportFolder, { recursive: true, force: true });
    }
    if (fs.existsSync(reportTempFolder)) {
        fs.rmSync(reportTempFolder, { recursive: true, force: true });
    }
}

main().catch(console.error);
