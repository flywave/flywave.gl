# 安装

本指南将帮助您安装 flywave.gl 及其相关依赖项。

## 系统要求

- Node.js: >=22.15.0
- pnpm: >=9.0.0 (推荐) 或 npm

## 安装方式

### 使用 pnpm (推荐)

```bash
pnpm add @flywave/flywave.gl
```

### 使用 npm

```bash
npm install @flywave/flywave.gl
```

## 在浏览器中使用

由于 flywave.gl 由多个模块组成，没有预构建的捆绑包。您需要使用构建工具（如 Webpack、Vite 或 Parcel）来打包项目。

### 基础路径配置

在浏览器环境中使用 flywave.gl 时，您可能需要配置资源的基础路径：

```html
<script>
  // 在引入 flywave.gl 之前设置基础路径
  window.FLYWAVE_BASE_URL = "https://flywave.github.io/flywave.gl/resources/";
</script>
``` 

## 下一步

安装完成后，您可以：

- [查看基本使用示例](./usage) - 了解如何使用 flywave.gl 创建地图
- [运行示例项目](./examples) - 探索各种功能示例