#!/usr/bin/env bash
# verify-anchors.sh — 校验本 skill 引用的源码锚点仍存在。
#
# 用法: .agents/skills/flywave-dev/scripts/verify-anchors.sh [root]
#   root 默认为 monorepo 根（本脚本上三级的上一级）。
#
# 检查三类引用（对 .agents/skills/flywave-dev/**/*.md）:
#   1. 文件锚点: `@flywave/<pkg>/src/.../Xxx.ts` → 文件必须存在。
#   2. 文件锚点简写: `src/.../Xxx.ts` → basename 在 @flywave 源码树中存在。
#   3. 符号锚点:
#      a) 显式配对 `Xxx.ts` … `symbol`（「的 / :: / :」相邻）→ 该文件内含 symbol；
#      b) 其余反引号符号（同行提及 .ts 的）→ 全局存在于 @flywave 源码即可。
#   标注「不存在/幻觉/勿引用/无类/残留」的行跳过（防幻觉清单里的符号本就缺失）。
# 输出 MISSING 清单；全部通过输出 OK 并以 0 退出，有缺失以 1 退出。
#
# 依赖: bash 3.2+ / grep / sed / find（macOS 自带即可，不用 mapfile）。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="${1:-$(cd "$SCRIPT_DIR/../../../.." && pwd)}"

missing=0
checked=0

# 一次性构建符号语料（全仓 @flywave 源码，去掉 node_modules 与构建产物）
CORPUS="$(mktemp)"
find "$ROOT/@flywave" \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/node_modules/*' -not -path '*/lib/*' -print0 |
    xargs -0 cat > "$CORPUS" 2>/dev/null
trap 'rm -f "$CORPUS"' EXIT

# --- 1. 文件锚点：@flywave/<pkg>/.../*.ts|tsx|js|md|json ---
while IFS= read -r ref; do
    checked=$((checked + 1))
    if [[ ! -e "$ROOT/$ref" ]]; then
        echo "MISSING file: $ref"
        missing=$((missing + 1))
    fi
done < <(grep -rhoE '@flywave/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*\.(ts|tsx|js|md|json)' "$SKILL_DIR" --include='*.md' | sort -u)

# --- 2. 文件锚点简写：`src/.../Xxx.ts` → basename 存在即可 ---
while IFS= read -r ref; do
    checked=$((checked + 1))
    base="$(basename "$ref")"
    if ! find "$ROOT/@flywave" -name "$base" -not -path '*/node_modules/*' -print -quit | grep -q .; then
        echo "MISSING file (basename): $ref"
        missing=$((missing + 1))
    fi
done < <(grep -rhoE '`src/[A-Za-z0-9/._-]+\.(ts|tsx|md|json)`' "$SKILL_DIR" --include='*.md' | tr -d '`' | sort -u)

# --- 3a. 显式符号配对：`Xxx.ts` 的/::/: `symbol` ---
while IFS= read -r pair; do
    file="${pair%% *}"
    sym="${pair#* }"
    src_files="$(find "$ROOT/@flywave" -name "$file" -not -path '*/node_modules/*' -not -path '*/lib/*')"
    [[ -z "$src_files" ]] && continue  # 文件缺失已在第 1/2 步报告
    checked=$((checked + 1))
    found=0
    for f in $src_files; do
        if grep -q "$sym" "$f"; then found=1; break; fi
    done
    if [[ "$found" -eq 0 ]]; then
        echo "MISSING symbol: $sym (declared anchor $file)"
        missing=$((missing + 1))
    fi
done < <(grep -rh '不存在\|幻觉\|勿引用\|无类\|残留' "$SKILL_DIR" --include='*.md' -v |
    grep -oE '[A-Za-z0-9_-]+\.ts[^A-Za-z0-9]{1,16}(的[[:space:]]*)?`[A-Za-z_$][A-Za-z0-9_$]*`' |
    sed -E 's/^([A-Za-z0-9_-]+\.ts)[^`]*`([A-Za-z_$][A-Za-z0-9_$]*)`$/\1 \2/' |
    sort -u)

# --- 3b. 全局符号存在性：同行提及 .ts 的其余反引号符号 ---
while IFS= read -r sym; do
    checked=$((checked + 1))
    if ! grep -q "$sym" "$CORPUS"; then
        echo "MISSING symbol (global): $sym"
        missing=$((missing + 1))
    fi
done < <(grep -rh '不存在\|幻觉\|勿引用\|无类\|残留' "$SKILL_DIR" --include='*.md' -v |
    grep -E '[A-Za-z0-9_-]+\.ts' |
    grep -oE '`[A-Za-z_$][A-Za-z0-9_$]*`' |
    tr -d '`' | sort -u)

echo "---"
echo "checked=$checked missing=$missing"
if [[ "$missing" -eq 0 ]]; then
    echo "OK"
    exit 0
else
    echo "FAIL"
    exit 1
fi
