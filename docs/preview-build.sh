#!/bin/bash

# 预览构建后的文档网站
echo "Starting preview of built documentation site..."

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 在 docs 目录下启动 http-server 来预览 build 目录
cd "$SCRIPT_DIR" && npx http-server build -p 3002 -o

echo "Documentation site preview is running at http://localhost:3002"
echo "Press Ctrl+C to stop the server."