# 测试

本指南介绍了 flywave.gl 的测试策略和如何运行测试。

## 测试类型

flywave.gl 使用多种测试类型确保代码质量：

- 单元测试: 测试单个函数和类的功能
- 集成测试: 测试模块间的交互
- 性能测试: 评估渲染和计算性能
- 渲染测试: 验证视觉输出的正确性

### 使用的测试工具

- Mocha: 测试框架
- Karma: 测试运行器
- Chai: 断言库
- Sinon: Mock 和 Stub 库

## 运行测试

### 运行完整测试套件

```bash
# 使用 Chrome Headless 运行所有单元测试
pnpm test

# 在浏览器中运行测试
pnpm run test-browser

# 以调试模式运行测试
pnpm test-debug

# 运行测试并生成覆盖率报告
pnpm test-cov
```

### 单元测试

```bash
# 使用 Karma Headless (默认)
pnpm run karma-headless

# 使用 Firefox Headless
pnpm run karma-headless-firefox

# 在浏览器中运行
pnpm run karma-browser
```

### 性能测试

```bash
# 运行 Node.js 环境中的性能测试
pnpm performance-test-node
```

#### 性能测试基线建立

建立性能测试基线：

```bash
# 在主分支上建立基线
git checkout master
PROFILEHELPER_COMMAND=baseline pnpm performance-test-node
```

性能测试结果格式示例：
```
performance createLineGeometry segments=2
  min=0.0014ms (-2.44% vs 0.0014ms) sum=999.16ms (0% vs 999.12ms) repeats=499568.00 (-6.47% vs 534131.00) throughput=499988.43/s (-6.47% vs 534600.13/s)
  avg=0.002ms (6.92% vs 0.0019ms) med=0.0015ms (0.2% vs 0.0015ms) med95=0.0031ms (17.6% vs 0.0026ms)
  gcTime=39.6195ms (-3.39% vs 41.011ms) sumNoGc=959.54ms (0.15% vs 958.11ms) throughputNoGc=520633.00/s (-6.61% vs 557461.83/s)
```

### 渲染测试

```bash
# 运行渲染测试
pnpm run run-rendering-tests

# 保存渲染测试参考结果
pnpm run save-reference-rendering-tests

# 批准渲染测试参考结果
pnpm run approve-reference-rendering-tests
```

## 测试结构

### 测试文件位置

- `test/`: 顶层测试文件 (如 LicenseHeaderTest.ts, ImportTest.ts)
- `@flywave/*/test/`: 各模块的测试文件
- `test/performance/`: 性能测试
- `test/rendering/`: 渲染测试

### 测试文件命名

- `*.test.ts` 或 `*.spec.ts`
- 按功能命名 (如 `mapview.test.ts`, `camera-controls.test.ts`)

## 开发工作流

### 启动测试服务器

```bash
# 启动测试开发服务器
pnpm run start-tests

# 然后在浏览器中访问 http://localhost:8080/ 运行测试
```

### 调试测试

要使用 VSCode 调试测试，将以下配置添加到 `.vscode/launch.json`：

```json
{
    "type": "chrome",
    "request": "attach",
    "name": "Karma Tests",
    "sourceMaps": true,
    "webRoot": "${workspaceRoot}",
    "address": "localhost",
    "port": 9876,
    "pathMapping": {
        "/": "${workspaceRoot}",
        "/base/": "${workspaceRoot}/"
    },
    "sourceMapPathOverrides": {
        "webpack:///./*": "${webRoot}/*",
        "webpack:///src/*": "${webRoot}/*",
        "webpack:///*": "*",
        "webpack:///./~/*": "${webRoot}/node_modules/*",
        "meteor://app/*": "${webRoot}/*"
    }
}
```

运行 `pnpm test-debug` 后启动此配置进行调试。

## 测试编写指南

### 基本单元测试结构

```typescript
import { expect } from 'chai';
import { SomeClass } from '../path/to/SomeClass';

describe('SomeClass', () => {
    it('should do something', () => {
        const instance = new SomeClass();
        expect(instance.someMethod()).to.equal(expectedValue);
    });
});
```

### 异步测试

```typescript
it('should handle async operations', async () => {
    const result = await asyncFunction();
    expect(result).to.equal(expectedValue);
});
```

## 常用测试命令

- `pnpm test` - 运行单元测试 (Chrome Headless)
- `pnpm test-browser` - 在浏览器中运行测试
- `pnpm test-debug` - 调试模式运行测试
- `pnpm test-cov` - 运行测试并生成覆盖率报告
- `pnpm performance-test-node` - 运行性能测试
- `pnpm run start-tests` - 启动测试开发服务器

## 故障排除

### 常见问题

1. 测试超时: 检查异步代码是否正确处理
2. 内存泄漏: 确保清理事件监听器和资源
3. 渲染问题: 验证 WebGL 上下文是否正确创建和销毁

### 清理测试环境

```bash
# 重新安装依赖
pnpm install --force

# 清理构建产物
pnpm run cleanup

# 重新运行预测试检查
pnpm run pre-test
```

## 持续集成

测试在 CI 环境中自动运行，包括：

- 代码预检查 (pre-test)
- 单元测试
- 代码覆盖率检查
- 性能测试 (如有更改)

## 下一步

- [开发脚本](./scripts) - 了解更多测试相关命令
- [开发流程](./guide) - 了解完整的开发工作流程