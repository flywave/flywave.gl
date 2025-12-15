const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3003;
const BUILD_DIR = path.join(__dirname, 'build');
const BASE_URL = '/flywave.gl/';  // 与 docusaurus.config.ts 中的 baseUrl 保持一致

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
};

// 处理请求
function handleRequest(req, res) {
  console.log(`${req.method} ${req.url}`);
  
  // 解析URL
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;
  
  // 处理 baseUrl 前缀
  if (pathname.startsWith(BASE_URL)) {
    pathname = pathname.substring(BASE_URL.length - 1);  // 保留前导斜杠
  }
  
  let filePath = path.join(BUILD_DIR, pathname);
  
  // 默认页面
  if (pathname === '/' || pathname === '') {
    filePath = path.join(BUILD_DIR, 'index.html');
  }
  
  // 获取文件扩展名
  const extname = path.extname(filePath).toLowerCase();
  
  // 检查文件是否存在
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // 文件不存在，尝试添加.html后缀
      if (extname === '') {
        const htmlPath = filePath + '.html';
        fs.access(htmlPath, fs.constants.F_OK, (err) => {
          if (err) {
            serve404(res);
          } else {
            serveFile(res, htmlPath, '.html');
          }
        });
      } else {
        serve404(res);
      }
    } else {
      // 检查是否是目录
      fs.stat(filePath, (err, stats) => {
        if (err) {
          serve404(res);
        } else if (stats.isDirectory()) {
          // 如果是目录，尝试提供index.html
          const indexPath = path.join(filePath, 'index.html');
          fs.access(indexPath, fs.constants.F_OK, (err) => {
            if (err) {
              serve404(res);
            } else {
              serveFile(res, indexPath, '.html');
            }
          });
        } else {
          serveFile(res, filePath, extname);
        }
      });
    }
  });
}

// 提供文件
function serveFile(res, filePath, extname) {
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        serve404(res);
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}

// 404页面
function serve404(res) {
  const filePath = path.join(BUILD_DIR, '404.html');
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // 如果没有404.html文件，提供简单404响应
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found</h1><p>The requested URL was not found on this server.</p>');
    } else {
      serveFile(res, filePath, '.html');
    }
  });
}

// 创建服务器
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Documentation test server is running!`);
  console.log(`Local: http://localhost:${PORT}${BASE_URL}`);
  console.log(`Build directory: ${BUILD_DIR}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Press Ctrl+C to stop the server`);
  console.log(`========================================`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});