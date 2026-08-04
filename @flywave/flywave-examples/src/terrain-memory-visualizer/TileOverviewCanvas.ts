import type { TileSnapshot, TileEvent, CameraInfo, SnapshotResult } from "./types";

interface EvictAnimation {
    geoBox: {
        southWest: { latitude: number; longitude: number };
        northEast: { latitude: number; longitude: number };
    };
    alpha: number;
}

interface CreateAnimation {
    mortonId: string;
    frames: number;
}

export class TileOverviewCanvas {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private evictAnimations: EvictAnimation[] = [];
    private createAnimations: Map<string, number> = new Map();
    private viewCenter = { lat: 0, lng: 0 };
    private viewRange = 0.5;
    private followCamera = true;
    private hoverTile: string | null = null;
    private mousePos = { x: 0, y: 0 };
    private lastSnapshots = new Map<string, TileSnapshot>();

    constructor(container: HTMLElement) {
        this.canvas = document.createElement("canvas");
        this.canvas.style.cssText =
            "width:100%;height:100%;display:block;cursor:crosshair;background:#1a1a2e;";
        container.appendChild(this.canvas);
        const ctx = this.canvas.getContext("2d");
        if (!ctx) throw new Error("Cannot get 2D context");
        this.ctx = ctx;

        this.setupEvents();
        this.resize();
        window.addEventListener("resize", () => this.resize());
    }

