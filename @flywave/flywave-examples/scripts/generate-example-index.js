const fs = require('fs');
const path = require('path');

// 读取示例分类定义
const exampleCategoriesPath = path.resolve(__dirname, '../src/example-categories.ts');
const exampleCategoriesContent = fs.readFileSync(exampleCategoriesPath, 'utf8');

// 简单解析 example-categories.ts 文件以提取分类信息
// 注意：这是一个简化的解析器，实际项目中可能需要更复杂的解析
const categories = [];
const categoryRegex = /{\s*name:\s*'([^']*)',\s*code:\s*'([^']*)',\s*order:\s*(\d+)\s*}/g;
let match;
while ((match = categoryRegex.exec(exampleCategoriesContent)) !== null) {
  categories.push({
    name: match[1],
    code: match[2],
    order: parseInt(match[3])
  });
}

// 按照 order 排序
categories.sort((a, b) => a.order - b.order);

// 读取所有示例目录
const srcPath = path.resolve(__dirname, '../src');
const exampleDirs = fs.readdirSync(srcPath, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory() && fs.existsSync(path.join(srcPath, dirent.name, 'config.json')))
  .map(dirent => dirent.name);

// 创建示例到分类的映射
const exampleToCategory = {};
exampleDirs.forEach(dir => {
  const configPath = path.join(srcPath, dir, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.code) {
        exampleToCategory[dir] = config.code;
      }
    } catch (e) {
      console.warn(`无法解析 ${configPath}: ${e.message}`);
    }
  }
});

// 生成文档目录结构映射
const docsExampleMap = {
  'getting-started': 'getting-started',
  '3dtiles-model-rendering': '3dtiles-model-rendering',
  'terrain-elevation': 'terrain-elevation',
  'threejs-integration': 'threejs-integration',
  'third-party-integration': 'third-party-integration',
  'camera-control': 'camera-interaction',
  'advanced-rendering': 'advanced-rendering',
  'inspector-panel': 'inspector-panel',
  'drawing-annotation': 'drawing-annotation',
  'text-system': 'text-system',
  'performance-optimization': 'performance-optimization',
  'integration-extension': 'integration-extension',
  'mobile-adaptation': 'mobile-adaptation',
  'touch-gestures': 'touch-gestures'
};

// 生成 INDEX.md 内容
let indexContent = `# flywave.gl 示例目录

本目录包含 flywave.gl 的所有示例，按照功能分类组织。

## 示例分类

`;

// 按分类组织示例
const categorizedExamples = {};
categories.forEach(category => {
  categorizedExamples[category.code] = {
    category: category,
    examples: []
  };
});

// 将示例分配到对应的分类
Object.keys(exampleToCategory).forEach(exampleDir => {
  const code = exampleToCategory[exampleDir];
  // 查找匹配的分类
  const category = categories.find(cat => cat.code === code);
  if (category) {
    if (!categorizedExamples[code]) {
      categorizedExamples[code] = {
        category: category,
        examples: []
      };
    }
    // 读取示例的配置信息
    const configPath = path.join(srcPath, exampleDir, 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        categorizedExamples[code].examples.push({
          dir: exampleDir,
          title: config.title || exampleDir,
          description: config.description || ''
        });
      } catch (e) {
        console.warn(`无法解析 ${configPath}: ${e.message}`);
      }
    }
  }
});

// 生成分类列表
let counter = 1;
categories.forEach(category => {
  const categoryData = categorizedExamples[category.code];
  if (categoryData && categoryData.examples.length > 0) {
    indexContent += `${counter}. [${category.name}](./examples/${docsExampleMap[category.code] || category.code}/README.md) - ${category.name}\n`;
    counter++;
  }
});

indexContent += `\n\n## 核心项目结构，书写代码请参考以下模块\n\n- [地图视图模块 (@flywave/flywave-mapview)](./@flywave/flywave-mapview/README.md) - 地图视图核心模块，负责地图的显示、交互和渲染调度\n- [地图控制器模块 (@flywave/flywave-map-controls)](./@flywave/flywave-map-controls/README.md) - 地图控制器模块，提供相机交互控制功能\n- [地形数据源模块 (@flywave/flywave-terrain-datasource)](./@flywave/flywave-terrain-datasource/README.md) - 地形数据源模块，处理地形数据的加载与解码\n- [绘制控件模块 (@flywave/flywave-draw-controls)](./@flywave/flywave-draw-controls/README.md) - 绘制控件模块，支持在地图上绘制几何图形\n`;

// 写入 INDEX.md 文件
const indexPath = path.resolve(__dirname, '../docs/INDEX.md');
fs.writeFileSync(indexPath, indexContent, 'utf8');

console.log('已成功生成 docs/INDEX.md 文件');