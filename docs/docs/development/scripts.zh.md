# 开发脚本

本指南介绍了 flywave.gl 项目中可用的开发脚本命令。

## 构建与开发

- `pnpm build` - 构建所有工作区包并创建最终的捆绑包
- `pnpm build-examples` - 构建示例项目
- `pnpm build-bundle` - 构建 flywave.gl 主捆绑包
- `pnpm build-tests` - 构建测试项目
- `pnpm start` - 启动示例项目的开发服务器
- `pnpm start-tests` - 启动测试项目的开发服务器

## 测试命令

- `pnpm test` - 运行单元测试（使用无头 Chrome）
- `pnpm test-debug` - 以调试模式运行测试（使用 Chrome）
- `pnpm test-browser` - 在浏览器中运行测试
- `pnpm test-cov` - 运行测试并生成覆盖率报告
- `pnpm performance-test-node` - 在 Node.js 环境中运行性能测试
- `pnpm karma-headless` - 使用无头 Chrome 运行 Karma 测试
- `pnpm karma-headless-firefox` - 使用无头 Firefox 运行 Karma 测试
- `pnpm karma-browser` - 在浏览器中运行 Karma 测试

## 代码质量检查

- `pnpm pre-test` - 运行预测试检查（包括代码检查、格式化和 ESLint）
- `pnpm eslint` - 运行 ESLint 检查
- `pnpm eslint:fix` - 自动修复 ESLint 可修复的问题
- `pnpm prettier` - 检查代码格式
- `pnpm prettier:fix` - 自动修复代码格式问题
- `pnpm code-pre-tests` - 运行代码预测试检查

## 文档生成

- `pnpm docs` - 生成 API 文档
- `pnpm docs:build` - 构建文档网站
- `pnpm docs:serve` - 本地启动文档网站
- `pnpm docs:deploy` - 部署文档网站
- `pnpm docs:validate` - 验证文档内容
- `pnpm docs:check-links` - 检查文档中的链接有效性

## 渲染测试

- `pnpm run-rendering-tests` - 运行渲染测试
- `pnpm save-reference-rendering-tests` - 保存渲染测试参考结果
- `pnpm approve-reference-rendering-tests` - 批准渲染测试参考结果

## 发布命令

- `pnpm publish-packages` - 使用 Lerna 发布所有公共包到 npm
- `pnpm publish-from-git` - 从 Git 标签发布包到 npm
- `pnpm publish-from-package` - 从 package.json 版本发布包到 npm
- `pnpm version-packages` - 更新包版本并创建 Git 标签

## 其他工具命令

- `pnpm cleanup` - 清理构建输出
- `pnpm postinstall` - 安装后自动生成 JSON Schema
- `pnpm prepare-doc-deploy` - 准备文档部署

## 常用工作流程

### 包发布工作流程

1. 确保所有更改已提交：
   ```bash
   git add .
   git commit -m "准备发布"
   git push
   ```

2. 更新包版本：
   ```bash
   pnpm version-packages
   ```

3. 发布到 npm：
   ```bash
   pnpm publish-packages
   ```

> **注意**: 在执行发布命令前，请确保已设置 `NPM_TOKEN` 环境变量，并且只有 `@flywave/flywave.gl` 和 `@flywave/flywave-react` 会被发布，其他包已设置为私有。

> **CI/CD 发布**: 在 CI/CD 环境中，项目还使用 `scripts/publish-packages.sh` 脚本来发布包，该脚本会执行 `pnpm publish -r --access public --tag alpha` 命令。

### 开发工作流程

1. 安装依赖：
   ```bash
   pnpm install
   ```

2. 启动开发服务器：
   ```bash
   pnpm start
   ```

3. 运行测试：
   ```bash
   pnpm test
   ```

### 构建发布版本

1. 构建所有包：
   ```bash
   pnpm build
   ```

2. 运行所有测试：
   ```bash
   pnpm test && pnpm test-cov
   ```

3. 检查代码质量：
   ```bash
   pnpm eslint && pnpm prettier
   ```