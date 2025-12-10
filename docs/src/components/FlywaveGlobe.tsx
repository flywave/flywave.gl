import { useEffect, useRef } from 'react';

const FlywaveGlobe = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 创建 iframe 来运行 flywave 示例
    const iframe = document.createElement('iframe');
    iframe.style.width = '450px';
    iframe.style.height = '450px';
    iframe.style.border = 'none';
    iframe.setAttribute('title', 'Flywave Globe Preview');
    iframe.style.display = 'block';
    iframe.style.background = 'transparent';
    iframe.style.overflow = 'hidden';
    iframe.style.minWidth = '400px';
    iframe.style.minHeight = '400px';
    iframe.style.maxWidth = '500px';
    iframe.style.maxHeight = '500px';

    // 获取当前的基础URL，用于处理国际化路径
    const baseUrl = window.location.origin + window.location.pathname.split('/').slice(0, 2).join('/');
    
    // 设置 iframe 内容
    const iframeContent = `
      <!DOCTYPE html>
      <html style="width:100%; height:100%; margin:0; padding:0;">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: transparent;
          }
          #mapCanvas {
            position: absolute;
            border: 0px;
            left: 0px;
            top: 0px;
            width: 100%;
            height: 100%;
            overflow: hidden;
            z-index: 1; /* 提高z-index确保可以接收鼠标事件 */
          }
        </style>
        <script type="importmap">
        {
            "imports": { 
                "three": "https://unpkg.com/three@0.178.0/build/three.module.js",
                "@flywave/flywave.gl": "${baseUrl}/flywave.gl.module.js"
            }
        }
        </script>
      </head>
      <body>
        <canvas id="mapCanvas"></canvas>
        <script type="module">
          window.FLYWAVE_BASE_URL = "${baseUrl}/";
          import {
            MapView,
            GeoCoordinates, 
            MapControls,
            MapControlsUI,
            sphereProjection,
            ArcGISWebTileDataSource
          } from "@flywave/flywave.gl";

          const canvas = document.getElementById("mapCanvas");
          // Force canvas dimensions to match container
          const resizeCanvas = () => {
            const container = canvas.parentElement;
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            // Trigger resize on the map view if it exists
            if (window.__mapView) {
              window.__mapView.resize(container.clientWidth, container.clientHeight);
            }
          };
          
          // Initial resize when DOM is ready
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
              setTimeout(resizeCanvas, 50);
            });
          } else {
            setTimeout(resizeCanvas, 50);
          }
          
          // Initialize map view
          const mapView = new MapView({
              projection: sphereProjection,
              target: new GeoCoordinates(36, 118),
              zoomLevel: 2.7, 
              maxZoomLevel: 3,
              enablePolarDataSource: true,
              tilt: 0,
              heading: 0,
              canvas,
              theme: {
                  extends: "${baseUrl}/resources/tilezen_base.json",
                  backgroundOpacity: 0.0,
                  sky:undefined,
                  clearColor: "#000000",
                  clearAlpha: 0.0,
                  "celestia": {
                      sunTime: new Date().setHours(16, 0, 0, 0),
                      "atmosphere": true,
                  }
              }
          });
          let control = new MapControls(mapView,{
            zoomEnabled: false, 
          });
          mapView.addDataSource(new ArcGISWebTileDataSource);
          mapView.beginAnimation();
        </script>
      </body>
      </html>
    `;

    // 清空容器并添加 iframe
    const container = containerRef.current;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(iframe);

    // 写入 iframe 内容
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(iframeContent);
      iframeDoc.close();
    }

    // 清理函数
    return () => {
      if (container.firstChild === iframe) {
        container.removeChild(iframe);
      }
    };
  }, []);

  return <div ref={containerRef} className="globe-container" />;
};

export default FlywaveGlobe;