import type { TileEvent } from "./types";

export class EventLog {
    private container: HTMLElement;
    private log: HTMLDivElement;
    private maxLines = 200;

    constructor(container: HTMLElement) {
        this.container = container;
        this.container.style.cssText =
            "overflow-y:auto;background:#0d0d1a;font:11px/1.4 monospace;padding:4px;";

        const header = document.createElement("div");
        header.textContent = "Event Log";
        header.style.cssText =
            "color:#888;border-bottom:1px solid #333;margin-bottom:4px;padding-bottom:2px;";
        this.container.appendChild(header);

        this.log = document.createElement("div");
        this.log.style.cssText = "white-space:pre;";
        this.container.appendChild(this.log);
    }

    addEvents(events: TileEvent[]) {
        if (events.length === 0) return;

        for (const ev of events) {
            const color =
                ev.type === "evict" ? "#ff6666" : ev.type === "create" ? "#ffdd44" : "#66ff66";
            const prefix =
                ev.type === "evict" ? "EVICT" : ev.type === "create" ? "CREATE" : "REUSE";
            const bytes = ev.bytes > 0 ? ` ${(ev.bytes / 1048576).toFixed(2)}MB` : "";
            const line = document.createElement("div");
            line.textContent = `[${ev.frame}] ${prefix} ${ev.tileKey.level}/${ev.tileKey.row}/${ev.tileKey.column}${bytes}`;
            line.style.color = color;
            this.log.insertBefore(line, this.log.firstChild);
        }

        while (this.log.children.length > this.maxLines) {
            this.log.removeChild(this.log.lastChild!);
        }
    }

    clear() {
        this.log.innerHTML = "";
    }
}
