/* Copyright (C) 2025 flywave.gl contributors */

import { GeoCoordinates, type MapView, MapViewEventNames } from "@flywave/flywave.gl";

/** Default CSS class of the info window element. */
const DEFAULT_CLASS_NAME = "fw-info-window";

/** Default screen space offset applied to the projected anchor position, in CSS pixels. */
const DEFAULT_PIXEL_OFFSET: IOffset = { x: 0, y: -12 };

/** Two dimensional pixel offset. */
interface IOffset {
    /** Horizontal offset in CSS pixels. */
    x: number;
    /** Vertical offset in CSS pixels. */
    y: number;
}

/**
 * Options for the {@link InfoWindow} component.
 */
export interface InfoWindowOptions {
    /**
     * Element the info window is appended to. Should be `document.body` (the default) or an
     * element that covers the whole viewport, because positioning uses fixed viewport (client)
     * coordinates.
     */
    container?: HTMLElement;
    /**
     * CSS class of the window element. A matching `<style>` block with the default look (dark
     * background, white text, rounded corners, bottom arrow, fade transition) is injected into
     * the document head once per class name. Default `"fw-info-window"`.
     */
    className?: string;
    /**
     * Screen space offset applied to the projected anchor position, in CSS pixels. Default
     * `{ x: 0, y: -12 }`.
     */
    pixelOffset?: { x: number; y: number };
}

/**
 * Builds the stylesheet for the given class name and injects it into the document head exactly
 * once (subsequent calls with the same class name are no-ops).
 */
function ensureStyle(className: string): void {
    const styleId = `${className}-style`;
    if (document.getElementById(styleId)) {
        return;
    }
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
.${className} {
    position: fixed;
    left: 0;
    top: 0;
    max-width: 320px;
    padding: 8px 12px;
    background: rgba(24, 26, 32, 0.92);
    color: #ffffff;
    border-radius: 8px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 12px;
    line-height: 1.5;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
    z-index: 1000;
    opacity: 1;
    visibility: visible;
    transition: opacity 0.15s ease, visibility 0.15s ease;
    will-change: transform;
}
.${className}::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -6px;
    border-width: 6px 6px 0 6px;
    border-style: solid;
    border-color: rgba(24, 26, 32, 0.92) transparent transparent transparent;
}
.${className}-hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
}
`;
    document.head.appendChild(style);
}

/**
 * An HTML info window anchored to a geographic coordinate.
 *
 * The window is a plain DOM overlay: on every rendered frame the stored geo anchor is projected
 * to screen space with `mapView.getScreenPosition` (a public MapView API that internally handles
 * the relative-to-eye frame conversion) and the result is written to the element's CSS
 * transform. When the anchor cannot be projected (behind the camera) the window is hidden.
 *
 * The component does not touch the scene graph, so it requires no `mapView.update()` calls.
 */
export class InfoWindow {
    private readonly m_mapView: MapView;
    private readonly m_container: HTMLElement;
    private readonly m_className: string;
    private readonly m_pixelOffset: { x: number; y: number };
    private readonly m_element: HTMLDivElement;
    private m_anchor: GeoCoordinates | null = null;
    private m_visible = false;
    private m_disposed = false;

    /** Per-frame handler that repositions the window after each rendered frame. */
    private readonly m_onAfterRender = (): void => {
        this.updatePosition();
    };

    /**
     * Creates an info window bound to the given map view.
     *
     * @param mapView - The map view providing projection and frame events.
     * @param options - See {@link InfoWindowOptions}.
     */
    constructor(mapView: MapView, options: InfoWindowOptions = {}) {
        this.m_mapView = mapView;
        this.m_container = options.container ?? document.body;
        this.m_className = options.className ?? DEFAULT_CLASS_NAME;
        this.m_pixelOffset = options.pixelOffset ?? { ...DEFAULT_PIXEL_OFFSET };

        ensureStyle(this.m_className);

        this.m_element = document.createElement("div");
        this.m_element.className = `${this.m_className} ${this.m_className}-hidden`;
        this.m_container.appendChild(this.m_element);

        this.m_mapView.addEventListener(MapViewEventNames.AfterRender, this.m_onAfterRender);
    }

    /**
     * Shows the window anchored at the given geographic coordinate.
     *
     * The anchor is stored and re-projected on every rendered frame until {@link hide} or
     * {@link dispose} is called.
     *
     * @param anchor - The geographic coordinate to anchor the window to.
     * @param content - HTML string or DOM element shown inside the window.
     */
    show(anchor: GeoCoordinates, content: string | HTMLElement): void {
        if (this.m_disposed) {
            return;
        }
        this.m_anchor = anchor.clone();
        if (typeof content === "string") {
            this.m_element.innerHTML = content;
        } else {
            this.m_element.replaceChildren(content);
        }
        this.m_visible = true;
        this.setHidden(false);
        this.updatePosition();
    }

    /** Hides the window. The anchor is kept, so a later {@link show} can reuse it. */
    hide(): void {
        this.m_visible = false;
        this.setHidden(true);
    }

    /** Whether the window is currently shown. */
    get visible(): boolean {
        return this.m_visible;
    }

    /** Removes the event listener and the DOM element. The instance must not be used afterwards. */
    dispose(): void {
        if (this.m_disposed) {
            return;
        }
        this.m_disposed = true;
        this.m_mapView.removeEventListener(MapViewEventNames.AfterRender, this.m_onAfterRender);
        this.m_element.remove();
        this.m_anchor = null;
        this.m_visible = false;
    }

    /** Toggles the hidden state CSS class used for the fade transition. */
    private setHidden(hidden: boolean): void {
        this.m_element.classList.toggle(`${this.m_className}-hidden`, hidden);
    }

    /**
     * Projects the stored anchor to screen space and repositions the window. Hides the window
     * when the anchor cannot be projected (e.g. it is behind the camera).
     */
    private updatePosition(): void {
        if (this.m_disposed || !this.m_visible || this.m_anchor === null) {
            return;
        }
        // Public MapView API: projects a geo coordinate (handling the RTE frame conversion
        // internally) to CSS/client coordinates, or returns undefined when the point is not
        // visible in the current view.
        const screenPos = this.m_mapView.getScreenPosition(this.m_anchor);
        if (
            screenPos === undefined ||
            !Number.isFinite(screenPos.x) ||
            !Number.isFinite(screenPos.y)
        ) {
            this.setHidden(true);
            return;
        }
        // Anchor the bottom center (the arrow tip) of the window at the projected point.
        const x = screenPos.x + this.m_pixelOffset.x;
        const y = screenPos.y + this.m_pixelOffset.y;
        this.m_element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
}
