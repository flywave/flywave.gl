interface StatItem {
    label: string;
    today: number;
    month: number;
    year: number;
    unit: string;
}

interface AlertItem {
    level: "error" | "warn" | "info";
    time: string;
    message: string;
    location: string;
}

interface GaugeData {
    label: string;
    value: number;
    max: number;
    color: string;
}

interface LayerToggle {
    id: string;
    label: string;
    icon: string;
    type: "locate" | "overlay";
    active?: boolean;
}

interface FacilityStatus {
    name: string;
    status: "normal" | "busy" | "maintenance";
    detail: string;
    extra?: string;
}

const STATS: StatItem[] = [
    { label: "办理车数", today: 1284, month: 35672, year: 428150, unit: "辆" },
    { label: "编组列数", today: 86, month: 2340, year: 28080, unit: "列" },
    { label: "解体列数", today: 42, month: 1156, year: 13872, unit: "列" },
    { label: "中转时间", today: 4.2, month: 4.8, year: 5.1, unit: "h" },
    { label: "日办理量", today: 1284, month: 1189, year: 1173, unit: "辆" },
    { label: "安全天数", today: 365, month: 365, year: 365, unit: "天" }
];

const ALERTS: AlertItem[] = [
    { level: "error", time: "14:32", message: "3号道岔信号异常", location: "到达场3道" },
    { level: "warn", time: "14:15", message: "减速顶压力不足", location: "编组场5股道" },
    { level: "warn", time: "13:50", message: "驼峰信号机检修提醒", location: "驼峰区域" },
    { level: "info", time: "13:30", message: "大风预警 风力6级", location: "全站" },
    { level: "warn", time: "12:45", message: "到发线占用率偏高", location: "到达场3道" },
    { level: "info", time: "11:20", message: "设备巡检完成 巡检率100%", location: "全站" },
    { level: "error", time: "10:55", message: "7号道岔转换故障", location: "出发场7道" },
    { level: "warn", time: "10:30", message: "减速顶油温偏高", location: "编组场12股道" }
];

const GAUGES: GaugeData[] = [
    { label: "编组效率", value: 92.5, max: 100, color: "#00e5ff" },
    { label: "驼峰利用率", value: 85.6, max: 100, color: "#00ff9d" },
    { label: "到发线占用", value: 78.3, max: 100, color: "#7c4dff" },
    { label: "安全指数", value: 96.8, max: 100, color: "#00e676" }
];

const LAYERS: LayerToggle[] = [
    { id: "personnel", label: "人员定位", icon: "👤", type: "locate", active: true },
    { id: "locomotive", label: "机车监控", icon: "🚂", type: "locate", active: true },
    { id: "equipment", label: "设备状态", icon: "⚙", type: "overlay", active: true },
    { id: "camera", label: "视频监控", icon: "📹", type: "locate", active: false },
    { id: "weather", label: "天气信息", icon: "🌤", type: "overlay", active: false },
    { id: "retarder", label: "减速顶", icon: "⏺", type: "overlay", active: true },
    { id: "switch", label: "道岔", icon: "↗", type: "overlay", active: true },
    { id: "signal", label: "信号机", icon: "🚦", type: "overlay", active: true }
];

const FACILITIES: FacilityStatus[] = [
    { name: "到达场", status: "normal", detail: "12道 · 8占用" },
    { name: "编组场", status: "busy", detail: "32道 · 24占用", extra: "高负荷" },
    { name: "出发场", status: "normal", detail: "10道 · 6占用" },
    { name: "驼峰", status: "normal", detail: "运行中 · 解体42列" },
    { name: "机务段", status: "normal", detail: "机车18台 · 在用12台" },
    { name: "站修所", status: "maintenance", detail: "检修中 · 预计16:00", extra: "检修" }
];

function el(tag: string, cls?: string): HTMLElement {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
}

function svgEl(tag: string, attrs?: Record<string, string>): SVGElement {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
}

