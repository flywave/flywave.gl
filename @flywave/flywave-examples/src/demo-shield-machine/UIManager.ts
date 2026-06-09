import {
    type PartInfo,
    getStatusLabel,
    getStatusColor,
    MACHINE_METRICS,
    MACHINE_INFO
} from "./mockData";

const CSS = `
.dtm-root {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    font-family: -apple-system, 'Segoe UI', 'Helvetica Neue', monospace;
    color: #9aa8b8;
    z-index: 1000;
    user-select: none;
}

.dtm-root * {
    box-sizing: border-box;
}

/* === Top Bar === */
.dtm-topbar {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 52px;
    background: linear-gradient(180deg, rgba(6, 14, 30, 0.92) 0%, rgba(6, 14, 30, 0.0) 100%);
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 16px;
}

.dtm-topbar-title {
    font-size: 15px;
    font-weight: 700;
    color: #d0dce8;
    letter-spacing: 2px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.dtm-topbar-title::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    background: #5ba4c9;
    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
}

.dtm-topbar-sep {
    width: 1px;
    height: 24px;
    background: rgba(100, 140, 170, 0.25);
}

.dtm-topbar-meta {
    font-size: 12px;
    color: #5a6a7a;
    display: flex;
    gap: 20px;
}

.dtm-topbar-meta span {
    display: flex;
    align-items: center;
    gap: 6px;
}

.dtm-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #5cb87a;
    box-shadow: 0 0 6px rgba(92, 184, 122, 0.5);
    animation: dtm-pulse 2s ease-in-out infinite;
}

@keyframes dtm-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

.dtm-topbar-right {
    margin-left: auto;
    font-size: 11px;
    color: #3e4e5e;
    text-align: right;
    line-height: 1.5;
}

/* === Bottom Bar === */
.dtm-bottombar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 56px;
    background: linear-gradient(0deg, rgba(6, 14, 30, 0.92) 0%, rgba(6, 14, 30, 0.0) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0 20px;
}

.dtm-metric {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 20px;
    border-left: 1px solid rgba(100, 140, 170, 0.12);
}

.dtm-metric:first-child {
    border-left: none;
}

.dtm-metric-label {
    font-size: 10px;
    color: #3e4e5e;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 2px;
}

.dtm-metric-value {
    font-size: 15px;
    font-weight: 700;
    color: #b8c8d8;
}

.dtm-metric-unit {
    font-size: 10px;
    color: #3e4e5e;
    margin-left: 3px;
}

/* === Right Controls === */
.dtm-controls {
    position: absolute;
    top: 50%;
    right: 16px;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: auto;
}

.dtm-btn {
    padding: 10px 14px;
    background: rgba(8, 16, 32, 0.85);
    color: #7a8e9e;
    border: 1px solid rgba(100, 140, 170, 0.18);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    letter-spacing: 1px;
    transition: all 0.25s ease;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    text-align: center;
    min-width: 72px;
}

.dtm-btn:hover {
    background: rgba(100, 140, 170, 0.12);
    border-color: rgba(100, 140, 170, 0.35);
    color: #8ebad4;
    box-shadow: 0 0 12px rgba(100, 140, 170, 0.1);
}

.dtm-btn.active {
    background: rgba(100, 140, 170, 0.15);
    border-color: rgba(100, 140, 170, 0.4);
    color: #8ebad4;
}

/* === Left Panel === */
.dtm-panel {
    position: absolute;
    top: 60px;
    left: 0;
    bottom: 64px;
    width: 320px;
    background: rgba(8, 14, 26, 0.85);
    border-right: none;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    overflow-y: auto;
    overflow-x: hidden;
    pointer-events: auto;
    -webkit-mask-image:
        linear-gradient(to right, black 95%, transparent 100%),
        linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%);
    mask-image:
        linear-gradient(to right, black 95%, transparent 100%),
        linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
    padding: 20px 20px 32px 16px;
}

.dtm-panel-header {
    padding: 0 0 12px;
    border-bottom: 1px solid rgba(100, 140, 170, 0.12);
}

.dtm-panel-body {
    margin-top: 4px;
}

.dtm-panel-header {
    padding: 0 0 12px;
    border-bottom: 1px solid rgba(100, 140, 170, 0.12);
}

.dtm-panel-title {
    font-size: 16px;
    font-weight: 700;
    color: #c0d0e0;
    margin-bottom: 6px;
}

.dtm-panel-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #5a6a7a;
}

.dtm-panel-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
}

.dtm-panel-section {
    padding: 12px 0;
    border-bottom: 1px solid rgba(100, 140, 170, 0.08);
}

.dtm-section-title {
    font-size: 11px;
    color: #7a9ab0;
    letter-spacing: 2px;
    margin-bottom: 10px;
    text-transform: uppercase;
}

.dtm-field {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
}

.dtm-field-label {
    font-size: 12px;
    color: #4a5a6a;
}

.dtm-field-value {
    font-size: 13px;
    font-weight: 600;
    color: #8ea0b0;
}

.dtm-panel-desc {
    font-size: 12px;
    color: #5a6a7a;
    line-height: 1.7;
}

/* === Scrollbar === */
.dtm-panel::-webkit-scrollbar {
    width: 4px;
}
.dtm-panel::-webkit-scrollbar-track {
    background: transparent;
}
.dtm-panel::-webkit-scrollbar-thumb {
    background: rgba(100, 140, 170, 0.2);
    border-radius: 2px;
}
`;

