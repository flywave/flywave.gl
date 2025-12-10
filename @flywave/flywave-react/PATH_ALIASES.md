# TypeScript 路径别名配置

## 配置的别名映射

在 `tsconfig.json` 中配置了以下路径别名：

### 内部模块别名
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/components/*": ["src/components/*"],
      "@/hooks/*": ["src/hooks/*"],
      "@/examples/*": ["src/examples/*"],
      "@/types": ["src/types"],
      "@/utils/*": ["src/utils/*"]
    }
  }
}
```

### Flywave 包别名映射
```json
{
  "compilerOptions": {
    "paths": {
      "@flywave/flywave-mapview": ["../flywave-mapview/src"],
      "@flywave/flywave-mapview/*": ["../flywave-mapview/src/*"],
      "@flywave/flywave-map-controls": ["../flywave-map-controls/src"],
      "@flywave/flywave-map-controls/*": ["../flywave-map-controls/src/*"],
      "@flywave/flywave-geoutils": ["../flywave-geoutils/src"],
      "@flywave/flywave-geoutils/*": ["../flywave-geoutils/src/*"],
      "@flywave/flywave-utils": ["../flywave-utils/src"],
      "@flywave/flywave-utils/*": ["../flywave-utils/src/*"],
      "@flywave/flywave-vectortile-datasource": ["../flywave-vectortile-datasource/src"],
      "@flywave/flywave-vectortile-datasource/*": ["../flywave-vectortile-datasource/src/*"]
    }
  }
}
```

这些配置只包含当前 `flywave-react` 包实际依赖的相关包：

#### 核心依赖包：
- **@flywave/flywave-mapview** - 地图主视图模块
- **@flywave/flywave-map-controls** - 地图控制模块 
- **@flywave/flywave-geoutils** - 地理空间计算工具
- **@flywave/flywave-utils** - 通用工具模块

#### 示例中使用的包：
- **@flywave/flywave-vectortile-datasource** - 矢量瓦片数据源（用于示例）

## 使用示例

### Flywave 包导入的优势

```tsx
// 现在可以直接导入源代码，实现更好的开发体验：
import { MapView, MapViewOptions } from "@flywave/flywave-mapview";
import { MapControls } from "@flywave/flywave-map-controls";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { VectorTileDataSource } from "@flywave/flywave-vectortile-datasource";

// TypeScript 会直接引用源代码，提供更好的类型检查和开发体验
```

### Flywave 包别名的优势

1. **直接访问源代码** - 无需等待编译后的包，直接使用源代码
2. **更好的类型检查** - TypeScript 可以直接检查依赖包的源代码
3. **调试友好** - 可以直接在依赖包的源代码中设置断点
4. **热重载支持** - 修改依赖包时会自动重新编译
5. **monorepo 开发** - 完美支持 monorepo 架构的开发工作流

### 在组件中使用别名

```tsx
// 之前的相对路径导入
import { useMapContext } from "../MapProvider";
import { MapCanvasProps } from "../types";

// 使用别名后
import { useMapContext } from "@/MapProvider";
import { MapCanvasProps } from "@/types";
```

### 在hooks中使用别名

```tsx
// 之前的相对路径导入
import { useMapContext } from "../MapProvider";
import { MapEffectCallback } from "../types";

// 使用别名后
import { useMapContext } from "@/MapProvider";
import { MapEffectCallback } from "@/types";
```

### 在示例文件中使用别名

```tsx
// 之前的相对路径导入
import { useMapZoom, useMapCamera } from "../hooks/advanced";

// 使用别名后
import { useMapZoom, useMapCamera } from "@/hooks/advanced";
```

## 别名的优势

1. **更清晰的导入路径** - 不需要计算相对路径层级
2. **重构友好** - 移动文件时不需要更新大量的导入路径
3. **更好的IDE支持** - 自动完成和跳转功能更准确
4. **代码可读性** - 导入语句更加简洁明了

## 在IDE中配置

### VS Code
VS Code 会自动识别 `tsconfig.json` 中的路径配置，无需额外设置。

### WebStorm/IntelliJ
这些IDE也会自动识别TypeScript的路径配置。

## 构建时处理

在构建时，TypeScript编译器会自动解析这些别名路径并转换为正确的相对路径。

## 注意事项

1. **根目录文件** - `index.ts` 等根目录文件仍然使用相对路径
2. **测试文件** - 测试文件也可以使用这些别名
3. **Webpack配置** - 如果使用Webpack，可能需要额外配置路径解析