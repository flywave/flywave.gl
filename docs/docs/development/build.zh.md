# 构建源码

本指南将介绍如何构建 flywave.gl 项目源码。

## 构建系统概览

flywave.gl 使用现代化的构建工具链：

- TypeScript Compiler (tsc): 编译 TypeScript 源码
- Webpack: 模块打包和资源处理
- pnpm: 工作区管理和依赖安装

## 构建命令

### 构建所有模块

```bash
# 构建所有工作区包并创建最终的捆绑包
pnpm i
```

## 开发构建

### 监听模式


### 启动开发服务器

```bash
# 启动示例项目的开发服务器
pnpm start

# 启动文档项目的开发服务器
pnpm run docs:start

# 启动测试项目的开发服务器
pnpm run start-tests
```

## 构建输出

构建过程在每个模块的 `lib/` 目录下生成：

- lib/src/: 编译后的 JavaScript 文件
- lib/types/: TypeScript 类型定义文件 (.d.ts)
- index.d.ts: 模块类型定义入口

对于捆绑包（如 @flywave/flywave.gl），构建输出位于 `dist/` 目录：
- .module.js: ES 模块格式
- .cjs.js: CommonJS 格式
- .d.ts: 类型定义文件

## 构建配置

### TypeScript 配置

项目使用以下配置文件：

- `tsconfig.json`: 主要配置
- `tsconfig.base.json`: 基础配置（被工作区模块继承）
- `tsconfig.karma.json`: 测试配置

### Webpack 配置

- `@flywave/flywave-examples/webpack.config.ts`: 示例项目配置
- `@flywave/flywave.gl/webpack.config.js`: 核心库配置

## 工作区构建

使用 pnpm 工作区功能管理多个包：

```bash
# 构建所有工作区包
pnpm -r build

# 构建特定包及其依赖
pnpm --filter @flywave/flywave-map-controls... build

# 构建特定包（不包含依赖）
pnpm --filter @flywave/flywave-map-controls build
```

## 问题排查

### 清理构建产物

如果遇到构建问题：

```bash
# 清理所有构建输出
pnpm run cleanup

# 或使用 tsc 命令
tsc --build --clean
```

### 解决常见问题

1. 类型错误:
   ```bash
   pnpm run eslint && pnpm run prettier
   ```

2. 依赖问题:
   ```bash
   pnpm install --force
   ```

3. 内存不足:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   pnpm build
   ```

## 自定义构建

### 环境变量

- `EXTRA_TSC_ARGS`: 传递给 TypeScript 编译器的额外参数

### 构建后验证

构建完成后验证输出：

```bash
# 检查构建文件
ls -la @flywave/flywave-mapview/lib/

# 运行示例验证构建
pnpm run build-examples && pnpm start
```

## 下一步

- [开发脚本](./scripts) - 了解更多构建和开发命令
- [测试](./testing) - 学习如何测试构建结果