export interface UIDelegate {
    onExplodeAxial: () => void;
    onExplodeRadial: () => void;
    onCollapse: () => void;
    onReset: () => void;
}

export class UIManager {
    private root: HTMLElement;
    private panel: HTMLElement;
    private panelContent: HTMLElement;

    constructor(private delegate: UIDelegate) {
        this.root = document.createElement("div");
        this.root.className = "dtm-root";

        const style = document.createElement("style");
        style.textContent = CSS;
        document.head.appendChild(style);

        this.renderTopBar();
        this.renderBottomBar();
        this.renderControls();
        this.panel = this.createPanel();
        this.panelContent = this.panel.querySelector(".dtm-panel-body") as HTMLElement;
        this.root.appendChild(this.panel);
        this.showOverview();
    }

    private renderTopBar() {
        const bar = document.createElement("div");
        bar.className = "dtm-topbar";
        bar.innerHTML = `
            <div class="dtm-topbar-title">盾构机数字孪生展示平台</div>
            <div class="dtm-topbar-sep"></div>
            <div class="dtm-topbar-meta">
                <span><span class="dtm-status-dot"></span> 运行中</span>
                <span>${MACHINE_INFO.model}</span>
                <span>${MACHINE_INFO.diameter}</span>
            </div>
            <div class="dtm-topbar-right">
                ${MACHINE_INFO.projectId}<br>
                ${MACHINE_INFO.station}
            </div>
        `;
        this.root.appendChild(bar);
    }

    private renderBottomBar() {
        const bar = document.createElement("div");
        bar.className = "dtm-bottombar";
        const metrics = Object.values(MACHINE_METRICS);
        bar.innerHTML = metrics
            .map(
                m =>
                    `<div class="dtm-metric">
                <div class="dtm-metric-label">${m.label}</div>
                <div class="dtm-metric-value">${m.value}<span class="dtm-metric-unit">${m.unit}</span></div>
            </div>`
            )
            .join("");
        this.root.appendChild(bar);
    }

    private renderControls() {
        const ctrl = document.createElement("div");
        ctrl.className = "dtm-controls";

        const btnData = [
            { label: "轴向拆解", action: () => this.delegate.onExplodeAxial() },
            { label: "径向拆解", action: () => this.delegate.onExplodeRadial() },
            { label: "复原", action: () => this.delegate.onCollapse() }, 
        ];

        btnData.forEach(b => {
            const btn = document.createElement("button");
            btn.className = "dtm-btn";
            btn.textContent = b.label;
            btn.addEventListener("click", b.action);
            ctrl.appendChild(btn);
        });

        this.root.appendChild(ctrl);
    }

    private createPanel(): HTMLElement {
        const panel = document.createElement("div");
        panel.className = "dtm-panel";
        panel.innerHTML = `
            <div class="dtm-panel-header">
                <div class="dtm-panel-title" id="dtm-pname">--</div>
                <div class="dtm-panel-status">
                    <span class="dtm-panel-status-dot" id="dtm-pdot"></span>
                    <span id="dtm-pstatus">--</span>
                </div>
            </div>
            <div class="dtm-panel-body"></div>
        `;
        return panel;
    }

