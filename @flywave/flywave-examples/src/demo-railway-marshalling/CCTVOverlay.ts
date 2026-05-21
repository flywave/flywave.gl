import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RailwayDataSource } from "./RailwayDataSource";

export class CCTVOverlay {
    private m_div: HTMLDivElement;
    private m_worldPos = new THREE.Vector3();
    private m_visible = false;
    private m_popover: HTMLDivElement;
    private m_video: HTMLVideoElement;
    private m_popoverVisible = false;

    constructor(name: string) {
        this.m_div = document.createElement("div");
        this.m_div.innerHTML = `
            <style>
                @keyframes cctv-pulse {
                    0%, 100% { transform: scale(1); opacity: 0.6; }
                    50% { transform: scale(1.4); opacity: 0; }
                }
                @keyframes cctv-pulse-fast {
                    0%, 100% { transform: scale(1); opacity: 0.6; }
                    50% { transform: scale(1.6); opacity: 0; }
                }
                @keyframes cctv-scan {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes cctv-float {
                    0%, 100% { transform: translate(-50%, -100%) translateY(0); }
                    50% { transform: translate(-50%, -100%) translateY(-6px); }
                }
                @keyframes cctv-popover-in {
                    0% { opacity:0; transform: translateX(-50%) scale(0.9); }
                    100% { opacity:1; transform: translateX(-50%) scale(1); }
                }
                .cctv-wrapper {
                    position:relative;
                    display:flex;flex-direction:column;align-items:center;
                    pointer-events:auto;
                }
                .cctv-icon-row {
                    display:flex;align-items:center;justify-content:center;
                    width:40px;height:40px;
                    animation:cctv-float 3s ease-in-out infinite;
                }
                .cctv-pulse-ring {
                    position:absolute;
                    width:40px;height:40px;
                    border-radius:50%;
                    border:2px solid #00b4ff;
                    animation:cctv-pulse 2s ease-out infinite;
                    transition:all 0.3s;
                }
                .cctv-pulse-ring.active {
                    border-color:#00ff88;
                    animation:cctv-pulse-fast 0.8s ease-out infinite;
                }
                .cctv-scan-line {
                    position:absolute;
                    width:40px;height:40px;
                    border-radius:50%;
                    opacity:0;
                    transition:opacity 0.3s;
                    pointer-events:none;
                    z-index:2;
                    overflow:hidden;
                }
                .cctv-scan-line.active {
                    opacity:1;
                }
                .cctv-scan-line::before {
                    content:'';
                    position:absolute;
                    top:-2px;left:50%;
                    width:2px;height:22px;
                    background:linear-gradient(to bottom,rgba(0,255,136,0.8),transparent);
                    transform:translateX(-50%);
                    border-radius:1px;
                }
                .cctv-scan-line.active::before {
                    animation:cctv-scan 1.5s linear infinite;
                }
                .cctv-icon {
                    width:40px;height:40px;
                    background:linear-gradient(135deg,#0078ff,#00b4ff);
                    border-radius:50%;
                    display:flex;align-items:center;justify-content:center;
                    box-shadow:0 4px 20px rgba(0,120,255,0.6), inset 0 -2px 4px rgba(0,0,0,0.2);
                    cursor:pointer;
                    transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s;
                    border:2px solid rgba(255,255,255,0.4);
                    user-select:none;
                    position:relative;
                    z-index:1;
                }
                .cctv-icon:hover {
                    transform:scale(1.15);
                    box-shadow:0 6px 30px rgba(0,180,255,0.8), 0 0 60px rgba(0,120,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2);
                    border-color:#00ff88;
                }
                .cctv-icon svg {
                    width:30px;height:30px;
                    transition:filter 0.3s;
                }
                .cctv-icon:hover svg {
                    filter:drop-shadow(0 0 4px rgba(0,255,136,0.5));
                }
                .cctv-tooltip {
                    position:absolute;
                    top:44px;
                    left:50%;
                    transform:translateX(-50%);
                    background:rgba(0,0,0,0.8);
                    color:white;
                    padding:3px 10px;
                    border-radius:6px;
                    font-size:11px;
                    font-family:'Noto Sans',sans-serif;
                    white-space:nowrap;
                    backdrop-filter:blur(4px);
                    border:1px solid rgba(255,255,255,0.15);
                    opacity:0;
                    transition:opacity 0.25s;
                    pointer-events:none;
                    z-index:3;
                }
                .cctv-icon:hover + .cctv-tooltip {
                    opacity:1;
                }
                .cctv-popover {
                    position:absolute;
                    bottom:85px;
                    left:50%;
                    transform:translateX(-50%);
                    width:320px;
                    background:#111;
                    border-radius:12px;
                    border:1px solid rgba(255,255,255,0.12);
                    box-shadow:0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,120,255,0.2);
                    overflow:hidden;
                    display:none;
                    animation:cctv-popover-in 0.25s ease-out;
                    z-index:10;
                }
                .cctv-popover::after {
                    content:'';
                    position:absolute;
                    bottom:-8px;
                    left:50%;
                    margin-left:-8px;
                    width:0;height:0;
                    border-left:8px solid transparent;
                    border-right:8px solid transparent;
                    border-top:8px solid #1a1a1a;
                }
                .cctv-popover-header {
                    display:flex;align-items:center;justify-content:space-between;
                    padding:8px 12px;
                    background:rgba(0,0,0,0.3);
                    border-bottom:1px solid rgba(255,255,255,0.06);
                }
                .cctv-popover-title {
                    display:flex;align-items:center;gap:6px;
                    color:white;font-size:13px;font-family:'Noto Sans',sans-serif;
                }
                .cctv-popover-dot {
                    width:6px;height:6px;border-radius:50%;background:#ff4444;
                }
                .cctv-popover-close {
                    width:22px;height:22px;
                    background:rgba(255,255,255,0.1);
                    color:#aaa;border:none;border-radius:50%;
                    cursor:pointer;font-size:14px;line-height:22px;text-align:center;padding:0;
                    transition:background 0.2s;
                }
                .cctv-popover-close:hover {
                    background:rgba(255,68,68,0.3);color:white;
                }
                .cctv-popover-body {
                    width:320px;height:200px;
                    background:#000;
                    display:flex;align-items:center;justify-content:center;
                    overflow:hidden;
                }
                .cctv-popover-body video {
                    width:100%;height:100%;
                    object-fit:cover;
                }
            </style>
            <div class="cctv-wrapper">
                <div class="cctv-icon-row">
                    <div class="cctv-pulse-ring"></div>
                    <div class="cctv-scan-line"></div>
                    <div class="cctv-icon">
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="14" r="9" fill="white"/>
                            <circle cx="12" cy="14" r="6" fill="#003d80"/>
                            <circle cx="12" cy="14" r="4" fill="#0078ff"/>
                            <circle cx="12" cy="14" r="2" fill="white" opacity="0.8"/>
                            <rect x="6" y="4" width="12" height="4" rx="1.5" fill="white"/>
                            <rect x="8" y="2" width="8" height="2" rx="1" fill="white" opacity="0.6"/>
                        </svg>
                    </div>
                    <div class="cctv-tooltip">点击查看</div>
                </div>
                <div class="cctv-popover">
                    <div class="cctv-popover-header">
                        <div class="cctv-popover-title">
                            <span class="cctv-popover-dot"></span>
                            CCTV-1 实时画面
                        </div>
                        <button class="cctv-popover-close">×</button>
                    </div>
                    <div class="cctv-popover-body">
                        <video src="9146002-hd_1080_1920_30fps.mp4" muted autoplay loop playsinline></video>
                    </div>
                </div>
            </div>
        `;
        this.m_div.style.cssText = `
            position: fixed;
            z-index: 1000;
            pointer-events: none;
            display: none;
            text-align: center;
            filter: drop-shadow(0 8px 16px rgba(0,0,0,0.4));
            transition: opacity 0.15s;
        `;

        const icon = this.m_div.querySelector(".cctv-icon") as HTMLDivElement;
        const ring = this.m_div.querySelector(".cctv-pulse-ring") as HTMLDivElement;
        const scan = this.m_div.querySelector(".cctv-scan-line") as HTMLDivElement;
        const closeBtn = this.m_div.querySelector(".cctv-popover-close") as HTMLButtonElement;
        this.m_popover = this.m_div.querySelector(".cctv-popover") as HTMLDivElement;
        this.m_video = this.m_div.querySelector("video") as HTMLVideoElement;

        icon.addEventListener("mouseenter", () => {
            ring.classList.add("active");
            scan.classList.add("active");
        });
        icon.addEventListener("mouseleave", () => {
            ring.classList.remove("active");
            scan.classList.remove("active");
        });
        icon.addEventListener("click", e => {
            e.stopPropagation();
            this.togglePopover();
        });
        closeBtn.addEventListener("click", e => {
            e.stopPropagation();
            this.closePopover();
        });

        document.body.appendChild(this.m_div);

        document.addEventListener("click", e => {
            if (this.m_popoverVisible && this.m_div && !this.m_div.contains(e.target as Node)) {
                this.closePopover();
            }
        });
    }

