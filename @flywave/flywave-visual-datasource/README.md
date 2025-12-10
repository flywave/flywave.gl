# flywave-visual-datasource 项目文档

## 项目概述

flywave-visual-datasource 是一个专注于线和面绘制功能的数据源模块，支持与地面的多种相对关系处理，提供类似于 Cesium 的地形贴合功能。

## 文档目录

详细的文档请参考 [文档索引](docs/INDEX.md)，其中包含了所有相关文档的组织结构。

### 1. 核心设计文档
- [完整实现计划](docs/COMPLETE_IMPLEMENTATION_PLAN.md) - 项目的完整实现方案和路线图
- [技术分析](docs/TECHNICAL_ANALYSIS.md) - Cesium 与 flywave.gl 地形贴合机制的技术分析
- [改进方案](docs/IMPROVEMENT_PLAN.md) - 功能改进和优化方案

### 2. GPU 技术文档
- [GPU 实现方案](docs/GPU_IMPLEMENTATION_PLAN.md) - GPU 地形贴合技术的实现方案
- [GPU 技术文档](docs/GPU_TECHNICAL_DOCUMENTATION.md) - GPU 实现的详细技术说明

### 3. 架构设计文档
- [地形贴合 DataSource 设计](docs/TERRAIN_CLAMPED_DATASOURCE_DESIGN.md) - DataSource 架构设计

## 功能特性

### 当前聚焦功能
1. **线和面的基础绘制功能**
2. **与地面的多种相对关系处理**
3. **7种HeightReference类型支持**
4. **GPU地形贴合技术实现**

### 核心技术
1. **阴影体技术** - 实现精确的地形贴合
2. **深度测试集成** - 确保正确的渲染顺序
3. **模板测试优化** - 提高渲染性能
4. **着色器实现** - 高性能的 GPU 计算

## 项目结构

```
@flywave/flywave-visual-datasource/
├── src/                        # 源代码目录
│   ├── core/                   # 核心功能模块
│   ├── features/               # 特征类
│   ├── gpu/                    # GPU 相关实现
│   ├── datasource/             # DataSource 集成
│   ├── index.ts                # 入口文件
│   └── types/                  # 类型定义
├── docs/                       # 文档目录
├── test/                       # 测试文件
├── package.json                # 包配置
└── tsconfig.json               # TypeScript 配置
```

## 开发指南

### 环境要求
- Node.js >= 22.15.0
- pnpm >= 9.0.0

### 安装依赖
```bash
pnpm install
```

### 构建项目
```bash
pnpm build
```

### 运行测试
```bash
pnpm test
```

## 贡献指南

欢迎为 flywave-visual-datasource 项目贡献代码。请遵循以下步骤：

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 发起 Pull Request

## 许可证

Apache-2.0 License