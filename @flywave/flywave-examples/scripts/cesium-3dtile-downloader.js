const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const zlib = require('zlib');
//2275207,2887123,2887129,2887126
class CesiumTilesDownloader {
    constructor() {
        this.initialToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3ODZkMDQzOS03ZGJjLTQzZWUtYjlmYy04ZmM5Y2UwNzNhMmYiLCJpZCI6MjU5LCJpYXQiOjE2MzgyMDYwMDB9.cK1hsaFBgz0l2dG9Ry5vBFHWp-HF2lwjLC0tcK8Z8tY';
        this.endpointUrl = 'https://api.cesium.com/v1/assets/2887129/endpoint';
        this.downloadDir = './cesium_tiles';
        this.concurrentDownloads = 2;
        this.downloadQueue = [];
        this.processing = 0;
        this.downloadedFiles = new Set();
        this.tilesetAccessToken = null;
        this.tilesetBaseUrl = null;
        this.assetsBaseUrl = null;
        
        if (!fs.existsSync(this.downloadDir)) {
            fs.mkdirSync(this.downloadDir, { recursive: true });
        }
    }

    getInitialAuthHeaders() {
        return {
            'Authorization': `Bearer ${this.initialToken}`
        };
    }

    getTilesetAuthHeaders() {
        if (!this.tilesetAccessToken) {
            return this.getInitialAuthHeaders();
        }
        return {
            'Authorization': `Bearer ${this.tilesetAccessToken}`
        };
    }

    getBrowserHeaders(useTilesetToken = false) {
        const baseHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': 'https://cesium.com/',
        };

        if (useTilesetToken) {
            return {
                ...baseHeaders,
                ...this.getTilesetAuthHeaders()
            };
        } else {
            return {
                ...baseHeaders,
                ...this.getInitialAuthHeaders()
            };
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async makeRequest(url, useTilesetToken = false, headers = {}, isBinary = false) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                headers: {
                    ...this.getBrowserHeaders(useTilesetToken),
                    ...headers
                }
            };

            console.log(`发起请求: ${url}`);
            
