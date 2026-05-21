import { type MapView, type MapControls, type FeatureCollection } from "@flywave/flywave.gl";
import { GeoJSONDrawControls, DrawMode } from "@flywave/flywave-draw-controls";

export class RailwayEditUI {
    private m_draw: GeoJSONDrawControls;
    private m_panel: HTMLDivElement;
    private m_textarea: HTMLTextAreaElement;
    private m_visible = false;

    constructor(mapView: MapView, mapControls: MapControls, geojson: FeatureCollection) {
        this.m_draw = new GeoJSONDrawControls(mapView, mapControls);
        this.m_draw.addGeoJSON(geojson);
        this.m_draw.visible(false);

        this.m_panel = document.createElement("div");
        this.m_panel.id = "railway-edit-ui";
        this.m_panel.innerHTML = this.buildHTML();
        document.body.appendChild(this.m_panel);

        this.m_textarea = this.m_panel.querySelector("#reui-output") as HTMLTextAreaElement;

        this.m_panel.querySelector("#reui-toggle")!.addEventListener("click", () => {
            this.m_visible = !this.m_visible;
            this.m_draw.visible(this.m_visible);
            this.m_panel.classList.toggle("reui-expanded", this.m_visible);
            if (!this.m_visible) {
                this.m_draw.setMode(DrawMode.NONE);
                this.updateModeIndicator("无");
            }
        });

        this.m_panel.querySelector("#reui-edit")!.addEventListener("click", () => {
            this.m_draw.setMode(DrawMode.EDIT);
            this.updateModeIndicator("编辑");
        });

        this.m_panel.querySelector("#reui-line")!.addEventListener("click", () => {
            this.m_draw.setMode(DrawMode.LINE);
            this.updateModeIndicator("画线");
        });

        this.m_panel.querySelector("#reui-point")!.addEventListener("click", () => {
            this.m_draw.setMode(DrawMode.POINT);
            this.updateModeIndicator("画点");
        });

        this.m_panel.querySelector("#reui-delete")!.addEventListener("click", () => {
            this.m_draw.setMode(DrawMode.DELETE);
            this.updateModeIndicator("删除");
        });

        this.m_panel.querySelector("#reui-clear")!.addEventListener("click", () => {
            this.m_draw.clearAll();
            this.m_textarea.value = "";
        });

        this.m_panel.querySelector("#reui-export")!.addEventListener("click", () => {
            const exported = this.exportWithOriginalProps();
            const json = JSON.stringify(exported, null, 2);
            this.m_textarea.value = json;
        });

        this.m_panel.querySelector("#reui-copy")!.addEventListener("click", () => {
            if (this.m_textarea.value) {
                navigator.clipboard.writeText(this.m_textarea.value).then(() => {
                    const btn = this.m_panel.querySelector("#reui-copy") as HTMLDivElement;
                    const orig = btn.textContent;
                    btn.textContent = "已复制!";
                    setTimeout(() => {
                        btn.textContent = orig;
                    }, 1500);
                });
            }
        });

        this.m_panel.querySelector("#reui-load")!.addEventListener("click", () => {
            const text = this.m_textarea.value.trim();
            if (!text) return;
            try {
                const parsed = JSON.parse(text);
                this.m_draw.clearAll();
                this.m_draw.addGeoJSON(parsed);
                alert("已从文本框加载 GeoJSON");
            } catch (e) {
                alert("JSON 解析失败: " + (e as Error).message);
            }
        });
    }

    private exportWithOriginalProps(): FeatureCollection {
        const objects = this.m_draw.getObjects();
        return {
            type: "FeatureCollection",
            features: objects.map(obj => {
                const geom = obj.toGeoJSON();
                const origProps = (obj as any).userData?.properties || {};
                return {
                    type: "Feature" as const,
                    id: (obj as any).userData?.featureId,
                    properties: { ...origProps },
                    geometry: geom as any
                };
            })
        };
    }

    private updateModeIndicator(label: string) {
        const el = this.m_panel.querySelector("#reui-mode") as HTMLSpanElement;
        if (el) el.textContent = label;
    }