function createGaugeSVG(data: GaugeData): SVGElement {
    const svg = svgEl("svg", { viewBox: "0 0 120 90" });
    svg.style.width = "120px";
    svg.style.height = "90px";
    const cx = 60,
        cy = 55,
        r = 40;
    const startAngle = 135,
        endAngle = 405;
    const totalAngle = endAngle - startAngle;
    const pct = data.value / data.max;
    const valueAngle = startAngle + totalAngle * pct;

    const describeArc = (s: number, e: number): string => {
        const rad = (a: number) => (a * Math.PI) / 180;
        const x1 = cx + r * Math.cos(rad(s));
        const y1 = cy + r * Math.sin(rad(s));
        const x2 = cx + r * Math.cos(rad(e));
        const y2 = cy + r * Math.sin(rad(e));
        return `M ${x1} ${y1} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${x2} ${y2}`;
    };

    svg.appendChild(
        svgEl("path", {
            d: describeArc(startAngle, endAngle),
            fill: "none",
            stroke: "rgba(0,229,255,0.08)",
            "stroke-width": "6",
            "stroke-linecap": "round"
        })
    );

    const gradId = `g-${data.label.replace(/\s/g, "")}`;
    const defs = svgEl("defs");
    const grad = svgEl("linearGradient", { id: gradId, x1: "0%", y1: "0%", x2: "100%", y2: "0%" });
    grad.appendChild(
        svgEl("stop", { offset: "0%", "stop-color": data.color, "stop-opacity": "0.3" })
    );
    grad.appendChild(
        svgEl("stop", { offset: "100%", "stop-color": data.color, "stop-opacity": "1" })
    );
    defs.appendChild(grad);
    svg.appendChild(defs);

    svg.appendChild(
        svgEl("path", {
            d: describeArc(startAngle, valueAngle),
            fill: "none",
            stroke: `url(#${gradId})`,
            "stroke-width": "6",
            "stroke-linecap": "round"
        })
    );

    const valText = svgEl("text", {
        x: String(cx),
        y: String(cy),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: data.color,
        "font-family": "Orbitron, Courier New, monospace",
        "font-size": "22",
        "font-weight": "700"
    });
    valText.textContent = data.value.toFixed(1);
    svg.appendChild(valText);

    const unitText = svgEl("text", {
        x: String(cx),
        y: String(cy + 16),
        "text-anchor": "middle",
        fill: "rgba(224,247,250,0.4)",
        "font-size": "10"
    });
    unitText.textContent = "%";
    svg.appendChild(unitText);

    return svg;
}

