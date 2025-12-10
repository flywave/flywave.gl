#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 文档根目录
const DOCS_ROOT = path.join(__dirname, '..');
const I18N_ROOT = path.join(__dirname, '..', 'i18n');

// 获取所有文档文件（不带语言后缀的文件，即英文版本）
function getAllDocFiles(dir, fileList = []) {
    try {
        const files = fs.readdirSync(dir);
        
        files.forEach(file => {
            const filePath = path.join(dir, file);
            try {
                const stat = fs.statSync(filePath);
                
                if (stat.isDirectory()) {
                    // 不再排除api目录
                    getAllDocFiles(filePath, fileList);
                } else if (path.extname(file) === '.md' && !file.includes('.zh.')) {
                    // 只包含不带语言后缀的基础文档（英文版本）
                    fileList.push(filePath);
                }
            } catch (err) {
                // 忽略无法访问的文件或目录
                console.warn(`Warning: Cannot access ${filePath}`);
            }
        });
    } catch (err) {
        console.error(`Error reading directory ${dir}: ${err.message}`);
        return fileList;
    }
    
    return fileList;
}

// 获取所有中文文档文件（带.zh.md后缀的文件）
function getAllZhDocFiles(dir, fileList = []) {
    try {
        const files = fs.readdirSync(dir);
        
        files.forEach(file => {
            const filePath = path.join(dir, file);
            try {
                const stat = fs.statSync(filePath);
                
                if (stat.isDirectory()) {
                    // 不再排除api目录
                    getAllZhDocFiles(filePath, fileList);
                } else if (path.extname(file) === '.md' && file.includes('.zh.')) {
                    // 只包含带.zh.md后缀的中文文档
                    fileList.push(filePath);
                }
            } catch (err) {
                // 忽略无法访问的文件或目录
                console.warn(`Warning: Cannot access ${filePath}`);
            }
        });
    } catch (err) {
        console.error(`Error reading directory ${dir}: ${err.message}`);
        return fileList;
    }
    
    return fileList;
}

// 获取相对路径（相对于docs目录）
function getRelativePath(filePath) {
    return path.relative(path.join(DOCS_ROOT, 'docs'), filePath);
}

// 获取对应的语言版本路径
function getLocalizedPath(filePath, locale) {
    // 对于中文文件，需要去掉.zh后缀
    let targetFileName = path.basename(filePath);
    if (locale === 'zh' && targetFileName.includes('.zh.')) {
        targetFileName = targetFileName.replace('.zh.', '.');
    }
    
    const relativePath = getRelativePath(filePath);
    const dirPath = path.dirname(relativePath);
    
    return path.join(I18N_ROOT, locale, 'docusaurus-plugin-content-docs', 'current', dirPath, targetFileName);
}

// 创建目录（如果不存在）
function ensureDirExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// 复制文件到目标位置（强制覆盖）
function copyFileToLocale(sourcePath, locale) {
    const targetPath = getLocalizedPath(sourcePath, locale);
    ensureDirExists(targetPath);
    
    // 强制复制源文件，总是覆盖目标文件
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Copied ${sourcePath} to ${targetPath}`);
}

// 为支持同一目录下zh.md的方案，创建新的同步函数
function syncBilingualDocs() {
    console.log('Scanning for bilingual documents...');
    
    // 遍历docs目录，查找带有语言后缀的文件
    function scanForBilingualFiles(dir, fileList = []) {
        try {
            const files = fs.readdirSync(dir);
            
            files.forEach(file => {
                const filePath = path.join(dir, file);
                try {
                    const stat = fs.statSync(filePath);
                    
                    if (stat.isDirectory()) {
                        // 不再排除api目录
                        scanForBilingualFiles(filePath, fileList);
                    } else if (path.extname(file) === '.md' && file.includes('.zh.')) {
                        fileList.push(filePath);
                    }
                } catch (err) {
                    // 忽略无法访问的文件或目录
                    console.warn(`Warning: Cannot access ${filePath}`);
                }
            });
        } catch (err) {
            console.error(`Error reading directory ${dir}: ${err.message}`);
            return fileList;
        }
        
        return fileList;
    }
    
    const bilingualFiles = scanForBilingualFiles(path.join(DOCS_ROOT, 'docs'));
    
    bilingualFiles.forEach(file => {
        const basename = path.basename(file);
        const dirname = path.dirname(file);
        
        // 获取不带语言后缀的目标文件名
        let targetName;
        if (basename.includes('.zh.')) {
            // 中文文件，复制到中文i18n目录，去掉语言后缀
            targetName = basename.replace('.zh.', '.');
        }
        
        // 确定目标语言
        let locale = 'zh';
        
        if (targetName) {
            const targetPath = path.join(I18N_ROOT, locale, 'docusaurus-plugin-content-docs', 'current', path.relative(path.join(DOCS_ROOT, 'docs'), dirname), targetName);
            ensureDirExists(targetPath);
            fs.copyFileSync(file, targetPath);
            console.log(`Synced ${locale} file: ${file} -> ${targetPath}`);
        }
    });
    
    console.log('Bilingual document synchronization completed.');
}

// 主函数
function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node doc-manager.js <command> [options]');
        console.log('Commands:');
        console.log('  list              - List all documentation files');
        console.log('  prepare-en        - Prepare English versions of all documents');
        console.log('  prepare-zh        - Prepare Chinese versions of all documents');
        console.log('  sync-bilingual    - Sync bilingual documents (files with .zh.md suffix)');
        return;
    }
    
    const command = args[0];
    
    switch (command) {
        case 'list':
            const files = getAllDocFiles(path.join(DOCS_ROOT, 'docs'));
            console.log('Documentation files:');
            files.forEach(file => {
                console.log(`  ${getRelativePath(file)}`);
            });
            break;
            
        case 'prepare-en':
            const enFiles = getAllDocFiles(path.join(DOCS_ROOT, 'docs'));
            enFiles.forEach(file => {
                copyFileToLocale(file, 'en');
            });
            console.log('English document preparation completed.');
            break;
            
        case 'prepare-zh':
            const zhFiles = getAllZhDocFiles(path.join(DOCS_ROOT, 'docs'));
            zhFiles.forEach(file => {
                copyFileToLocale(file, 'zh');
            });
            console.log('Chinese document preparation completed.');
            break;
            
        case 'sync-bilingual':
            syncBilingualDocs();
            break;
            
        default:
            console.log(`Unknown command: ${command}`);
    }
}

main();