    private buildHTML(): string {
        return `
<style>
#railway-edit-ui{position:absolute;top:16px;right:16px;width:48px;background:rgba(10,18,30,0.92);border:1px solid rgba(60,140,220,0.3);border-radius:12px;color:#c8d8e8;font-family:'Noto Sans',system-ui,sans-serif;font-size:13px;z-index:9999;backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.5);transition:width .25s ease;overflow:hidden}
#railway-edit-ui.reui-expanded{width:520px}
.reui-toggle-bar{display:flex;align-items:center;justify-content:center;padding:10px;cursor:pointer;font-weight:700;color:#e0ecf5;font-size:13px;letter-spacing:1px;user-select:none;border-bottom:1px solid rgba(60,140,220,0.12)}
.reui-toggle-bar:hover{background:rgba(60,140,220,0.1)}
.reui-body{display:none;padding:10px 14px 14px}
#railway-edit-ui.reui-expanded .reui-body{display:block}
.reui-toolbar{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
.reui-btn{padding:6px 10px;border:1px solid rgba(60,140,220,0.25);border-radius:5px;background:rgba(60,140,220,0.1);color:#b0c8e0;font-size:11px;cursor:pointer;transition:all .15s;font-weight:600;text-align:center}
.reui-btn:hover{background:rgba(60,140,220,0.22)}
.reui-btn:active{transform:scale(0.97)}
.reui-btn-danger{border-color:rgba(200,60,60,0.3);color:#d89090;background:rgba(200,60,60,0.08)}
.reui-btn-danger:hover{background:rgba(200,60,60,0.2)}
.reui-btn-export{border-color:rgba(40,180,80,0.4);color:#80d8a0;background:rgba(40,180,80,0.12)}
.reui-btn-export:hover{background:rgba(40,180,80,0.25)}
.reui-btn-import{border-color:rgba(220,180,40,0.4);color:#e0c860;background:rgba(220,180,40,0.12)}
.reui-btn-import:hover{background:rgba(220,180,40,0.25)}
.reui-mode-label{font-size:10px;color:#5a7a9a;margin-bottom:6px;display:flex;align-items:center;gap:6px}
.reui-mode-val{color:#80d8a0;font-weight:700}
#reui-output{width:100%;height:280px;background:rgba(0,0,0,0.4);border:1px solid rgba(60,140,220,0.15);border-radius:6px;color:#a0d0a0;font-family:'Fira Code',Consolas,monospace;font-size:11px;padding:8px;resize:vertical;box-sizing:border-box;outline:none;line-height:1.4}
#reui-output:focus{border-color:rgba(60,140,220,0.4)}
.reui-output-bar{display:flex;gap:4px;margin-top:6px;align-items:center}
.reui-info{font-size:10px;color:#5a7a9a;margin-top:4px}
</style>
<div class="reui-toggle-bar" id="reui-toggle">编辑 &#9662;</div>
<div class="reui-body">
    <div class="reui-mode-label">模式: <span class="reui-mode-val" id="reui-mode">无</span></div>
    <div class="reui-toolbar">
        <div class="reui-btn" id="reui-edit">编辑</div>
        <div class="reui-btn" id="reui-line">画线</div>
        <div class="reui-btn" id="reui-point">画点</div>
        <div class="reui-btn reui-btn-danger" id="reui-delete">删除</div>
        <div class="reui-btn reui-btn-danger" id="reui-clear">清空</div>
    </div>
    <div class="reui-toolbar">
        <div class="reui-btn reui-btn-export" id="reui-export">导出 GeoJSON</div>
        <div class="reui-btn reui-btn-import" id="reui-load">从文本框加载</div>
        <div class="reui-btn" id="reui-copy">复制</div>
    </div>
    <textarea id="reui-output" spellcheck="false" placeholder="点击「导出 GeoJSON」查看编辑结果..."></textarea>
    <div class="reui-info">编辑模式下点击线段可拖拽顶点，双击结束绘制</div>
</div>
`;
    }
}
