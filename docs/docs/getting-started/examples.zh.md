# 示例指南

flywave.gl 提供了丰富的示例来帮助开发者快速上手和了解各种功能。所有示例位于 `@flywave/flywave-examples` 目录中。

## 示例分类

### 快速开始
- 基本配置示例: 展示如何配置基本的地图视图
- 相机动画示例: 展示相机动画和过渡效果
- 平面地图示例: 使用墨卡托投影的平面地图

### 地形与高程
- DEM 地形示例: 展示数字高程模型的使用
- 量化地形示例: 展示地形数据的量化处理
- 地形高程修改示例: 展示如何修改地形高程

### 3D Tiles 与模型渲染
- 3D Tiles 动画示例: 展示 3D Tiles 的动画效果
- 高斯点渲染示例: 展示高斯点模型的渲染
- 地形覆盖示例: 展示 3D Tiles 在地形上的叠加

### 相机与交互控制
- 相机动画示例: 展示相机的路径动画
- 交互控制示例: 展示地图的交互功能

### 绘制与标注
- 绘制控件示例: 展示在地图上绘制图形的功能

### 高级渲染效果
- 后期处理效果示例: 展示辉光、阴影等后期处理效果
- 光照系统示例: 展示 Three.js 光照系统集成

### 实际应用场景
- 管道示例: 展示管道系统的可视化
- 铁路示例: 展示铁路线路的可视化
- 电力系统示例: 展示电力传输线的可视化
- 生态农业示例: 展示农业应用的可视化
- 乡村花园示例: 展示城市规划应用

## 运行示例

### 本地运行

1. 启动示例服务器：
   ```bash
   pnpm start
   ```

2. 在浏览器中访问 `http://localhost:8080/` 查看所有示例

### 在项目中使用

在您的项目中使用 flywave.gl：

```bash
# 使用 pnpm
pnpm add @flywave/flywave.gl

# 或使用 npm
npm install @flywave/flywave.gl
```

### 独立运行特定示例

1. 进入示例目录：
   ```bash
   cd @flywave/flywave-examples
   ```

2. 安装依赖：
   ```bash
   pnpm install
   ```

3. 启动开发服务器：
   ```bash
   pnpm start
   ```

## 浏览在线示例

您也可以在我们的 [在线示例页面](https://flywave.github.io/flywave.gl/examples) 查看所有示例。

## 示例结构

每个示例包含以下文件：

- `index.ts` - 示例的主代码文件
- `config.ts` - 示例配置（可选）
- `index.html` - 示例的 HTML 模板（可选）

## 基础路径配置

当运行示例或自定义应用时，您可能需要配置基础路径来正确加载资源：

```html
<script>
  // 设置全局基础路径，确保资源文件正确加载
  window.FLYWAVE_BASE_URL = "https://flywave.github.io/flywave.gl/resources/";
</script>
```

如果未设置基础路径，flywave.gl 将尝试从默认位置加载资源文件。

## 学习路径

新用户建议按以下顺序学习示例：

1. [基本配置示例](https://flywave.github.io/flywave.gl/examples/basic-config) - 了解基本设置
2. [DEM 地形示例](https://flywave.github.io/flywave.gl/examples/dem-terrain) - 了解地形渲染
3. [3D Tiles 示例](https://flywave.github.io/flywave.gl/examples/3dtiles) - 了解 3D 模型渲染
4. [后期处理效果示例](https://flywave.github.io/flywave.gl/examples/post-processing) - 了解高级视觉效果