function animateNumber(element: HTMLElement, target: number, duration: number): void {
    const start = parseFloat(element.textContent?.replace(/,/g, "") || "0");
    const t0 = performance.now();
    const step = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const cur = start + (target - start) * eased;
        element.textContent =
            target >= 1000
                ? Math.round(cur).toLocaleString()
                : (Math.round(cur * 10) / 10).toString();
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

export class DashboardOverlay {
    private m_root: HTMLDivElement;
    private m_clockInterval = 0;
    private m_simSlot: HTMLElement | null = null;

    constructor() {
        this.m_root = document.createElement("div");
        this.m_root.className = "db-overlay";
        this.injectStyles();
        this.build();
        document.body.appendChild(this.m_root);
        this.m_clockInterval = window.setInterval(() => this.updateClock, 1000);
        this.updateClock();
    }

    getSimSlot(): HTMLElement | null {
        return this.m_simSlot;
    }

    private build(): void {
        this.m_root.appendChild(this.buildHeader());

        const body = el("div", "db-body");
        body.appendChild(this.buildLeftPanel());
        body.appendChild(this.buildRightPanel());
        this.m_root.appendChild(body);

        this.m_root.appendChild(this.buildFooter());
    }

    private buildHeader(): HTMLElement {
        const h = el("div", "db-header");

        const left = el("div", "db-h-left");
        const clockWrap = el("div");
        const clock = el("div", "db-clock");
        clock.id = "db-clock";
        const date = el("div", "db-date");
        date.id = "db-date";
        clockWrap.appendChild(clock);
        clockWrap.appendChild(date);
        left.appendChild(clockWrap);
        h.appendChild(left);

        const center = el("div", "db-h-center");
        const title = el("div", "db-h-title");
        title.textContent = "铁路编组站智能调度大屏";
        const sub = el("div", "db-h-sub");
        sub.textContent = "RAILWAY MARSHALLING STATION INTELLIGENT DISPATCH SYSTEM";
        center.appendChild(title);
        center.appendChild(sub);
        h.appendChild(center);

        const right = el("div", "db-h-right");
        const weather = el("div", "db-weather");
        weather.innerHTML = `<span class="db-w-icon">☀</span><span>晴 26°C · 微风</span>`;
        right.appendChild(weather);
        const fsBtn = el("button", "db-fs-btn");
        fsBtn.textContent = "全屏";
        fsBtn.onclick = () => {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen();
            else document.exitFullscreen();
        };
        right.appendChild(fsBtn);
        h.appendChild(right);

        return h;
    }

    private buildLeftPanel(): HTMLElement {
        const panel = el("div", "db-panel db-p-left");
        panel.appendChild(el("div", "db-corner db-c-tr"));
        panel.appendChild(el("div", "db-corner db-c-bl"));

        const title1 = el("div", "db-p-title");
        title1.textContent = "运营统计";
        panel.appendChild(title1);

        const content1 = el("div", "db-p-content");

        const tabs = el("div", "db-tabs");
        ["今日", "本月", "年度"].forEach((label, i) => {
            const t = el("button", "db-tab" + (i === 0 ? " active" : ""));
            t.textContent = label;
            t.dataset.idx = String(i);
            t.onclick = () => {
                tabs.querySelectorAll(".db-tab").forEach(s => s.classList.remove("active"));
                t.classList.add("active");
                this.switchStatTab(i);
            };
            tabs.appendChild(t);
        });
        content1.appendChild(tabs);

        const grid = el("div", "db-stat-grid");
        grid.id = "db-stat-grid";
        STATS.forEach((s, idx) => {
            const card = el("div", "db-stat-card");
            card.style.animationDelay = `${idx * 0.06}s`;
            card.dataset.key = s.label;
            const val = el("div", "db-stat-val");
            const num = el("span", "db-stat-num");
            num.textContent = s.today >= 1000 ? s.today.toLocaleString() : String(s.today);
            const unit = el("span", "db-stat-unit");
            unit.textContent = s.unit;
            val.appendChild(num);
            val.appendChild(unit);
            card.appendChild(val);
            const lbl = el("div", "db-stat-lbl");
            lbl.textContent = s.label;
            card.appendChild(lbl);
            grid.appendChild(card);
        });
        content1.appendChild(grid);
        panel.appendChild(content1);

        const divider = el("div", "db-divider");
        divider.textContent = "图层控制";
        panel.appendChild(divider);

        const content2 = el("div", "db-p-content");
        const layerList = el("div", "db-layer-list");
        LAYERS.forEach(l => {
            const item = el("div", "db-layer" + (l.active ? " active" : ""));
            item.dataset.id = l.id;

            const icon = el("span", "db-l-icon");
            icon.textContent = l.icon;
            item.appendChild(icon);

            const lbl = el("span", "db-l-lbl");
            lbl.textContent = l.label;
            item.appendChild(lbl);

            const badge = el("span", "db-l-badge " + l.type);
            badge.textContent = l.type === "locate" ? "定位" : "叠加";
            item.appendChild(badge);

            const toggle = el("div", "db-l-toggle");
            item.appendChild(toggle);

            item.onclick = () => {
                item.classList.toggle("active");
            };

            layerList.appendChild(item);
        });
        content2.appendChild(layerList);
        panel.appendChild(content2);

        const simDivider = el("div", "db-divider");
        simDivider.textContent = "列车模拟";
        panel.appendChild(simDivider);

        this.m_simSlot = el("div", "db-sim-slot");
        this.m_simSlot.id = "db-sim-slot";
        panel.appendChild(this.m_simSlot);

        return panel;
    }

    private buildRightPanel(): HTMLElement {
        const panel = el("div", "db-panel db-p-right");
        panel.appendChild(el("div", "db-corner db-c-tr"));
        panel.appendChild(el("div", "db-corner db-c-bl"));

        const title1 = el("div", "db-p-title");
        title1.textContent = "关键指标";
        panel.appendChild(title1);

        const content1 = el("div", "db-p-content");
        const gaugeGrid = el("div", "db-gauge-grid");
        GAUGES.forEach(g => {
            const item = el("div", "db-gauge-item");
            item.appendChild(createGaugeSVG(g));
            const lbl = el("div", "db-gauge-lbl");
            lbl.textContent = g.label;
            item.appendChild(lbl);
            gaugeGrid.appendChild(item);
        });
        content1.appendChild(gaugeGrid);
        panel.appendChild(content1);

        const divider = el("div", "db-divider");
        divider.textContent = "预警信息";
        panel.appendChild(divider);

        const content2 = el("div", "db-p-content db-alert-scroll");
        const alertList = el("div", "db-alert-list");
        ALERTS.forEach((a, i) => {
            const item = el("div", `db-alert db-alert-${a.level}`);
            item.style.animationDelay = `${i * 0.08}s`;
            const dot = el("div", `db-alert-dot db-dot-${a.level}`);
            item.appendChild(dot);
            const body = el("div", "db-alert-body");
            const msg = el("div", "db-alert-msg");
            msg.textContent = a.message;
            body.appendChild(msg);
            const meta = el("div", "db-alert-meta");
            meta.innerHTML = `<span>${a.time}</span><span>${a.location}</span>`;
            body.appendChild(meta);
            item.appendChild(body);
            alertList.appendChild(item);
        });
        content2.appendChild(alertList);
        panel.appendChild(content2);

        return panel;
    }

    private buildFooter(): HTMLElement {
        const f = el("div", "db-footer");
        FACILITIES.forEach(fac => {
            const item = el("div", "db-fac");
            const dot = el("div", `db-fac-dot db-fac-${fac.status}`);
            item.appendChild(dot);
            const info = el("div", "db-fac-info");
            const row = el("div", "db-fac-row");
            const name = el("span", "db-fac-name");
            name.textContent = fac.name;
            row.appendChild(name);
            if (fac.extra) {
                const extra = el("span", "db-fac-extra");
                extra.textContent = fac.extra;
                row.appendChild(extra);
            }
            info.appendChild(row);
            const detail = el("span", "db-fac-detail");
            detail.textContent = fac.detail;
            info.appendChild(detail);
            item.appendChild(info);
            f.appendChild(item);
        });
        return f;
    }

    private switchStatTab(idx: number): void {
        const period = ["today", "month", "year"][idx];
        STATS.forEach((s, i) => {
            const card = document.querySelector(
                `[data-key="${s.label}"] .db-stat-num`
            ) as HTMLElement;
            if (card) animateNumber(card, s[period as keyof StatItem] as number, 500 + i * 40);
        });
    }

    private updateClock(): void {
        const now = new Date();
        const clock = document.getElementById("db-clock");
        const date = document.getElementById("db-date");
        if (clock) clock.textContent = now.toLocaleTimeString("zh-CN", { hour12: false });
        if (date)
            date.textContent = now.toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                weekday: "short"
            });
    }

    private injectStyles(): void {
        const style = document.createElement("style");
        style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');

.db-overlay *, .db-overlay *::before, .db-overlay *::after { box-sizing: border-box; margin: 0; padding: 0; }

.db-overlay {
    --bg: #020a18;
    --panel: rgba(2, 18, 40, 0.65);
    --border: rgba(0, 229, 255, 0.22);
    --border-hi: rgba(0, 229, 255, 0.5);
    --cyan: #00e5ff;
    --green: #00ff9d;
    --purple: #7c4dff;
    --orange: #ffa940;
    --red: #ff4d4f;
    --blue: #1890ff;
    --txt: #e0f7fa;
    --txt2: rgba(224, 247, 250, 0.5);
    --font-cn: 'PingFang SC', 'Microsoft YaHei', sans-serif;
    --font-num: 'Orbitron', 'DIN Alternate', monospace;
    --glow: 0 0 15px rgba(0,229,255,0.18), inset 0 0 15px rgba(0,229,255,0.04);
}

.db-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 10; pointer-events: none;
    display: flex; flex-direction: column;
    padding: 0; gap: 0;
    font-family: var(--font-cn);
    color: var(--txt);
}
.db-overlay > * { pointer-events: auto; }

