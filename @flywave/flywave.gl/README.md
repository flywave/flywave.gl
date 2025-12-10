# @flywave/flywave.gl

[![NPM Version](https://img.shields.io/npm/v/@flywave/flywave.gl.svg?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@flywave/flywave.gl)
[![License](https://img.shields.io/npm/l/@flywave/flywave.gl.svg?style=for-the-badge)](https://github.com/flywave/flywave.gl/blob/master/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/@flywave/flywave.gl.svg?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@flywave/flywave.gl)

**一个基于 TypeScript 构建的开源 3D 地图渲染引擎**  
*使用 WebGL 和 Three.js 创建高性能、可扩展的 3D 地图可视化解决方案*

## 概述

`@flywave/flywave.gl` 是 flywave.gl 项目的完整功能包，集成了所有核心模块，提供了一个功能齐全的 3D 地图渲染引擎。该包采用模块化设计，旨在提供一个高性能、可扩展且模块化的 3D 地图渲染解决方案。

## 功能特性

- 🌍 **开发视觉上吸引人的 3D 地图** - 利用 WebGL 技术创建沉浸式地图体验
- 🎨 **使用 WebGL 创建高度动画和动态的地图可视化** - 基于流行的 [three.js](https://threejs.org/) 库
- 🎨 **创建可动态切换的主题地图** - 支持多种地图样式和主题
- ⚡ **通过高性能的地图渲染和解码创建流畅的地图体验** - Web Workers 并行化 CPU 密集型任务
- 🔧 **模块化设计地图** - 可以根据需要交换模块和数据提供者
- 🗺️ **多数据源支持** - 支持多种地图数据源格式（3D Tiles、矢量瓦片、Web 瓦片等）
- 🏔️ **地形支持** - 内置数字高程模型 (DEM) 支持
- 🖱️ **丰富的交互功能** - 提供完整的地图交互和控制功能
- 🌍 **多种投影方式** - 支持球面、平面和椭球投影

## 安装

```bash
npm install @flywave/flywave.gl
```

或

```bash
yarn add @flywave/flywave.gl
```

## 快速开始

```javascript
import * as flywave from '@flywave/flywave.gl';

// 创建地图视图
const mapView = new flywave.MapView({
  target: 'map-container',
  theme: 'dark'
});

// 添加数据源
const tileDataSource = new flywave.WebTileDataSource({
  name: 'basemap',
  tileUrls: ['https://example.com/tiles/{z}/{x}/{y}.png']
});

mapView.addDataSource(tileDataSource);
```

## 核心模块

此包包含了 flywave.gl 项目的所有核心模块：

- `@flywave/flywave-mapview` - 地图视图核心模块
- `@flywave/flywave-terrain-datasource` - 地形数据源模块
- `@flywave/flywave-map-controls` - 地图控件模块
- `@flywave/flywave-3dtile-datasource` - 3D 瓦片数据源模块
- `@flywave/flywave-datasource-protocol` - 数据源协议模块
- `@flywave/flywave-draw-controls` - 绘制控件模块
- `@flywave/flywave-webtile-datasource` - Web 瓦片数据源模块
- `@flywave/flywave-geoutils` - 地理空间工具模块
- `@flywave/flywave-features-datasource` - 特征数据源模块
- `@flywave/flywave-utils` - 工具模块
- `@flywave/flywave-vectortile-datasource` - 矢量瓦片数据源模块
- `@flywave/flywave-inspector` - 调试检查工具

## 文档资源

- [完整文档](https://flywave.net/docs) - API 文档、教程、最佳实践
- [示例集合](https://flywave.net/examples) - 功能示例、代码片段
- [官方网站](https://flywave.net) - 项目主页、最新动态
- [GitHub 仓库](https://github.com/flywave/flywave.gl) - 源代码、问题反馈

## 开发

### 环境要求

| 工具 | 版本要求 |
|------|----------|
| **Node.js** | >= 22.15.0 |
| **pnpm** | >= 9.0.0 |

### 安装与构建

```bash
# 安装依赖
pnpm install

# 构建项目
pnpm build
```

## 许可证

Copyright © 2022-2025 [Flywave Project Authors](https://github.com/flywave)

Licensed under the [Apache License, Version 2.0](https://github.com/flywave/flywave.gl/blob/master/LICENSE).