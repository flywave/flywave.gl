#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// 启动预览构建后网站的脚本
console.log('Starting preview of built documentation site...');

// 使用 http-server 预览 build 目录
const server = spawn('npx', ['http-server', 'build', '-p', '3002', '-o'], {
  cwd: __dirname,  // 设置当前工作目录为脚本所在目录 (docs)
  stdio: 'inherit' // 继承父进程的stdio
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
});

server.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
});

console.log('Documentation site preview is running at http://localhost:3002');
console.log('Press Ctrl+C to stop the server.');