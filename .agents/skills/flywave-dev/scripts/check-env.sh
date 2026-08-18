#!/usr/bin/env bash
# flywave-dev skill: 实时检测本仓库哪些验证链路真正可用。
# 输出对应 references/testing-workflow.md 的诚实性清单。
# 用法: bash .agents/skills/flywave-dev/scripts/check-env.sh

cd "$(dirname "$0")/../../../.." || exit 1   # scripts/ → flywave-dev → skills → .agents → 仓库根

PASS_COUNT=0
WARN_COUNT=0

pass() { echo "✅ $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
warn() { echo "⚠️  $1"; WARN_COUNT=$((WARN_COUNT + 1)); }
info() { echo "ℹ️  $1"; }

echo "==================== flywave.gl 环境可用性 ===================="

# --- 基础环境 ---
if command -v pnpm >/dev/null 2>&1; then
    pass "pnpm $(pnpm --version 2>/dev/null || echo '?') 已安装"
else
    warn "pnpm 未安装（需要 >=9）"
fi
NODE_VER="$(node --version 2>/dev/null || echo none)"
if [ "$NODE_VER" = "none" ]; then
    warn "node 未找到（需要 >=22.15）"
else
    pass "node $NODE_VER"
fi

# --- 编译产物（pnpm install 的 prepare 生成）---
if [ -d "@flywave/flywave-mapview/lib" ]; then
    pass "lib/ 已编译：pnpm --filter <pkg> test 可跑单包 Node 单测"
else
    warn "lib/ 未编译：先 pnpm install"
fi

# --- karma 链 ---
if ls karma.options* >/dev/null 2>&1; then
    pass "karma.options 存在：pnpm test 应可用"
else
    warn "karma.options 缺失：pnpm test / test-cov 启动即崩（karma.conf.js require 它）"
fi

# --- 渲染回归链 ---
RENDER_MISSING=""
[ -f "webpack.tests.config.js" ] || RENDER_MISSING="$RENDER_MISSING webpack.tests.config.js"
[ -f "scripts/with-http-server.ts" ] || RENDER_MISSING="$RENDER_MISSING with-http-server.ts"
grep -q '"build-tests"' package.json || RENDER_MISSING="$RENDER_MISSING build-tests(script)"
[ -d "node_modules/mocha-webdriver-runner" ] || RENDER_MISSING="$RENDER_MISSING mocha-webdriver-runner(dep)"
if [ -z "$RENDER_MISSING" ]; then
    pass "渲染回归链文件齐全"
else
    warn "渲染回归链缺:${RENDER_MISSING}（run-rendering-tests 不可用）"
fi

# --- examples ---
if [ -d "@flywave/flywave-examples/src" ]; then
    pass "examples 存在：pnpm start 可目检"
else
    warn "examples 目录缺失"
fi

# --- 固定提示（结构性问题，探测不出来就直接提醒）---
warn "LicenseHeaderTest 依赖 git log 年份 + HERE 头正则（本仓库 AGENTS.md 禁 git）：pre-test 该项预期失败；ImportTest 可单独跑 pnpm code-pre-tests"
info "文档幻觉提醒：docs/docs/development/*.md 里的 Jest / test:watch / ci:test / pnpm build 均不存在"

echo "--------------------------------------------------------------"
echo "可用 $PASS_COUNT 项 / 受限 $WARN_COUNT 项"
echo "命令语义详见 .agents/skills/flywave-dev/references/testing-workflow.md"
