import * as THREE from "three";
import { RailwayDataSource } from "./RailwayDataSource";
import { TrainSimulator, SignalState } from "./TrainSimulator";

export class SignalOverlay {
    private m_div: HTMLDivElement;
    private m_worldPos = new THREE.Vector3();
    private m_visible = false;

    constructor(private m_sim: TrainSimulator, dataSource: RailwayDataSource, signalId: string) {
        const signal = this.m_sim.getSignals().get(signalId);
        if (!signal) throw new Error(`Signal ${signalId} not found`);

        const normal = dataSource.computeSurfaceNormal(signal.position);
        this.m_worldPos.copy(signal.position).add(normal.clone().multiplyScalar(1.2));

        const state = this.m_sim.getSignalState(signalId);

        this.m_div = document.createElement("div");
        this.m_div.innerHTML = `
            <style>
                @keyframes sig-pulse {
                    0%, 100% { box-shadow: 0 0 8px var(--glow); }
                    50% { box-shadow: 0 0 20px var(--glow), 0 0 40px var(--glow); }
                }
                .sig-btn {
                    display:flex;align-items:center;gap:6px;
                    padding:6px 14px;
                    border-radius:20px;
                    border:1.5px solid rgba(255,255,255,0.25);
                    cursor:pointer;
                    font-size:12px;font-weight:600;
                    font-family:'Noto Sans',sans-serif;
                    user-select:none;
                    transition:all 0.25s;
                    pointer-events:auto;
                    backdrop-filter:blur(8px);
                    --glow:rgba(255,60,60,0.6);
                    background:rgba(40,10,10,0.85);
                    color:#ff8080;
                    border-color:rgba(255,60,60,0.4);
                    animation:sig-pulse 2s ease-in-out infinite;
                }
                .sig-btn:hover {
                    transform:scale(1.08);
                }
                .sig-btn.green {
                    --glow:rgba(60,255,60,0.6);
                    background:rgba(10,40,10,0.85);
                    color:#80ff80;
                    border-color:rgba(60,255,60,0.4);
                    animation:sig-pulse 2s ease-in-out infinite;
                }
                .sig-dot {
                    width:8px;height:8px;
                    border-radius:50%;
                    background:#ff4444;
                    transition:background 0.3s;
                }
                .sig-btn.green .sig-dot {
                    background:#44ff44;
                }
            </style>
            <div class="sig-btn ${state === SignalState.GREEN ? "green" : ""}">
                <span class="sig-dot"></span>
                <span>信号</span>
            </div>
        `;

        this.m_div.style.cssText = `
            position: fixed;
            z-index: 999;
            pointer-events: none;
            display: none;
            text-align: center;
            transform: translate(-50%, -100%);
            transition: opacity 0.15s;
        `;

        const btn = this.m_div.querySelector(".sig-btn") as HTMLDivElement;
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const current = this.m_sim.getSignalState(signalId);
            if (current === SignalState.RED) {
                this.m_sim.setSignal(signalId, SignalState.GREEN);
                btn.classList.add("green");
            }
        });

        document.body.appendChild(this.m_div);
        this.m_visible = false;
        this.m_div.style.display = "none";
    }

    show(): void {
        this.m_visible = true;
        this.m_div.style.display = "block";
    }

    hide(): void {
        this.m_visible = false;
        this.m_div.style.display = "none";
    }

    update(camera: THREE.Camera): void {
        if (!this.m_visible) return;

        const pos = this.m_worldPos.clone();
        pos.project(camera);

        if (pos.z > 1) {
            this.m_div.style.opacity = "0";
            return;
        }

        this.m_div.style.opacity = "1";
        const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;

        this.m_div.style.left = `${x}px`;
        this.m_div.style.top = `${y}px`;
    }

    dispose(): void {
        this.m_div.remove();
    }
}