            const req = https.get(options, (res) => {
                console.log(`响应状态: ${res.statusCode} ${res.statusMessage}`);
                
                if (res.statusCode === 302 || res.statusCode === 301) {
                    console.log(`重定向到: ${res.headers.location}`);
                    this.makeRequest(res.headers.location, useTilesetToken, headers, isBinary)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (res.statusCode === 401) {
                    reject(new Error('认证失败'));
                    return;
                }

                if (res.statusCode === 403) {
                    reject(new Error('权限不足'));
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }

                let responseBuffer = Buffer.from([]);
                
                // 处理gzip压缩
                let responseStream = res;
                const encoding = res.headers['content-encoding'];
                
                if (encoding === 'gzip') {
                    responseStream = res.pipe(zlib.createGunzip());
                } else if (encoding === 'deflate') {
                    responseStream = res.pipe(zlib.createInflate());
                } else if (encoding === 'br') {
                    responseStream = res.pipe(zlib.createBrotliDecompress());
                }

                responseStream.on('data', (chunk) => {
                    responseBuffer = Buffer.concat([responseBuffer, chunk]);
                });

                responseStream.on('end', () => {
                    try {
                        console.log(`响应数据长度: ${responseBuffer.length} 字节`);
                        
                        if (isBinary) {
                            resolve(responseBuffer);
                        } else {
                            const dataString = responseBuffer.toString('utf8');
                            
                            const contentType = res.headers['content-type'];
                            if (contentType && contentType.includes('application/json')) {
                                const jsonData = JSON.parse(dataString);
                                resolve(jsonData);
                            } else {
                                resolve(dataString);
                            }
                        }
                    } catch (e) {
                        console.error('解析响应数据失败:', e.message);
                        resolve(responseBuffer);
                    }
                });

                responseStream.on('error', (err) => {
                    console.error('解压流错误:', err.message);
                    reject(err);
                });

            });

            req.on('error', (err) => {
                console.error('请求错误:', err.message);
                reject(err);
            });

            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    async downloadFile(url, filePath) {
        if (this.downloadedFiles.has(filePath)) {
            console.log(`文件已存在: ${filePath}`);
            return true;
        }

        console.log(`开始下载: ${filePath}`);
        console.log(`从URL: ${url}`);

        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                headers: this.getBrowserHeaders(true)
            };

            const req = https.get(options, (res) => {
                console.log(`下载响应: ${res.statusCode} ${res.statusMessage}`);

                if (res.statusCode === 401) {
                    reject(new Error('下载认证失败'));
                    return;
                }

                if (res.statusCode === 404) {
                    reject(new Error('文件不存在'));
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`下载失败: HTTP ${res.statusCode}`));
                    return;
                }

                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                const fileStream = fs.createWriteStream(filePath);
                let downloadedBytes = 0;

                // 处理压缩的响应
                let responseStream = res;
                const encoding = res.headers['content-encoding'];
                
                if (encoding === 'gzip') {
                    responseStream = res.pipe(zlib.createGunzip());
                } else if (encoding === 'deflate') {
                    responseStream = res.pipe(zlib.createInflate());
                } else if (encoding === 'br') {
                    responseStream = res.pipe(zlib.createBrotliDecompress());
                }

                responseStream.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                });

                responseStream.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close();
                    this.downloadedFiles.add(filePath);
                    console.log(`下载完成: ${filePath} (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`);
                    resolve(true);
                });

                fileStream.on('error', (err) => {
                    console.error(`文件流错误: ${err.message}`);
                    fs.unlink(filePath, () => {});
                    reject(err);
                });

                responseStream.on('error', (err) => {
                    console.error(`解压流错误: ${err.message}`);
                    reject(err);
                });
            });

            req.on('error', (err) => {
                console.error(`下载请求错误: ${err.message}`);
                reject(err);
            });

            req.setTimeout(60000, () => {
                req.destroy();
                reject(new Error('下载超时'));
            });
        });
    }

    async processQueue() {
        while (this.downloadQueue.length > 0 || this.processing > 0) {
            if (this.processing < this.concurrentDownloads && this.downloadQueue.length > 0) {
                const task = this.downloadQueue.shift();
                this.processing++;
                
                this.processDownloadTask(task)
                    .catch(err => {
                        console.error(`下载任务失败: ${task.filePath}`, err.message);
                    })
                    .finally(() => {
                        this.processing--;
                    });
            }
            
            await this.delay(200);
        }
    }

    async processDownloadTask(task) {
        try {
            await this.downloadFile(task.url, task.filePath);
            await this.delay(1000 + Math.random() * 2000);
        } catch (error) {
            console.error(`下载失败 ${task.filePath}:`, error.message);
            if (task.retries < 1) { // 减少重试次数
                task.retries++;
                console.log(`重试下载 (${task.retries}/1): ${task.filePath}`);
                this.downloadQueue.push(task);
                await this.delay(3000);
            }
        }
    }

    addToQueue(url, filePath) {
        const relativePath = path.relative(process.cwd(), filePath);
        if (!this.downloadedFiles.has(relativePath)) {
            this.downloadQueue.push({
                url,
                filePath,
                retries: 0
            });
        }
    }

    async getEndpointInfo() {
        try {
            console.log('获取endpoint信息...');
            const endpointData = await this.makeRequest(`${this.endpointUrl}?access_token=${this.initialToken}`, false);
            
            console.log('Endpoint响应:', endpointData);
            
            let tilesetUrl = endpointData.url;
            let accessToken = endpointData.accessToken;

            console.log('解析出的Tileset URL:', tilesetUrl);
            console.log('解析出的Access Token:', accessToken ? '已获取' : '未获取');

            if (tilesetUrl && accessToken) {
                this.tilesetBaseUrl = tilesetUrl;
                this.tilesetAccessToken = accessToken;
                
                // 从tileset URL提取assets基础URL
                const urlObj = new URL(tilesetUrl);
                this.assetsBaseUrl = `${urlObj.origin}${path.dirname(urlObj.pathname)}`;
                console.log(`Assets基础URL: ${this.assetsBaseUrl}`);
                
                return endpointData;
            } else {
                throw new Error('无法获取有效的tileset URL或access token');
            }
        } catch (error) {
            console.error('获取endpoint信息失败:', error);
            throw error;
        }
    }

    async discoverTilesetResources() {
        try {
            if (!this.tilesetBaseUrl) {
                throw new Error('未获取到tileset URL');
            }

            console.log('开始解析tileset结构...');
            console.log(`Tileset URL: ${this.tilesetBaseUrl}`);
            
            const tilesetData = await this.makeRequest(this.tilesetBaseUrl, true);
            const tileset = typeof tilesetData === 'string' ? JSON.parse(tilesetData) : tilesetData;
            
            const resources = [];
            
            // 添加tileset.json本身
            resources.push({
                url: this.tilesetBaseUrl,
                filePath: path.join(this.downloadDir, 'tileset.json')
            });

            console.log('开始递归发现所有tile资源...');
            await this.discoverTileResources(tileset.root, '', resources);
            
            console.log(`发现 ${resources.length} 个资源文件`);
            return resources;
        } catch (error) {
            console.error('发现资源失败:', error);
            return [];
        }
    }

    async discoverTileResources(tile, currentPath, resources) {
        if (!tile) return;

        // 处理content
        if (tile.content && tile.content.uri) {
            const contentUri = tile.content.uri;
            
            // 构建完整的URL
            let contentUrl;
            if (contentUri.startsWith('http')) {
                contentUrl = contentUri;
            } else if (contentUri.startsWith('/')) {
                const urlObj = new URL(this.tilesetBaseUrl);
                contentUrl = `${urlObj.origin}${contentUri}`;
            } else {
                contentUrl = `${this.assetsBaseUrl}/${contentUri}`;
            }
            
            // 添加access token
            if (this.tilesetAccessToken && !contentUrl.includes('access_token')) {
                contentUrl += (contentUrl.includes('?') ? '&' : '?') + `access_token=${this.tilesetAccessToken}`;
            }
            
            const filePath = path.join(this.downloadDir, contentUri);
            
            resources.push({
                url: contentUrl,
                filePath: filePath
            });
            console.log(`发现资源: ${contentUri} -> ${contentUrl}`);
        }

        // 处理children
        if (tile.children) {
            for (const child of tile.children) {
                await this.discoverTileResources(child, currentPath, resources);
            }
        }
    }

    async startDownload() {
        console.log('开始Cesium 3D Tiles资源下载流程...');
        
        try {
            await this.getEndpointInfo();
            
            const resources = await this.discoverTilesetResources();
            
            if (resources.length === 0) {
                console.log('未发现任何资源，退出下载');
                return;
            }

            console.log(`总共发现 ${resources.length} 个资源文件`);

            // 先下载tileset.json
            const tilesetResource = resources.find(r => r.filePath.endsWith('tileset.json'));
            if (tilesetResource) {
                console.log('首先下载tileset.json...');
                await this.downloadFile(tilesetResource.url, tilesetResource.filePath);
                await this.delay(1000);
            }

            // 过滤掉tileset.json，下载其他资源
            const otherResources = resources.filter(r => !r.filePath.endsWith('tileset.json'));
            
            for (const resource of otherResources) {
                this.addToQueue(resource.url, resource.filePath);
            }

            console.log(`开始下载 ${otherResources.length} 个资源文件...`);
            console.log('下载目录:', this.downloadDir);

            await this.processQueue();

            console.log('所有资源下载完成!');
            console.log(`共下载 ${this.downloadedFiles.size} 个文件`);

        } catch (error) {
            console.error('下载过程出错:', error);
        }
    }
}

async function main() {
    const downloader = new CesiumTilesDownloader();
    await downloader.startDownload();
}

main().catch(console.error);