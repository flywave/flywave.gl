# 使用指南

## 快速开始

### 1. 安装依赖

```bash
# 安装必要的包
npm install @flywave/flywave-react @flywave/flywave-mapview @flywave/flywave-map-controls react react-dom

# 如果使用TypeScript
npm install -D @types/react @types/react-dom
```

### 2. 基础使用

```tsx
import React from 'react';
import { MapProvider, MapCanvas, useMap } from '@flywave/flywave-react';

function App() {
  return (
    <MapProvider
      theme="resources/tilezen_base.json"
      decoderUrl="./decoder.bundle.js"
    >
      <div style={{ width: '100vw', height: '100vh' }}>
        <MapCanvas />
        <MapControls />
      </div>
    </MapProvider>
  );
}

function MapControls() {
  const map = useMap();
  
  const zoomIn = () => {
    if (map) map.zoomLevel += 1;
  };
  
  return (
    <button onClick={zoomIn} style={{ position: 'absolute', top: 10, right: 10 }}>
      放大
    </button>
  );
}

export default App;
```

### 3. 添加数据源

```tsx
import { VectorTileDataSource } from '@flywave/flywave-vectortile-datasource';
import { useMapEffect } from '@flywave/flywave-react';

function DataSourceComponent() {
  useMapEffect((map) => {
    const dataSource = new VectorTileDataSource({
      baseUrl: "https://your-tile-server.com",
      // 其他配置...
    });
    
    map.addDataSource(dataSource);
    
    // 清理函数
    return () => {
      map.removeDataSource(dataSource);
    };
  }, []);
  
  return null;
}
```

### 4. 自定义Hooks使用

```tsx
import { useMapZoom, useMapCamera } from '@flywave/flywave-react';

function MapInfo() {
  const [zoomLevel, setZoom] = useMapZoom();
  const { position, lookAt } = useMapCamera();
  
  return (
    <div>
      <p>缩放级别: {zoomLevel.toFixed(2)}</p>
      {position && (
        <p>位置: {position.latitude.toFixed(4)}, {position.longitude.toFixed(4)}</p>
      )}
      <button onClick={() => setZoom(zoomLevel + 1)}>放大</button>
    </div>
  );
}
```

## 高级用法

### 地图事件处理

```tsx
import { useMapEvents } from '@flywave/flywave-react';

function MapEventHandler() {
  const { addEventListener, removeEventListener } = useMapEvents();
  
  useEffect(() => {
    const handleUpdate = () => {
      console.log('地图更新');
    };
    
    addEventListener('update', handleUpdate);
    
    return () => {
      removeEventListener('update', handleUpdate);
    };
  }, [addEventListener, removeEventListener]);
  
  return null;
}
```

### 主题切换

```tsx
import { useMapTheme } from '@flywave/flywave-react';

function ThemeSelector() {
  const { currentTheme, isChanging, changeTheme } = useMapTheme();
  
  const themes = [
    { name: '白天', url: 'day-theme.json' },
    { name: '夜晚', url: 'night-theme.json' },
  ];
  
  return (
    <div>
      {themes.map(theme => (
        <button
          key={theme.name}
          onClick={() => changeTheme(theme.url)}
          disabled={isChanging}
        >
          {theme.name}
        </button>
      ))}
    </div>
  );
}
```

### 地图交互

```tsx
import { useMapPicking } from '@flywave/flywave-react';

function ClickableMap() {
  const { pickGeoCoordinates } = useMapPicking();
  const [clickedPoint, setClickedPoint] = useState(null);
  
  const handleClick = (event) => {
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const coords = pickGeoCoordinates(x, y);
    setClickedPoint(coords);
  };
  
  return (
    <div onClick={handleClick}>
      <MapCanvas />
      {clickedPoint && (
        <div>点击位置: {clickedPoint.latitude}, {clickedPoint.longitude}</div>
      )}
    </div>
  );
}
```

## 最佳实践

### 1. 性能优化

- 使用 `useMapEffect` 而不是直接在 `useEffect` 中使用 `useMap`
- 在不需要时及时清理数据源和事件监听器
- 合理使用依赖数组避免不必要的重新渲染

### 2. 错误处理

```tsx
function ErrorBoundary({ children }) {
  // 实现错误边界组件
}

function App() {
  return (
    <ErrorBoundary>
      <MapProvider>
        <MapCanvas onMapInitialized={(map) => console.log('地图就绪')} />
      </MapProvider>
    </ErrorBoundary>
  );
}
```

### 3. 条件渲染

```tsx
function ConditionalMapComponent() {
  const map = useMap();
  
  if (!map) {
    return <div>地图加载中...</div>;
  }
  
  return <div>地图已就绪</div>;
}
```

## 常见问题

### Q: 如何获取地图实例？
A: 使用 `useMap()` hook 在任何子组件中获取地图实例。

### Q: 如何添加自定义控件？
A: 创建React组件，使用 `useMap()` 获取地图实例，然后实现控件逻辑。

### Q: 如何处理地图事件？
A: 使用 `useMapEvents()` hook 或直接在 `useMapEffect` 中添加事件监听器。

### Q: 如何优化性能？
A: 使用适当的依赖数组，及时清理资源，避免在每次渲染时创建新的对象。