/* === HEADER === */
.db-header {
    flex-shrink: 0;
    background: linear-gradient(180deg, rgba(0,20,50,0.75), rgba(0,15,35,0.6));
    border: 1px solid var(--border);
    border-radius: 0;
    padding: 10px 24px;
    display: flex; align-items: center; justify-content: space-between;
    box-shadow: var(--glow);
    position: relative; overflow: hidden;
}
.db-header::before {
    content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, var(--cyan), transparent);
    animation: db-line 3s ease-in-out infinite;
}
.db-header::after {
    content: ''; position: absolute; top: 0; left: -100%; width: 200%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(0,229,255,0.03), transparent);
    animation: db-scan 4s linear infinite;
}
@keyframes db-line { 0%,100%{opacity:.4} 50%{opacity:1} }
@keyframes db-scan { from{transform:translateX(-50%)} to{transform:translateX(50%)} }

.db-h-left, .db-h-right { display: flex; align-items: center; gap: 14px; min-width: 220px; }
.db-h-right { justify-content: flex-end; }
.db-h-center { text-align: center; flex: 1; }
.db-h-title {
    font-size: 30px; font-weight: 700; letter-spacing: 8px;
    background: linear-gradient(180deg, #fff, var(--cyan));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 10px rgba(0,229,255,0.4));
}
.db-h-sub { font-size: 13px; color: var(--txt2); letter-spacing: 3px; margin-top: 1px; }
.db-clock { font-family: var(--font-num); font-size: 18px; color: var(--cyan); letter-spacing: 1px; }
.db-date { font-size: 14px; color: var(--txt2); }
.db-weather { display: flex; align-items: center; gap: 8px; font-size: 16px; }
.db-w-icon { font-size: 22px; }
.db-fs-btn {
    background: rgba(0,229,255,0.1); border: 1px solid rgba(0,229,255,0.3);
    color: var(--cyan); padding: 6px 14px; border-radius: 3px;
    cursor: pointer; font-size: 14px; transition: all .3s; font-family: var(--font-cn);
}
.db-fs-btn:hover { background: rgba(0,229,255,0.2); box-shadow: 0 0 12px rgba(0,229,255,0.3); }

/* === BODY === */
.db-body { flex: 1; display: flex; justify-content: space-between; gap: 0; min-height: 0; pointer-events: none; }
.db-body > .db-panel { pointer-events: auto; }

/* === PANEL === */
.db-panel {
    background: var(--panel); border: 1px solid var(--border); border-radius: 0;
    box-shadow: var(--glow); position: relative; overflow: hidden;
    display: flex; flex-direction: column;
}
.db-panel::before, .db-panel::after {
    content: ''; position: absolute; width: 14px; height: 14px;
    border-color: var(--cyan); border-style: solid; z-index: 2;
}
.db-panel::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
.db-panel::after { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

.db-corner { position: absolute; width: 14px; height: 14px; border-color: var(--cyan); border-style: solid; z-index: 2; pointer-events: none; }
.db-c-tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
.db-c-bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }

.db-p-left { width: 270px; flex-shrink: 0; }
.db-p-right { width: 280px; flex-shrink: 0; }

.db-p-title {
    font-size: 16px; font-weight: 600; letter-spacing: 2px;
    padding: 12px 16px 10px; border-bottom: 1px solid var(--border);
    position: relative; display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.db-p-title::before {
    content: ''; width: 3px; height: 16px;
    background: var(--cyan); border-radius: 1px; box-shadow: 0 0 8px var(--cyan);
}
.db-p-title::after {
    content: ''; position: absolute; bottom: -1px; left: 14px; right: 14px; height: 1px;
    background: linear-gradient(90deg, var(--cyan), transparent);
}

.db-p-content {
    flex: 1; overflow-y: auto; padding: 12px 16px;
    scrollbar-width: thin; scrollbar-color: rgba(0,229,255,0.2) transparent;
}
.db-p-content::-webkit-scrollbar { width: 3px; }
.db-p-content::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.3); border-radius: 2px; }

