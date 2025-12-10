import { type MapView } from "@flywave/flywave-mapview";

export interface ThumbnailSize {
    width: number;
    height: number;
    name: string;
}

export class MapThumbnailGenerator {
    private mapView: MapView;
    private originalCanvas: HTMLCanvasElement;
    private container: HTMLDivElement;
    private isVisible: boolean = false;
    
    // 预设尺寸
    private presetSizes: ThumbnailSize[] = [
        { name: '小图 (200x150)', width: 200, height: 150 },
        { name: '中图 (400x300)', width: 400, height: 300 },
        { name: '大图 (800x600)', width: 800, height: 600 },
        { name: '高清 (1200x900)', width: 1200, height: 900 }
    ];

    constructor(mapView: MapView) {
        this.mapView = mapView;
        this.originalCanvas = mapView.canvas;
        this.container = this.createContainer();
        this.setupEventListeners();
    }

    /**
     * 创建组件容器
     */
    private createContainer(): HTMLDivElement {
        const container = document.createElement('div');
        container.className = 'map-thumbnail-generator';
        container.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            padding: 16px;
            min-width: 280px;
            z-index: 1000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: none;
        `;

        container.innerHTML = `
            <div class="thumbnail-header" style="margin-bottom: 16px; border-bottom: 1px solid #eee; padding-bottom: 12px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #333;">生成缩略图</h3>
                <p style="margin: 0; font-size: 12px; color: #666;">选择尺寸或自定义尺寸生成地图缩略图</p>
            </div>
            
            <div class="size-presets" style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-size: 14px; color: #333; font-weight: 500;">预设尺寸</label>
                <div class="preset-buttons" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    ${this.presetSizes.map(size => `
                        <button class="preset-btn" data-width="${size.width}" data-height="${size.height}" 
                                style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; 
                                       border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s;">
                            ${size.name}
                        </button>
                    `).join('')}
                </div>
            </div>
            
            <div class="custom-size" style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-size: 14px; color: #333; font-weight: 500;">自定义尺寸</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: center;">
                    <div>
                        <input type="number" id="customWidth" placeholder="宽度" 
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;" 
                               min="100" max="2000" value="400">
                    </div>
                    <div style="text-align: center; font-size: 14px; color: #666;">×</div>
                    <div>
                        <input type="number" id="customHeight" placeholder="高度" 
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;" 
                               min="100" max="2000" value="300">
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <button id="generateCustomBtn" 
                                style="width: 100%; padding: 10px; background: #007bff; color: white; 
                                       border: none; border-radius: 4px; cursor: pointer; font-size: 14px; 
                                       transition: background-color 0.2s;">
                            生成缩略图
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="quality-setting" style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-size: 14px; color: #333; font-weight: 500;">图片质量</label>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <input type="range" id="qualitySlider" min="0.1" max="1" step="0.1" value="0.8" 
                           style="flex: 1;">
                    <span id="qualityValue" style="font-size: 14px; color: #333; min-width: 40px;">0.8</span>
                </div>
            </div>
            
            <div class="thumbnail-actions" style="border-top: 1px solid #eee; padding-top: 12px;">
                <button id="closeBtn" 
                        style="padding: 8px 16px; background: #6c757d; color: white; border: none; 
                               border-radius: 4px; cursor: pointer; font-size: 14px; float: right;">
                    关闭
                </button>
            </div>
            
            <div id="loadingOverlay" 
                 style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.9); 
                        display: none; justify-content: center; align-items: center; border-radius: 8px; flex-direction: column;">
                <div style="font-size: 14px; color: #333; margin-bottom: 12px;">正在生成缩略图...</div>
                <div style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #007bff; 
                            border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
        `;

        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .preset-btn:hover {
                background: #e9ecef !important;
                border-color: #adb5bd !important;
            }
            .preset-btn:active {
                background: #dee2e6 !important;
            }
            #generateCustomBtn:hover {
                background: #0056b3 !important;
            }
            #closeBtn:hover {
                background: #545b62 !important;
            }
        `;
        container.appendChild(style);

