# 开发流程

本指南将帮助您了解 flywave.gl 的开发工作流程。

## 开发环境设置

### 系统要求

- Node.js: >=22.15.0
- pnpm: >=9.0.0 (推荐)

### 安装依赖

克隆项目仓库后，运行以下命令安装依赖：

```bash
pnpm install
```

这将安装所有必需的包并设置 pnpm workspace。

## 开发工作流程

### 启动开发服务器

启动示例项目的开发服务器：

```bash
pnpm start
```

启动后，在浏览器中访问 `http://localhost:8080/` 查看示例。

### 运行测试

#### 单元测试

```bash
# 运行单元测试
pnpm test

# 以调试模式运行测试
pnpm test-debug

# 在浏览器中运行测试
pnpm test-browser

# 运行测试并生成覆盖率报告
pnpm test-cov
```

#### 性能测试

```bash
# 在 Node.js 环境中运行性能测试
pnpm performance-test-node
```

#### 浏览器端测试

启动测试服务器：

```bash
pnpm start-tests
# Project is running at http://localhost:8080/
```

在另一个终端中运行测试：

```bash
npx mocha-webdriver-runner http://localhost:8080/ --chrome
npx mocha-webdriver-runner http://localhost:8080/ --headless-firefox
```

## 代码规范

### 代码质量检查

在提交代码前，请运行以下命令确保代码质量：

```bash
# 检查 ESLint 问题
pnpm eslint

# 自动修复 ESLint 问题
pnpm eslint:fix

# 检查代码格式
pnpm prettier

# 自动修复格式问题
pnpm prettier:fix
```

### 类型安全

- 使用强类型，避免使用 `any` 类型
- 确保 TypeScript 类型检查通过
- 为函数和变量添加明确的类型注解

### 命名规范

- 类和接口使用帕斯卡命名法（PascalCase）
- 方法和函数使用驼峰命名法（camelCase）
- 常量使用全大写字母和下划线分隔（UPPER_CASE）
- 私有成员变量使用 `m_` 前缀（如 `m_visibleTileSetOptions`）
- 只读属性使用 `readonly` 关键字

## 性能测试

在进行可能影响性能的更改时，请进行基线比较：

1. 建立基线结果：
   ```bash
   git checkout master
   PROFILEHELPER_COMMAND=baseline pnpm performance-test-node
   ```

2. 进行您的更改

3. 重新运行测试：
   ```bash
   pnpm performance-test-node --grep [specific test name]
   ```

4. 比较结果并确保性能没有显著下降

## 贡献指南

### 提交代码

1. 确保所有测试通过
2. 运行代码质量检查
3. 提交符合项目规范的代码

### 代码审查

- 确保代码逻辑清晰
- 添加适当的注释（尤其是复杂逻辑）
- 遵循项目编码规范

## 项目结构

```
flywave.gl/
├── @flywave/                    # 核心模块目录
│   ├── flywave-terrain-datasource/     # 地形数据源模块
│   ├── flywave-mapview/               # 地图视图核心模块
│   ├── flywave-geoutils/              # 地理空间工具模块
│   ├── flywave-datasource-protocol/   # 数据源协议模块
│   ├── flywave-map-controls/          # 地图控件模块
│   ├── flywave-utils/                 # 工具模块
│   └── ...                           # 其他模块
├── docs/                        # 文档目录
├── scripts/                     # 构建和开发脚本
├── test/                        # 测试目录
└── ...                          # 项目配置文件
```

## 下一步

- [开发脚本](./scripts) - 了解所有可用的开发命令
- [构建源码](./build) - 学习如何构建项目
- [测试](./testing) - 了解测试策略