/* === TABS === */
.db-tabs { display: flex; margin-bottom: 12px; border: 1px solid var(--border); border-radius: 3px; overflow: hidden; }
.db-tab {
    flex: 1; padding: 6px 0; text-align: center; font-size: 14px;
    color: var(--txt2); cursor: pointer; transition: all .3s;
    background: transparent; border: none; font-family: var(--font-cn);
}
.db-tab:hover { color: var(--txt); }
.db-tab.active { background: rgba(0,229,255,0.15); color: var(--cyan); }

/* === STATS === */
.db-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.db-stat-card {
    background: rgba(0,20,50,0.5); border: 1px solid rgba(0,229,255,0.1);
    border-radius: 3px; padding: 10px 12px; transition: all .3s;
    animation: db-fadeIn .5s ease-out forwards; opacity: 0;
}
@keyframes db-fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
.db-stat-card:hover { border-color: rgba(0,229,255,0.3); box-shadow: 0 0 8px rgba(0,229,255,0.12); }
.db-stat-val {
    font-family: var(--font-num); font-size: 22px; font-weight: 700;
    color: var(--cyan); text-shadow: 0 0 10px rgba(0,229,255,0.3);
}
.db-stat-unit { font-size: 13px; font-weight: 400; color: var(--txt2); margin-left: 2px; }
.db-stat-lbl { font-size: 13px; color: var(--txt2); margin-top: 3px; }

