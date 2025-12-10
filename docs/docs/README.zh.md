# 🌍 Flywave.gl

[![CI](https://img.shields.io/github/actions/workflow/status/flywave/flywave.gl/ci.yaml?branch=master&style=for-the-badge&label=CI&logo=github)](https://github.com/flywave/flywave.gl/actions/workflows/ci.yaml)
[![Code Coverage](https://img.shields.io/codecov/c/github/flywave/flywave.gl/master?style=for-the-badge&logo=codecov&labelColor=2c3e50)](https://codecov.io/gh/flywave/flywave.gl)
[![Twitter](https://img.shields.io/badge/Twitter-@flywave.gl-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com/intent/tweet?text=Check%20out%20flywave.gl%20-%20an%20awesome%203D%20map%20engine!)

**一个基于 TypeScript 构建的开源 3D 地图渲染引擎**

*使用 WebGL 和 Three.js 创建高性能、可扩展的 3D 地图可视化解决方案*

[快速开始](#快速开始) · [文档](https://flywave.github.io/flywave.gl/) · [示例](https://flywave.github.io/flywave.gl/examples) · [官网](https://flywave.net)

---

## 项目简介

`flywave.gl` 是一个基于 TypeScript 构建的开源 3D 地图渲染引擎。该项目采用模块化 monorepo 架构，旨在提供一个高性能、可扩展且模块化的 3D 地图渲染解决方案。

您可以使用此引擎来：

- 🌍 **开发视觉上吸引人的 3D 地图** - 利用 WebGL 技术创建沉浸式地图体验
- 🎨 **使用 WebGL 创建高度动画和动态的地图可视化** - 基于流行的 [three.js](https://threejs.org/) 库
- 🎨 **创建可动态切换的主题地图** - 支持多种地图样式和主题
- ⚡ **通过高性能的地图渲染和解码创建流畅的地图体验** - Web Workers 并行化 CPU 密集型任务
- 🔧 **模块化设计地图** - 可以根据需要交换模块和数据提供者

## 系统截图

<div align="center">

|  |  |  |
| :----------------------------------------------------------: | :----------------------------------------------------------: | :----------------------------------------------------------: |
| <img src="/zh/screenshots/01-globe-view.png" alt="球面视图" width="200" /> | <img src="/zh/screenshots/02-terrain-rendering.png" alt="地形渲染" width="200" /> | <img src="/zh/screenshots/03-3dtiles-rendering.png" alt="3D Tiles渲染" width="200" /> |
|  |  |  |
| <img src="/zh/screenshots/04-post-processing.png" alt="后期处理" width="200" /> | <img src="/zh/screenshots/06-interactive-controls.png" alt="交互控制" width="200" /> | <img src="/zh/screenshots/07-planar-map.png" alt="平面地图" width="200" /> |
|  |  |  |
| <img src="/zh/screenshots/08-atmosphere.png" alt="大气效果" width="200" /> | <img src="/zh/screenshots/09-animation.png" alt="动画系统" width="200" /> | <img src="/zh/screenshots/11-lighting.png" alt="光照系统" width="200" /> |

</div>

## 文档

- [完整文档](https://flywave.github.io/flywave.gl) - API 文档、教程、最佳实践
- [示例集合](https://flywave.github.io/flywave.gl/examples) - 功能示例、代码片段
- [开发指南](./development/setup.md) - 环境搭建、构建说明
- [快速开始](./getting-started/installation.md) - 安装、基本使用
- [问题反馈](https://github.com/flywave/flywave.gl/issues) - Bug 报告、功能建议
- [社区讨论](https://github.com/flywave/flywave.gl/discussions) - 技术交流、使用帮助

## 快速开始

### 环境要求
- Node.js >= 22.15.0 (检查命令: `node --version`)
- pnpm >= 9.0.0 (检查命令: `pnpm --version`)

### 安装

**使用 pnpm (推荐):**
```bash
pnpm add @flywave/flywave.gl
```

**或使用 npm:**
```bash
npm install @flywave/flywave.gl
```

### 代码中使用

```ts
import { MapView, GeoCoordinates, sphereProjection } from "@flywave/flywave.gl";

const mapView = new MapView({
  projection: sphereProjection,
  target: new GeoCoordinates(36, 118),
  zoomLevel: 6,
  canvas: document.getElementById("mapCanvas") as HTMLCanvasElement
});
```

## 核心功能

- 🚀 **高性能渲染**: 利用 WebGL 和现代图形技术实现流畅的 3D 地图渲染
- 🔧 **模块化设计**: 可以根据需要选择和组合不同的功能模块
- 🎨 **可扩展主题**: 支持动态切换和自定义地图主题
- 🗺️ **多数据源支持**: 支持多种地图数据源格式
- 🖱️ **丰富的交互功能**: 提供完整的地图交互和控制功能
- 🌍 **多种投影方式**: 支持球面、平面和椭球投影
- 🏔️ **地形支持**: 内置数字高程模型 (DEM) 支持

---

## 许可证

Copyright © 2022-2025 [Flywave Project Authors](https://github.com/flywave)

Licensed under the [Apache License, Version 2.0](https://github.com/flywave/flywave.gl/blob/main/LICENSE).