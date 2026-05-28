import { TrainSimulator } from "./TrainSimulator";
import { ScenarioManager, type TrainConfig } from "./ScenarioManager";

const TRAIN_CONFIGS: TrainConfig[] = [
    { id: "T001", edgeIds: ["way/1307302217"], carriages: 10, speed: 6 },
    {
        id: "T002",
        edgeIds: ["way/1364486774", "way/324900278"],
        carriages: 8,
        speed: 4,
        signalId: "sig_junction"
    }
];

const STATE_LABEL: Record<string, string> = {
    waiting: "等待",
    moving: "运行中",
    stopped: "停车"
};

export class SimulationUI {
    private m_sim: TrainSimulator;
    private m_scenario: ScenarioManager;
    private m_container: HTMLDivElement;
    private m_listEl: HTMLDivElement;
    private m_startBtn!: HTMLDivElement;
    private m_running = false;
    private m_onStart?: () => void;
    private m_onReset?: () => void;

    constructor(
        sim: TrainSimulator,
        scenario: ScenarioManager,
        onStart?: () => void,
        onReset?: () => void
    ) {
        this.m_sim = sim;
        this.m_scenario = scenario;
        this.m_onStart = onStart;
        this.m_onReset = onReset;

        this.m_container = document.createElement("div");
        this.m_container.id = "railway-ui";
        this.m_container.innerHTML = this.buildHTML();
        document.body.appendChild(this.m_container);

        this.m_listEl = this.m_container.querySelector(".rui-list") as HTMLDivElement;
        this.m_startBtn = this.m_container.querySelector("#rui-start") as HTMLDivElement;

        this.m_startBtn.addEventListener("click", () => {
            if (this.m_running) return;
            this.m_running = true;
            this.m_startBtn.textContent = "运行中...";
            this.m_startBtn.style.opacity = "0.6";
            this.m_startBtn.style.pointerEvents = "none";
            this.m_scenario.run(TRAIN_CONFIGS);
            this.m_onStart?.();
        });

        this.m_container.querySelector("#rui-reset")!.addEventListener("click", () => {
            this.m_scenario.reset();
            this.resetUI();
            this.m_onReset?.();
        });

        this.m_scenario.onCycle(() => {
            this.resetUI();
            this.m_onReset?.();
        });

        this.addStyle();
    }

    private resetUI() {
        this.m_running = false;
        this.m_startBtn.textContent = "开始模拟";
        this.m_startBtn.style.opacity = "1";
        this.m_startBtn.style.pointerEvents = "auto";
    }

    update() {
        const trains = this.m_sim.getTrains();
        let html = "";
        if (trains.length === 0) {
            html = `<div class="rui-empty">暂无列车</div>`;
        } else {
            for (const t of trains) {
                const pct =
                    t.pathTotalLength > 0 ? Math.round((t.distance / t.pathTotalLength) * 100) : 0;
                html += `<div class="rui-row">
                    <span class="rui-id">${t.id}</span>
                    <span class="rui-state rui-state-${t.state}">${
                    STATE_LABEL[t.state] || t.state
                }</span>
                    <div class="rui-bar"><div class="rui-fill" style="width:${pct}%"></div></div>
                    <span class="rui-pct">${pct}%</span>
                    <span class="rui-speed">${t.speed > 0 ? t.speed.toFixed(0) : "—"}</span>
                    <span class="rui-cars">${t.carriages.length}节</span>
                </div>`;
            }
        }
        this.m_listEl.innerHTML = html;
    }

    private buildHTML(): string {
        return `
<style>
#railway-ui{position:absolute;top:16px;left:16px;width:300px;background:rgba(10,18,30,0.92);border:1px solid rgba(60,140,220,0.3);border-radius:12px;color:#c8d8e8;font-family:'Noto Sans',system-ui,sans-serif;font-size:13px;z-index:9999;backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.5)}
.rui-header{padding:14px 18px 8px;border-bottom:1px solid rgba(60,140,220,0.12)}
.rui-header h1{margin:0;font-size:14px;font-weight:700;color:#e0ecf5;letter-spacing:1px}
.rui-header .sub{font-size:11px;color:#5a7a9a;margin-top:1px}
.rui-ctrl{padding:10px 18px;display:flex;gap:6px;border-bottom:1px solid rgba(60,140,220,0.08)}
.rui-btn{padding:7px 0;border:1px solid rgba(60,140,220,0.25);border-radius:5px;background:rgba(60,140,220,0.1);color:#b0c8e0;font-size:12px;cursor:pointer;text-align:center;transition:all .15s;font-weight:600}
.rui-btn:hover{background:rgba(60,140,220,0.22)}.rui-btn:active{transform:scale(0.97)}
.rui-btn-start{flex:1;background:rgba(40,180,80,0.2);border-color:rgba(40,180,80,0.4);color:#80d8a0}
.rui-btn-start:hover{background:rgba(40,180,80,0.35)}
.rui-btn-reset{flex:1;background:rgba(200,60,60,0.12);border-color:rgba(200,60,60,0.25);color:#d89090}
.rui-btn-reset:hover{background:rgba(200,60,60,0.25)}
.rui-list{padding:10px 18px 14px}
.rui-empty{color:#4a6a8a;font-style:italic;font-size:11px;padding:3px 0}
.rui-row{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(60,140,220,0.05);font-size:11px}
.rui-id{color:#80b8e0;font-weight:700;min-width:40px}
.rui-state{font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600}
.rui-state-moving{background:rgba(40,180,80,0.2);color:#80d8a0}
.rui-state-stopped{background:rgba(60,140,220,0.2);color:#80b8e0}
.rui-state-waiting{background:rgba(220,180,40,0.2);color:#e0c860}
.rui-bar{flex:1;height:3px;background:rgba(60,140,220,0.1);border-radius:2px;overflow:hidden;min-width:40px}
.rui-fill{height:100%;background:linear-gradient(90deg,#4a9eff,#40d080);border-radius:2px;transition:width .3s}
.rui-pct{min-width:28px;text-align:right;color:#5a7a9a;font-size:10px}
.rui-speed{min-width:24px;text-align:right;color:#8ab8d0;font-size:10px}
.rui-cars{min-width:24px;text-align:right;color:#5a7a9a;font-size:10px}
</style>
<div class="rui-header">
    <h1>列车模拟</h1>
    <div class="sub">莱阳站 · Railway Simulation</div>
</div>
<div class="rui-ctrl">
    <div class="rui-btn rui-btn-start" id="rui-start">开始模拟</div>
    <div class="rui-btn rui-btn-reset" id="rui-reset">重置</div>
</div>
<div class="rui-list"></div>
`;
    }

    private addStyle() {
        const s = document.createElement("style");
        s.textContent = "#mapCanvas,.map-container{position:relative;width:100%;height:100%}";
        document.head.appendChild(s);
    }
}