/* === DIVIDER === */
.db-divider {
    display: flex; align-items: center; gap: 8px;
    margin: 10px 16px 0; font-size: 14px; color: var(--txt2); letter-spacing: 2px; flex-shrink: 0;
}
.db-divider::before, .db-divider::after {
    content: ''; flex: 1; height: 1px;
}
.db-divider::before { background: linear-gradient(90deg, transparent, var(--border)); }
.db-divider::after { background: linear-gradient(90deg, var(--border), transparent); }

/* === LAYERS === */
.db-layer-list { display: flex; flex-direction: column; gap: 3px; }
.db-layer {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; border-radius: 3px; cursor: pointer;
    transition: all .3s; background: rgba(0,20,50,0.4); border: 1px solid transparent;
}
.db-layer:hover { background: rgba(0,30,60,0.6); border-color: rgba(0,229,255,0.12); }
.db-layer.active { background: rgba(0,229,255,0.06); border-color: rgba(0,229,255,0.2); }
.db-l-icon { font-size: 18px; width: 26px; text-align: center; }
.db-l-lbl { flex: 1; font-size: 14px; }
.db-l-badge {
    font-size: 11px; padding: 2px 6px; border-radius: 2px; letter-spacing: 1px;
}
.db-l-badge.locate { background: rgba(0,229,255,0.12); color: var(--cyan); border: 1px solid rgba(0,229,255,0.25); }
.db-l-badge.overlay { background: rgba(0,255,157,0.08); color: var(--green); border: 1px solid rgba(0,255,157,0.2); }
.db-l-toggle {
    width: 38px; height: 20px; border-radius: 10px;
    background: rgba(255,255,255,0.1); position: relative; transition: all .3s; flex-shrink: 0;
}
.db-l-toggle::after {
    content: ''; width: 14px; height: 14px; border-radius: 50%;
    background: rgba(255,255,255,0.5); position: absolute; top: 3px; left: 3px; transition: all .3s;
}
.db-layer.active .db-l-toggle { background: rgba(0,229,255,0.3); }
.db-layer.active .db-l-toggle::after { left: 22px; background: var(--cyan); box-shadow: 0 0 6px var(--cyan); }

