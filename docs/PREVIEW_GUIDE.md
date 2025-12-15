# 预览构建后的文档

本文档说明如何预览已构建的文档网站。

## 方法一：使用 npm 脚本（推荐）

```bash
cd docs
npm run preview-build       # 启动服务但不自动打开浏览器
npm run preview-build-open # 启动服务并自动打开浏览器
```

服务器将在 http://localhost:3002 上运行。

## 方法二：使用脚本文件

### Node.js 脚本
```bash
node preview-build.js
```

### Shell 脚本
```bash
./preview-build.sh
```

## 方法三：直接使用 http-server

如果你已经安装了 http-server：
```bash
# 安装 http-server（如果尚未安装）
npm install -g http-server

# 在 docs/build 目录启动服务器
cd docs
http-server build -p 3002 -o
```

或者使用 npx：
```bash
cd docs
npx http-server build -p 3002 -o
```

## 注意事项

- 确保先运行 `npm run build` 或 `npm run docusaurus-build` 来构建站点
- 服务器默认运行在端口 3002 上，以避免与开发服务器冲突
- 按 Ctrl+C 可以停止服务器