    private resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    private setupEvents() {
        this.canvas.addEventListener("mousemove", e => {
            const rect = this.canvas.getBoundingClientRect();
            this.mousePos.x = e.clientX - rect.left;
            this.mousePos.y = e.clientY - rect.top;
        });
        this.canvas.addEventListener("wheel", e => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 1.2 : 0.83;
            this.viewRange = Math.max(0.001, Math.min(180, this.viewRange * factor));
        });
        this.canvas.addEventListener("click", () => {
            this.followCamera = !this.followCamera;
        });
    }

    private project(lng: number, lat: number): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const scale = Math.min(w, h) / this.viewRange;
        return {
            x: w / 2 + (lng - this.viewCenter.lng) * scale,
            y: h / 2 - (lat - this.viewCenter.lat) * scale
        };
    }

    update(result: SnapshotResult) {
        if (this.followCamera) {
            this.viewCenter = { lat: result.camera.latitude, lng: result.camera.longitude };
        }

        this.lastSnapshots = result.tiles;

        for (const ev of result.events) {
            if (ev.type === "evict") {
                this.evictAnimations.push({ geoBox: ev.geoBox, alpha: 1.0 });
            } else if (ev.type === "create") {
                const id = `${ev.tileKey.level}/${ev.tileKey.row}/${ev.tileKey.column}`;
                this.createAnimations.set(id, 3);
            }
        }

        this.evictAnimations = this.evictAnimations.filter(a => {
            a.alpha -= 0.012;
            return a.alpha > 0;
        });

        for (const [id, frames] of this.createAnimations) {
            if (frames <= 1) {
                this.createAnimations.delete(id);
            } else {
                this.createAnimations.set(id, frames - 1);
            }
        }

        this.draw(result);
    }

    private draw(result: SnapshotResult) {
        const ctx = this.ctx;
        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, w, h);

        this.drawGrid(w, h);
        this.drawTiles();
        this.drawEvictions();
        this.drawCamera(result.camera);
        this.drawHover();
        this.drawStats(result.stats);
    }

    private drawGrid(w: number, h: number) {
        const ctx = this.ctx;
        ctx.strokeStyle = "#2a2a4e";
        ctx.lineWidth = 0.5;

        for (
            let lng = -180;
            lng <= 180;
            lng += this.viewRange > 5 ? 10 : this.viewRange > 1 ? 1 : 0.1
        ) {
            const p1 = this.project(lng, this.viewCenter.lat - this.viewRange);
            const p2 = this.project(lng, this.viewCenter.lat + this.viewRange);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
        for (
            let lat = -90;
            lat <= 90;
            lat += this.viewRange > 5 ? 10 : this.viewRange > 1 ? 1 : 0.1
        ) {
            const p1 = this.project(this.viewCenter.lng - this.viewRange, lat);
            const p2 = this.project(this.viewCenter.lng + this.viewRange, lat);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    }

    private drawTiles() {
        const ctx = this.ctx;

        for (const [mortonId, tile] of this.lastSnapshots) {
            const sw = this.project(
                tile.geoBox.southWest.longitude,
                tile.geoBox.southWest.latitude
            );
            const ne = this.project(
                tile.geoBox.northEast.longitude,
                tile.geoBox.northEast.latitude
            );
            const x = sw.x;
            const y = ne.y;
            const width = ne.x - sw.x;
            const height = sw.y - ne.y;

            if (x + width < 0 || x > this.canvas.width || y + height < 0 || y > this.canvas.height)
                continue;

            let fill: string;
            let stroke = "rgba(255,255,255,0.08)";
            let strokeWidth = 0.5;

            if (this.createAnimations.has(mortonId)) {
                fill = "rgba(255, 230, 0, 1.0)";
                stroke = "rgba(255, 200, 0, 1)";
                strokeWidth = 1.5;
            } else if (tile.isVisible && tile.hasMesh) {
                fill = "rgba(0, 220, 60, 0.9)";
                stroke = "rgba(150, 255, 150, 0.8)";
                strokeWidth = 1;
            } else if (tile.hasMesh) {
                fill = "rgba(40, 90, 140, 0.7)";
                stroke = "rgba(80, 140, 200, 0.5)";
            } else if (tile.isVisible) {
                fill = "rgba(255, 165, 0, 0.7)";
                stroke = "rgba(255, 200, 100, 0.6)";
            } else {
                fill = "rgba(100, 100, 160, 0.5)";
            }

            ctx.fillStyle = fill;
            ctx.fillRect(x, y, width, height);

            ctx.strokeStyle = stroke;
            ctx.lineWidth = strokeWidth;
            ctx.strokeRect(x, y, width, height);
        }
    }

    private drawEvictions() {
        const ctx = this.ctx;
        for (const anim of this.evictAnimations) {
            const sw = this.project(
                anim.geoBox.southWest.longitude,
                anim.geoBox.southWest.latitude
            );
            const ne = this.project(
                anim.geoBox.northEast.longitude,
                anim.geoBox.northEast.latitude
            );
            ctx.fillStyle = `rgba(255, 50, 50, ${anim.alpha})`;
            ctx.fillRect(sw.x, ne.y, ne.x - sw.x, sw.y - ne.y);
            ctx.strokeStyle = `rgba(255, 100, 100, ${anim.alpha})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(sw.x, ne.y, ne.x - sw.x, sw.y - ne.y);
        }
    }

    private drawCamera(cam: CameraInfo) {
        const ctx = this.ctx;
        const pos = this.project(cam.longitude, cam.latitude);

        const headingRad = (cam.heading * Math.PI) / 180;
        const fovHalf = (((90 - cam.tilt) * Math.PI) / 180) * 0.5;
        const range = this.viewRange * 0.15;

        const leftAngle = headingRad - fovHalf - Math.PI / 2;
        const rightAngle = headingRad + fovHalf - Math.PI / 2;

        const leftX = pos.x + Math.cos(leftAngle) * range * 100;
        const leftY = pos.y - Math.sin(leftAngle) * range * 100;
        const rightX = pos.x + Math.cos(rightAngle) * range * 100;
        const rightY = pos.y - Math.sin(rightAngle) * range * 100;

        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(leftX, leftY);
        ctx.lineTo(rightX, rightY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "#ff4444";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        const dirLen = 20;
        ctx.lineTo(
            pos.x + Math.cos(headingRad - Math.PI / 2) * dirLen,
            pos.y - Math.sin(headingRad - Math.PI / 2) * dirLen
        );
        ctx.stroke();
    }

    private drawHover() {
        const ctx = this.ctx;
        this.hoverTile = null;

        for (const [mortonId, tile] of this.lastSnapshots) {
            const sw = this.project(
                tile.geoBox.southWest.longitude,
                tile.geoBox.southWest.latitude
            );
            const ne = this.project(
                tile.geoBox.northEast.longitude,
                tile.geoBox.northEast.latitude
            );
            if (
                this.mousePos.x >= sw.x &&
                this.mousePos.x <= ne.x &&
                this.mousePos.y >= ne.y &&
                this.mousePos.y <= sw.y
            ) {
                this.hoverTile = mortonId;
                ctx.strokeStyle = "white";
                ctx.lineWidth = 2;
                ctx.strokeRect(sw.x, ne.y, ne.x - sw.x, sw.y - ne.y);

                const txt = `${tile.tileKey.level}/${tile.tileKey.row}/${
                    tile.tileKey.column
                }  mesh=${tile.hasMesh} ${(tile.bytes / 1048576).toFixed(2)}MB ${
                    tile.isVisible ? "VISIBLE" : "hidden"
                }`;
                ctx.font = "11px monospace";
                const tw = ctx.measureText(txt).width;
                let tx = this.mousePos.x + 10;
                let ty = this.mousePos.y + 15;
                if (tx + tw > this.canvas.width) tx = this.mousePos.x - tw - 10;
                ctx.fillStyle = "rgba(0,0,0,0.85)";
                ctx.fillRect(tx - 4, ty - 12, tw + 8, 18);
                ctx.fillStyle = "#0f0";
                ctx.fillText(txt, tx, ty);
                break;
            }
        }
    }

    private drawStats(stats: SnapshotResult["stats"]) {
        const ctx = this.ctx;
        const lines = [
            `Cached: ${stats.totalCached}  Mesh: ${stats.withMesh}  Visible: ${stats.visible}  Evicted: ${stats.evictedThisFrame}  Created: ${stats.createdThisFrame}`,
            "",
            "🟢 bright green = visible + mesh   🔵 blue = cached mesh, not visible",
            "🟠 orange = visible, no mesh      ⬜ dark = cached, no mesh",
            "🟡 yellow flash = new            🔴 red fade = evicted",
            this.followCamera
                ? "[following camera — click to free roam]"
                : "[free roam — click to follow camera]"
        ];
        ctx.font = "11px monospace";
        let y = 20;
        for (const line of lines) {
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            const tw = ctx.measureText(line).width;
            ctx.fillRect(8, y - 10, tw + 8, 14);
            ctx.fillStyle = "#0f0";
            ctx.fillText(line, 12, y);
            y += 16;
        }
    }
}
