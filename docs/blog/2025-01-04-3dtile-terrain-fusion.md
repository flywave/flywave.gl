---
title: 基于深度的3D Tiles与地形融合技术
tags: [3dtile, 地形融合, 可视化, 深度处理]
---

## 概述

在三维地理信息系统中，如何将三维模型（如管网、建筑物等）与地形进行无缝融合是一个重要的技术挑战。本文将介绍一种基于深度的后处理技术实现 3D Tiles 与地形融合，这种方法可以有效地处理模型与地形之间的遮挡关系，实现逼真的视觉效果。

## 基于深度的融合技术介绍

基于深度的融合技术是一种后处理特效，它允许对象以半透明的方式渲染，同时正确处理与其他场景对象的深度遮挡关系。该技术特别适用于需要将三维模型与地形或其他三维对象进行融合的场景。

### 核心特性

- **深度遮挡处理**：能够正确处理半透明对象与其他对象之间的深度遮挡关系
- **可配置的混合模式**：支持多种颜色混合模式（如混合、相加、相乘、滤色等）
- **遮挡距离控制**：可设置遮挡距离，控制对象在多大距离内会被遮挡
- **颜色动态调整**：可动态调整颜色，并支持使用对象自身颜色进行混合

## 实际效果展示

以下是使用基于深度的融合技术实现的不同场景效果对比：

<div style={{display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'center'}}>

<div style={{width: '100%', textAlign: 'center', padding: '1rem', border: '1px solid #eee', borderRadius: '8px', marginBottom: '2rem'}}>
  <h4>无融合效果（管网场景）</h4>
  <img 
    src="https://flywave.github.io/flywave.gl/blog/no_filter_effect_1.png" 
    alt="无融合效果（管网场景）" 
    style={{maxHeight: '600px', objectFit: 'contain', width: '100%', margin: '0 auto'}} 
  />
  <p style={{marginTop: '0.5rem'}}><small>管网完全被地形遮挡，无法看到地下部分，地形与管网数据在垂直方向上存在显著高差</small></p>
</div>

<div style={{width: '100%', textAlign: 'center', padding: '1rem', border: '1px solid #eee', borderRadius: '8px', marginBottom: '2rem'}}>
  <h4>启用融合效果（使用指定颜色）</h4>
  <img 
    src="https://flywave.github.io/flywave.gl/blog/filter_effect_use_color_1.png" 
    alt="启用融合效果（使用指定颜色）" 
    style={{maxHeight: '600px', objectFit: 'contain', width: '100%', margin: '0 auto'}} 
  />
  <p style={{marginTop: '0.5rem'}}><small>管网在地形下方的部分也能显示出来，并叠加了指定的颜色，通过半透明渲染技术实现了管网与地形的无缝融合</small></p>
</div>

<div style={{width: '100%', textAlign: 'center', padding: '1rem', border: '1px solid #eee', borderRadius: '8px', marginBottom: '2rem'}}>
  <h4>不使用叠加颜色</h4>
  <img 
    src="https://flywave.github.io/flywave.gl/blog/filter_effect_use_raw_1.png" 
    alt="不使用叠加颜色" 
    style={{maxHeight: '600px', objectFit: 'contain', width: '100%', margin: '0 auto'}} 
  />
  <p style={{marginTop: '0.5rem'}}><small>管网与地形自然融合，保持模型本身的颜色样式，同时保留了原始的纹理细节和光照效果</small></p>
</div>

<div style={{width: '100%', textAlign: 'center', padding: '1rem', border: '1px solid #eee', borderRadius: '8px', marginBottom: '2rem'}}>
  <h4>保持正常遮挡关系</h4>
  <img 
    src="https://flywave.github.io/flywave.gl/blog/filter_effect_use_color_depth_1.png" 
    alt="保持正常遮挡关系" 
    style={{maxHeight: '600px', objectFit: 'contain', width: '100%', margin: '0 auto'}} 
  />
  <p style={{marginTop: '0.5rem'}}><small>即使启用融合效果，仍能保持正常的深度遮挡关系，确保场景中的物体按照正确的深度顺序进行渲染</small></p>
</div>

<div style={{width: '100%', textAlign: 'center', padding: '1rem', border: '1px solid #eee', borderRadius: '8px', marginBottom: '2rem'}}>
  <h4>无融合效果（倾斜摄影场景）</h4>
  <img 
    src="https://flywave.github.io/flywave.gl/blog/no_filter_effect_2.png" 
    alt="无融合效果（倾斜摄影场景）" 
    style={{maxHeight: '600px', objectFit: 'contain', width: '100%', margin: '0 auto'}} 
  />
  <p style={{marginTop: '0.5rem'}}><small>地形与覆盖的3dtile数据并非完全一致，出现高低交错的情况，导致视觉上的不连续性</small></p>
</div>

<div style={{width: '100%', textAlign: 'center', padding: '1rem', border: '1px solid #eee', borderRadius: '8px', marginBottom: '2rem'}}>
  <h4>启用融合效果（控制遮挡距离）</h4>
  <img 
    src="https://flywave.github.io/flywave.gl/blog/filter_effect_use_raw_2.png" 
    alt="启用融合效果（控制遮挡距离）" 
    style={{maxHeight: '600px', objectFit: 'contain', width: '100%', margin: '0 auto'}} 
  />
  <p style={{marginTop: '0.5rem'}}><small>通过控制 occlusionDistance 的值，优先显示3dtile中的倾斜摄影数据，有效解决了地形与3dtile数据高低交错的问题</small></p>
</div>

</div>

## 如何使用基于深度的融合技术

### 1. 基本配置

在 flywave.gl 中，可以通过在数据源的主题配置中添加 `translucentDepth` 选项来启用此效果：

```typescript
dataSource.setTheme({
    postEffects: {
        translucentDepth: {
            enabled: true,          // 启用半透明深度效果
            mixFactor: 0.5,         // 混合因子，控制透明度 (0.0-1.0)
            blendMode: 'mix',       // 混合模式：'mix', 'add', 'multiply', 'screen'
            color: '#ff802a',       // 特效颜色
            occlusionDistance: 10.0, // 融合作用范围，超出此距离则按普通遮挡关系处理
            useObjectColor: true,   // 是否使用对象自身颜色
            objectColorMix: 0.5     // 对象颜色混合比例 (0.0-1.0)
        }
    },
});
```



### 2. 参数详细说明

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| enabled | boolean | false | 是否启用特效 |
| mixFactor | number | 0.3 | 混合因子，控制透明度 (0.0-1.0)，值越大越透明 |
| blendMode | string | 'mix' | 混合模式：'mix'(混合), 'add'(相加), 'multiply'(相乘), 'screen'(滤色) |
| color | string | '#ff802a' | 特效颜色，当 useObjectColor 为 false 时使用此颜色 |
| occlusionDistance | number | 10.0 | 融合作用范围，超出此距离则按普通遮挡关系处理 |
| useObjectColor | boolean | true | 是否使用对象自身颜色作为基础颜色 |
| objectColorMix | number | 0.5 | 对象颜色混合比例，控制特效颜色与对象颜色的混合程度 (0.0-1.0) |

### 3. 实际应用场景

- **管网可视化**：使地下管网与地形无缝融合，提供更好的视觉效果
- **建筑模型融合**：让建筑物与地形自然过渡，减少视觉突兀感
- **地下设施展示**：通过透明效果展示隐藏在地下的设施

