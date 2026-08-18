# 测试与验证工作流

> 本仓库多条测试链路当前处于**断链/修复中**状态。给 AI 的铁则：
> **跑命令前先运行 `bash .agents/skills/flywave-dev/scripts/check-env.sh`
> 获取实时可用性，不要把断链命令写进方案，也不要拿 docs/development/
> 里的命令当真（那是过时的愿景文档）。**

## 命令诚实性清单（2026-08 勘察）

### ✅ 当前可用

| 命令 | 用途 | 说明 |
|---|---|---|
| `pnpm install` | 装依赖即全量编译 | 触发各包 `prepare` → `tsc --build` 生成 `lib/`；及 datasource-protocol 的 theme JSON schema 生成 |
| `pnpm start` | examples dev server | webpack 源码直连各包 src，热更；**目检渲染首选** |
| `pnpm --filter <pkg> test` | 单包 Node 单测 | mocha 跑该包已编译 `lib/` 的 `test/*.js`；改动后最小验证闭环 |
| `pnpm prettier` / `pnpm eslint` | 格式与 lint 门禁 | 修复：`prettier:fix` / `eslint:fix` |
| `pnpm performance-test-node` | Node 性能测试 | ts-mocha 跑 `test/performance/` |
| `pnpm docs` | 重新生成 API 文档 | api-extractor → `docs/docs/api/`（**机器生成，勿手改**） |

### ⚠️ 断链（修复前别用，也别浪费时间试）

| 命令 | 断在哪 |
|---|---|
| `pnpm test` / `test-cov` / `test-debug` / `test-browser`（karma 全家） | `karma.conf.js` require 的 `./karma.options` 文件不存在，启动即崩 |
| `pnpm run-rendering-tests`（渲染回归全链） | 缺 `build-tests` 脚本、`scripts/with-http-server.ts`、`webpack.tests.config.js`、`mocha-webdriver-runner` 依赖 |
| `pnpm pre-test` 中的 LicenseHeaderTest | 正则仍是 HERE 头格式 + 依赖 `git log` 年份（与本仓库 AGENTS.md 禁 git 冲突）；其中 **ImportTest（架构守卫）可单独跑**：`pnpm code-pre-tests` |

### ❌ 文档幻觉（不存在，勿引用）

`docs/docs/development/*.md` 里的 Jest、`jest.config.js`、`pnpm test:watch`、
`ci:test`、`pnpm build`、`build:watch` 均不存在于真实 scripts。README 的
ci.yaml/codecov badge 也是遗迹（无对应 workflow）。

## 测试类型分工

- **包内单测**：`@flywave/*/test/*Test.ts`（mocha + chai + sinon）。
  mapview 最多（60+），同时被根 karma 编译配置包含。
- **根 test/ 元测试**：`test/ImportTest.ts` 是**架构守卫**——禁包自导入、
  禁 import 未声明依赖、禁跨包相对路径、Tarjan SCC 检包级循环依赖。
  新增包/依赖后跑 `pnpm code-pre-tests` 验证。
- **渲染回归（IBCT）**：浏览器内构造真实 MapView（400x300、
  `preserveDrawingBuffer: true`、`pixelRatio: 1`、`disableFading: true`），
  等 `FRAME_COMPLETE` 截图，与参考图 pixelmatch **逐像素**比较
  （maxMismatchedPixels 0 / threshold 0）。无参考图则 skip。结果按平台
  （UA 命名，如 Chrome-80.x-Linux）落盘 `.current.png/.diff.png`；
  `save-reference` 建基准、`approve` 批准有意差异。参考平台 = Linux +
  Docker + 禁 GPU 的 headless Chrome 80（保证可复现）。**链路修复后**，
  涉及渲染结果的改动都应过这条链。
- **性能**：`test/performance/`（`@flywave/flywave-test-utils` 的
  `measurePerformanceSync`）。

## 一次完整改动的验证流程（当前可执行版）

1. `pnpm install`（若刚拉代码/依赖变更）。
2. 改码，遵守 SKILL.md 代码规范速查（跨包 import、版权头、three/webgpu）。
3. `pnpm --filter <受影响包> test`；跨包改动对每个受影响包执行。
4. `pnpm start` 起 examples 目检（挑最接近场景的示例，或临时改示例代码——
   记得还原）。
5. `pnpm prettier` + `pnpm eslint`（`simple-import-sort`/`no-console`/
   `max-len 100` 是 error 级）。
6. 新增包或改包依赖 → `pnpm code-pre-tests` 过 ImportTest。
7. 改了公共 API → 确认 `@flywave/flywave.gl/src/index.ts` 的 re-export、
   跑 `pnpm docs`。
8. 提交由人工执行（本仓库禁止 AI 跑 git 命令，见 AGENTS.md）。

## 已知坑

- `flywave-react` 的 test script 是 `vitest run` 但 devDependencies 为空，
  目前跑不起来。
- codecov.yml 写着 64.5% 目标，但没有任何 CI 上传步骤——数字仅供参考。
- tsconfig 是**非 strict**（`strict: false`），不要按 strict 假设读代码。