/* === SIM SLOT === */
.db-sim-slot { padding: 10px 16px; flex-shrink: 0; }
.db-sim-slot #railway-ui { position: static; width: 100%; background: transparent; border: none; border-radius: 0; box-shadow: none; backdrop-filter: none; color: var(--txt); font-family: var(--font-cn); font-size: 14px; }
.db-sim-slot .rui-ctrl { padding: 0; border: none; display: flex; gap: 6px; }
.db-sim-slot .rui-btn { flex: 1; padding: 8px 0; border-radius: 3px; font-size: 14px; font-weight: 600; cursor: pointer; text-align: center; transition: all .15s; font-family: var(--font-cn); }
.db-sim-slot .rui-btn-start { background: rgba(0,255,157,0.15); border: 1px solid rgba(0,255,157,0.35); color: #80ffb0; }
.db-sim-slot .rui-btn-start:hover { background: rgba(0,255,157,0.25); }
.db-sim-slot .rui-btn-start[style*="opacity"] { opacity: 0.6; pointer-events: none; }
.db-sim-slot .rui-btn-reset { background: rgba(255,77,79,0.1); border: 1px solid rgba(255,77,79,0.25); color: #ff9090; }
.db-sim-slot .rui-btn-reset:hover { background: rgba(255,77,79,0.2); }
.db-sim-slot .rui-list { padding: 8px 0 0; }
.db-sim-slot .rui-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid rgba(0,229,255,0.06); font-size: 12px; color: var(--txt); }
.db-sim-slot .rui-id { color: var(--cyan); font-weight: 700; min-width: 40px; }
.db-sim-slot .rui-state { font-size: 11px; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
.db-sim-slot .rui-state-moving { background: rgba(0,255,157,0.15); color: #80ffb0; }
.db-sim-slot .rui-state-stopped { background: rgba(0,229,255,0.12); color: var(--cyan); }
.db-sim-slot .rui-state-waiting { background: rgba(255,169,64,0.15); color: var(--orange); }
.db-sim-slot .rui-bar { flex: 1; height: 3px; background: rgba(0,229,255,0.08); border-radius: 2px; overflow: hidden; min-width: 40px; }
.db-sim-slot .rui-fill { height: 100%; background: linear-gradient(90deg, var(--cyan), var(--green)); border-radius: 2px; transition: width .3s; }
.db-sim-slot .rui-pct { min-width: 30px; text-align: right; color: var(--txt2); font-size: 11px; }
.db-sim-slot .rui-speed { min-width: 26px; text-align: right; color: var(--txt2); font-size: 11px; }
.db-sim-slot .rui-cars { min-width: 26px; text-align: right; color: var(--txt2); font-size: 11px; }
.db-sim-slot .rui-empty { color: var(--txt2); font-style: italic; font-size: 12px; padding: 4px 0; }

/* === GAUGES === */
.db-gauge-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.db-gauge-item { display: flex; flex-direction: column; align-items: center; padding: 6px 0; }
.db-gauge-lbl { font-size: 13px; color: var(--txt2); margin-top: 2px; }

/* === ALERTS === */
.db-alert-scroll { flex: 1; }
.db-alert-list { display: flex; flex-direction: column; gap: 5px; }
.db-alert {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 8px 12px; border-radius: 3px;
    background: rgba(0,20,50,0.4); border-left: 3px solid;
    animation: db-slideIn .4s ease-out; transition: all .3s;
}
@keyframes db-slideIn { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:translateX(0)} }
.db-alert:hover { background: rgba(0,30,60,0.6); }
.db-alert-error { border-left-color: var(--red); }
.db-alert-warn { border-left-color: var(--orange); }
.db-alert-info { border-left-color: var(--blue); }
.db-alert-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
.db-dot-error { background: var(--red); box-shadow: 0 0 6px var(--red); animation: db-pulse 1.5s infinite; }
.db-dot-warn { background: var(--orange); box-shadow: 0 0 5px var(--orange); }
.db-dot-info { background: var(--blue); }
@keyframes db-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
.db-alert-body { flex: 1; min-width: 0; }
.db-alert-msg { font-size: 14px; line-height: 1.4; }
.db-alert-meta { font-size: 12px; color: var(--txt2); margin-top: 3px; display: flex; gap: 8px; }

/* === FOOTER === */
.db-footer {
    flex-shrink: 0;
    background: linear-gradient(0deg, rgba(0,20,50,0.75), rgba(0,15,35,0.6));
    border: 1px solid var(--border); border-radius: 0;
    padding: 8px 20px; display: flex; align-items: center; justify-content: space-around;
    box-shadow: var(--glow); position: relative;
}
.db-footer::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, var(--cyan), transparent);
}
.db-fac {
    display: flex; align-items: center; gap: 7px; padding: 4px 10px;
    border-radius: 3px; cursor: default; transition: all .3s;
}
.db-fac:hover { background: rgba(0,229,255,0.06); }
.db-fac-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.db-fac-normal { background: var(--green); box-shadow: 0 0 5px var(--green); }
.db-fac-busy { background: var(--orange); box-shadow: 0 0 5px var(--orange); animation: db-pulse 2s infinite; }
.db-fac-maintenance { background: var(--red); box-shadow: 0 0 5px var(--red); }
.db-fac-info { display: flex; flex-direction: column; }
.db-fac-row { display: flex; align-items: center; gap: 4px; }
.db-fac-name { font-size: 14px; font-weight: 600; }
.db-fac-extra { font-size: 11px; padding: 0 5px; border-radius: 2px; background: rgba(255,77,79,0.15); color: var(--red); }
.db-fac-detail { font-size: 12px; color: var(--txt2); }

/* === RESPONSIVE === */
@media (max-width: 1400px) {
    .db-p-left { width: 230px; }
    .db-p-right { width: 250px; }
    .db-h-title { font-size: 24px; letter-spacing: 4px; }
}

@media (max-width: 1200px) {
    .db-p-left { width: 200px; }
    .db-p-right { width: 220px; }
    .db-h-title { font-size: 20px; letter-spacing: 2px; }
}

.db-overlay .map-controls-ui { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    dispose(): void {
        if (this.m_clockInterval) clearInterval(this.m_clockInterval);
        this.m_root.remove();
    }
}
