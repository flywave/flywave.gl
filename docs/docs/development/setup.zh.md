# 环境搭建

本指南将帮助您设置 flywave.gl 的开发环境。

## 系统要求

- 操作系统: Windows, macOS, 或 Linux
- Node.js: >=22.15.0 (推荐使用 LTS 版本)
- pnpm: >=9.0.0 (推荐)
- 内存: 至少 8GB RAM (推荐 16GB+ 用于开发)
- 磁盘空间: 至少 2GB 可用空间

## 安装 Node.js

### 使用 Node.js 官方安装包

1. 访问 [Node.js 官网](https://nodejs.org/)
2. 下载并安装 LTS 版本 (>=22.15.0)

### 使用版本管理工具

#### 使用 nvm (推荐)

```bash
# 安装 nvm (如果尚未安装)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载终端配置
source ~/.bashrc

# 安装并使用所需版本的 Node.js
nvm install 22.15.0
nvm use 22.15.0
```

## 安装 pnpm

pnpm 是推荐的包管理器，它能提供更快的安装速度和更小的磁盘占用：

```bash
# 使用 npm 安装 pnpm
npm install -g pnpm@9.0.0

# 或使用 Corepack (Node.js 14.19+ 或 16.9+)
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

## 验证环境

验证 Node.js 和 pnpm 是否正确安装：

```bash
# 检查 Node.js 版本
node --version
# 应显示 v22.15.0 或更高版本

# 检查 pnpm 版本
pnpm --version
# 应显示 9.0.0 或更高版本
```

## 获取项目源码

```bash
# 克隆项目仓库
git clone https://github.com/flywave/flywave.gl.git
cd flywave.gl
```

## 安装项目依赖

```bash
# 使用 pnpm 安装所有依赖
pnpm install

# 这将安装所有工作区包的依赖项
```

## 初始构建

安装依赖后，进行初始构建：

```bash
# 构建所有包
pnpm build
```

## 验证开发环境

启动示例项目以验证环境是否正常：

```bash
# 启动开发服务器
pnpm start
```

如果一切正常，您可以在浏览器中访问 http://localhost:8080/ 看到 flywave.gl 示例。

## IDE 配置

### 推荐 IDE

- Visual Studio Code (推荐)
- WebStorm
- 其他支持 TypeScript 的编辑器

### VSCode 推荐扩展

- ESLint - JavaScript/TypeScript 代码检查
- Prettier - 代码格式化
- GitLens - Git 增强功能
- TypeScript Importer - 自动导入 TypeScript 模块

### 工作区设置

项目包含预配置的工作区设置，提供了 TypeScript、ESLint 和 Prettier 的集成。

## 开发工作流

### 分支策略

- 主分支: `main` (或 `master`)
- 功能开发: `feature/your-feature-name`
- 修复补丁: `fix/issue-description`

### 代码提交规范

- 使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范
- 提交消息格式: `<type>(<scope>): <description>`

## 故障排除

### 常见问题

1. 包安装失败:
   - 确保网络连接正常
   - 检查 Node.js 和 pnpm 版本是否符合要求
   - 尝试清理 pnpm 缓存：`pnpm store prune`

2. 构建失败:
   - 确保已安装所有依赖：`pnpm install`
   - 检查 TypeScript 版本兼容性

3. 内存不足错误:
   - 增加 Node.js 内存限制：`export NODE_OPTIONS="--max-old-space-size=4096"`

## 下一步

环境搭建完成后，您可以：

- [开发流程](./guide) - 了解开发工作流程
- [开发脚本](./scripts) - 学习可用的开发命令
- [运行示例](../getting-started/examples) - 探索示例项目