    showOverview() {
        const title = this.panel.querySelector("#dtm-pname") as HTMLElement;
        const dot = this.panel.querySelector("#dtm-pdot") as HTMLElement;
        const status = this.panel.querySelector("#dtm-pstatus") as HTMLElement;

        title.textContent = MACHINE_INFO.name;
        dot.style.background = "#00ff88";
        dot.style.boxShadow = "0 0 6px rgba(0, 255, 136, 0.6)";
        status.textContent = "运行中";

        this.panelContent.innerHTML = `
            <div class="dtm-panel-section">
                <div class="dtm-section-title">设备信息</div>
                <div class="dtm-field"><span class="dtm-field-label">设备型号</span><span class="dtm-field-value">${MACHINE_INFO.model}</span></div>
                <div class="dtm-field"><span class="dtm-field-label">制造商</span><span class="dtm-field-value">${MACHINE_INFO.manufacturer}</span></div>
                <div class="dtm-field"><span class="dtm-field-label">直径</span><span class="dtm-field-value">${MACHINE_INFO.diameter}</span></div>
                <div class="dtm-field"><span class="dtm-field-label">整机长度</span><span class="dtm-field-value">${MACHINE_INFO.totalLength}</span></div>
                <div class="dtm-field"><span class="dtm-field-label">整机重量</span><span class="dtm-field-value">${MACHINE_INFO.weight}</span></div>
            </div>
            <div class="dtm-panel-section">
                <div class="dtm-section-title">工程信息</div>
                <div class="dtm-field"><span class="dtm-field-label">项目</span><span class="dtm-field-value">${MACHINE_INFO.projectId}</span></div>
                <div class="dtm-field"><span class="dtm-field-label">区间</span><span class="dtm-field-value">${MACHINE_INFO.station}</span></div>
            </div>
            <div class="dtm-panel-section">
                <div class="dtm-section-title">操作指引</div>
                <div class="dtm-panel-desc">点击模型部件查看设备详细信息，可使用右侧按钮进行轴向/径向拆解展示。</div>
            </div>
        `;
    }

    showPartInfo(info: PartInfo, meshName: string) {
        const title = this.panel.querySelector("#dtm-pname") as HTMLElement;
        const dot = this.panel.querySelector("#dtm-pdot") as HTMLElement;
        const status = this.panel.querySelector("#dtm-pstatus") as HTMLElement;

        title.textContent = info.name;
        dot.style.background = getStatusColor(info.status);
        dot.style.boxShadow = `0 0 6px ${getStatusColor(info.status)}60`;
        status.textContent = getStatusLabel(info.status);

        this.panelContent.innerHTML = `
            <div class="dtm-panel-section">
                <div class="dtm-section-title">设备信息</div>
                <div class="dtm-field"><span class="dtm-field-label">部件名称</span><span class="dtm-field-value">${meshName}</span></div>
                <div class="dtm-field"><span class="dtm-field-label">制造商</span><span class="dtm-field-value">${info.manufacturer}</span></div>
                <div class="dtm-field"><span class="dtm-field-label">型号</span><span class="dtm-field-value">${info.model}</span></div>
                <div class="dtm-field"><span class="dtm-field-label">安装日期</span><span class="dtm-field-value">${info.installDate}</span></div>
            </div>
            <div class="dtm-panel-section">
                <div class="dtm-section-title">运行参数</div>
                <div class="dtm-field"><span class="dtm-field-label">累计运行</span><span class="dtm-field-value">${info.operatingHours}h</span></div>
                <div class="dtm-field"><span class="dtm-field-label">温度</span><span class="dtm-field-value">${info.temperature}°C</span></div>
                <div class="dtm-field"><span class="dtm-field-label">振动</span><span class="dtm-field-value">${info.vibration}mm/s</span></div>
                <div class="dtm-field"><span class="dtm-field-label">功率</span><span class="dtm-field-value">${info.power}kW</span></div>
            </div>
            <div class="dtm-panel-section">
                <div class="dtm-section-title">维护信息</div>
                <div class="dtm-field"><span class="dtm-field-label">上次维护</span><span class="dtm-field-value">${info.lastMaintenance}</span></div>
                <div class="dtm-field"><span class="dtm-field-label">下次维护</span><span class="dtm-field-value">${info.nextMaintenance}</span></div>
            </div>
            <div class="dtm-panel-section">
                <div class="dtm-section-title">描述</div>
                <div class="dtm-panel-desc">${info.description}</div>
            </div>
        `;
    }

    setExplodeButtonActive(mode: "axial" | "radial" | null) {
        const btns = this.root.querySelectorAll(".dtm-btn") as NodeListOf<HTMLElement>;
        btns.forEach(btn => btn.classList.remove("active"));
        if (mode === "axial" && btns[0]) btns[0].classList.add("active");
        if (mode === "radial" && btns[1]) btns[1].classList.add("active");
        if (mode === null && btns[2]) btns[2].classList.add("active");
    }

    mount(parent: HTMLElement) {
        parent.appendChild(this.root);
    }
}