    async init(
        dataSource: RailwayDataSource,
        modelUrl: string,
        position: THREE.Vector3,
        euler: THREE.Euler
    ): Promise<void> {
        try {
            const loader = new GLTFLoader();
            const gltf = await loader.loadAsync(modelUrl);
            const model = gltf.scene;

            model.traverse(child => {
                if ((child as THREE.Mesh).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = false;
                }
            });

            const group = new THREE.Group();
            group.position.copy(position);
            group.quaternion.setFromEuler(euler);
            group.add(model);

            dataSource.addObject("cctv", group);

            const normal = dataSource.computeSurfaceNormal(position);
            this.m_worldPos.copy(position).add(normal.clone().multiplyScalar(0.3));

            this.m_visible = true;
            this.m_div.style.display = "block";
        } catch (e) {
            console.error("CCTV init failed:", e);
        }
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

    private togglePopover(): void {
        if (this.m_popoverVisible) {
            this.closePopover();
        } else {
            this.openPopover();
        }
    }

    private openPopover(): void {
        this.m_popoverVisible = true;
        this.m_popover.style.display = "block";
        this.m_video.play().catch(() => {});
    }

    private closePopover(): void {
        this.m_popoverVisible = false;
        this.m_popover.style.display = "none";
        this.m_video.pause();
    }

    dispose(): void {
        this.m_div.remove();
    }
}