        return container;
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        // 预设尺寸按钮
        this.container.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLButtonElement;
                const width = parseInt(target.dataset.width || '400');
                const height = parseInt(target.dataset.height || '300');
                this.generateThumbnail(width, height);
            });
        });

        // 自定义生成按钮
        const generateCustomBtn = this.container.querySelector('#generateCustomBtn') as HTMLButtonElement;
        generateCustomBtn.addEventListener('click', () => {
            const width = parseInt((this.container.querySelector('#customWidth') as HTMLInputElement).value);
            const height = parseInt((this.container.querySelector('#customHeight') as HTMLInputElement).value);
            
            if (width && height) {
                if (width < 100 || width > 2000 || height < 100 || height > 2000) {
                    alert('尺寸范围：100-2000像素');
                    return;
                }
                this.generateThumbnail(width, height);
            } else {
                alert('请输入有效的宽度和高度');
            }
        });

        // 质量滑块
        const qualitySlider = this.container.querySelector('#qualitySlider') as HTMLInputElement;
        const qualityValue = this.container.querySelector('#qualityValue') as HTMLSpanElement;
        qualitySlider.addEventListener('input', () => {
            qualityValue.textContent = qualitySlider.value;
        });

        // 关闭按钮
        const closeBtn = this.container.querySelector('#closeBtn') as HTMLButtonElement;
        closeBtn.addEventListener('click', () => {
            this.hide();
        });

        // 点击外部关闭
        document.addEventListener('click', (e) => {
            if (this.isVisible && !this.container.contains(e.target as Node)) {
                this.hide();
            }
        });
    }

    /**
     * 生成缩略图
     */
    private async generateThumbnail(width: number, height: number): Promise<void> {
        const qualitySlider = this.container.querySelector('#qualitySlider') as HTMLInputElement;
        const quality = parseFloat(qualitySlider.value);
        const filename = `map_thumbnail_${width}x${height}_${this.formatDate()}.png`;

        this.showLoading(true);

        try {
            const dataURL = await this.generateThumbnailDataURL(width, height, quality);
            this.downloadDataURL(dataURL, filename);
        } catch (error) {
            console.error('生成缩略图失败:', error);
            alert('生成缩略图失败，请重试');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 生成缩略图DataURL
     */
    private async generateThumbnailDataURL(width: number, height: number, quality: number = 0.8): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                // 保存原始尺寸
                const originalWidth = this.originalCanvas.width;
                const originalHeight = this.originalCanvas.height;
                
                console.log(`生成缩略图: ${width}x${height}`);

                // 临时调整canvas尺寸
                this.originalCanvas.width = width;
                this.originalCanvas.height = height;
                 
                this.mapView.renderSync();

                // 等待地图渲染完成
                setTimeout(() => {
                    // 创建临时canvas
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = width;
                    tempCanvas.height = height;
                    
                    const ctx = tempCanvas.getContext('2d');
                    if (!ctx) {
                        this.restoreOriginalSize(originalWidth, originalHeight);
                        reject(new Error('无法获取canvas上下文'));
                        return;
                    }

                    // 绘制到临时canvas
                    ctx.drawImage(this.originalCanvas, 0, 0, width, height);
                    
                    // 生成DataURL
                    const dataURL = tempCanvas.toDataURL('image/png', quality);
                    
                    // 恢复原始尺寸
                    this.restoreOriginalSize(originalWidth, originalHeight);
                    
                    console.log('缩略图生成完成');
                    resolve(dataURL);
                }, 500);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 恢复原始尺寸
     */
    private restoreOriginalSize(originalWidth: number, originalHeight: number): void {
        this.originalCanvas.width = originalWidth;
        this.originalCanvas.height = originalHeight;
        this.mapView.renderSync();
    }

    /**
     * 显示/隐藏加载状态
     */
    private showLoading(show: boolean): void {
        const loadingOverlay = this.container.querySelector('#loadingOverlay') as HTMLDivElement;
        loadingOverlay.style.display = show ? 'flex' : 'none';
    }

    /**
     * 下载DataURL为文件
     */
    private downloadDataURL(dataURL: string, filename: string): void {
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * 格式化日期用于文件名
     */
    private formatDate(): string {
        const now = new Date();
        return `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    }

    /**
     * 显示组件
     */
    public show(): void {
        if (!this.container.parentElement) {
            document.body.appendChild(this.container);
        }
        this.container.style.display = 'block';
        this.isVisible = true;
    }

    /**
     * 隐藏组件
     */
    public hide(): void {
        this.container.style.display = 'none';
        this.isVisible = false;
    }

    /**
     * 切换显示/隐藏
     */
    public toggle(): void {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * 销毁组件
     */
    public destroy(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }

    /**
     * 添加预设尺寸
     */
    public addPresetSize(size: ThumbnailSize): void {
        this.presetSizes.push(size);
        this.updatePresetButtons();
    }

    /**
     * 更新预设按钮
     */
    private updatePresetButtons(): void {
        const presetContainer = this.container.querySelector('.preset-buttons') as HTMLDivElement;
        presetContainer.innerHTML = this.presetSizes.map(size => `
            <button class="preset-btn" data-width="${size.width}" data-height="${size.height}" 
                    style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; 
                           border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s;">
                ${size.name}
            </button>
        `).join('');

        // 重新绑定事件
        this.container.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLButtonElement;
                const width = parseInt(target.dataset.width || '400');
                const height = parseInt(target.dataset.height || '300');
                this.generateThumbnail(width, height);
            });
        });
    }
}