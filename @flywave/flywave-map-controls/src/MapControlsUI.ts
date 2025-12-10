/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { mercatorProjection, ProjectionType, sphereProjection } from "@flywave/flywave-geoutils";
import { MapViewEventNames } from "@flywave/flywave-mapview";

import { type MapControls } from "./MapControls";

/**
 * Screenshot configuration options
 */
export interface ScreenshotConfig {
    /** Screenshot width in pixels */
    width?: number;
    /** Screenshot height in pixels */
    height?: number;
    /** Image quality (0-1) */
    quality?: number;
    /** File name pattern, can include {timestamp}, {width}, {height} placeholders */
    filename?: string;
}

/**
 * Option for MapControlsUI.
 */
interface MapControlsUIOptions {
    /**
     * If specified, turns on the zoom level display or zoom level input.
     */
    zoomLevel?: "show" | "input";

    /**
     * If specified, allows to switch between mercator and sphere projections at runtime.
     */
    projectionSwitch?: boolean;

    /**
     * Turns off default CSS styling for controls.
     */
    disableDefaultStyle?: boolean;

    /**
     * If specified, shows the current map geoCenter coordinates.
     */
    geoCenterDisplay?: boolean;

    /**
     * If specified, adds a screenshot button to capture map thumbnails.
     */
    screenshotButton?: boolean | ScreenshotConfig;
}

/**
 * Base class to handle UI overlay elements.
 */
export class MapControlsUI {
    /**
     * The DOM node containing the UI.
     */
    readonly domElement = document.createElement("div");

    /**
     * Displays zoom level if [[MapControlsUIOptions.zoomLevel]] is defined.
     */
    private readonly m_zoomLevelElement: HTMLDivElement | HTMLInputElement | null = null;

    /**
     * Displays zoom level if [[MapControlsUIOptions.projectionSwitch]] is defined.
     */
    private readonly m_projectionSwitchElement: HTMLButtonElement | null = null;

    /**
     * Displays geoCenter coordinates if [[MapControlsUIOptions.geoCenterDisplay]] is enabled.
     */
    private readonly m_geoCenterElement: HTMLDivElement | null = null;

    /**
     * Screenshot button element if [[MapControlsUIOptions.screenshotButton]] is enabled.
     */
    private readonly m_screenshotButton: HTMLButtonElement | null = null;

    /**
     * Screenshot configuration
     */
    private readonly m_screenshotConfig: ScreenshotConfig;

    /**
     * Removes focus from input element.
     */
    private readonly m_onWindowClick: (event: MouseEvent) => void = (event: MouseEvent) => {
        const input = this.m_zoomLevelElement as HTMLInputElement;
        if (
            !event ||
            !event.target ||
            !(event.target as any).contains ||
            event.target === input ||
            (event.target as HTMLElement).contains(input)
        ) {
            return;
        }
        input.blur();
    };

    /**
     * Updates the display of the zoom level.
     */
    private readonly m_onMapViewRenderEvent: () => void = () => {
        if (this.m_zoomLevelElement === null) {
            return;
        }

        const zoom = this.controls.mapView.zoomLevel.toFixed(1);

        if (this.m_zoomLevelElement.tagName === "INPUT") {
            (this.m_zoomLevelElement as HTMLInputElement).value = zoom;
        } else {
            (this.m_zoomLevelElement as HTMLDivElement).innerHTML = zoom;
        }
    };

    /**
     * Updates the display of the geoCenter coordinates.
     */
    private readonly m_onGeoCenterUpdate: () => void = () => {
        if (this.m_geoCenterElement === null) {
            return;
        }

        const geoCenter = this.controls.mapView.geoCenter;
        const lat = geoCenter.latitude.toFixed(4);
        const lng = geoCenter.longitude.toFixed(4);

        let altitude = '';
        if (geoCenter.altitude !== undefined) {
            const altValue = geoCenter.altitude;
            // Format altitude for better readability
            if (Math.abs(altValue) >= 1000) {
                // For altitudes >= 1000m, show in km with 1 decimal place
                altitude = ` ${(altValue / 1000).toFixed(1)}km`;
            } else if (altValue === 0) {
                // For 0 altitude, just show 0m
                altitude = ' 0m';
            } else {
                // For altitudes < 1000m, show in meters with 0 decimal places
                altitude = ` ${Math.round(altValue)}m`;
            }
        }

        // Get tilt and heading values from the controls using available methods
        const tilt = this.controls.mapView.tilt.toFixed(1);
        const heading = this.controls.mapView.heading.toFixed(1);

        this.m_geoCenterElement.innerHTML = `${lat}°, ${lng}°${altitude}<br>Tilt: ${tilt}°, Hdg: ${heading}°`;
    };

    /**
     * Constructor of the UI.
     *
     * @param controls - Controls referencing a [[MapView]].
     */
    constructor(readonly controls: MapControls, options: MapControlsUIOptions = {
        zoomLevel: "input",
        screenshotButton: true, // 默认启用截图按钮
    }) {
        // 初始化截图配置
        this.m_screenshotConfig = this.normalizeScreenshotConfig(options.screenshotButton);

        // State to track if controls are expanded
        let isExpanded = false;

        // Create main container
        const container = document.createElement("div");
        container.className = "flywave-gl_controls";
        this.domElement.appendChild(container);

        // Create compass button (circular)
        const compassButton = document.createElement("button");
        compassButton.id = "flywave-gl_controls-button_compass";
        compassButton.title = "Reset North";
        compassButton.classList.add("flywave-gl_controls-button", "compass");
        const compass = document.createElement("span");
        compass.id = "flywave-gl_controls_compass";
        compassButton.appendChild(compass);
        container.appendChild(compassButton);

        // Create toggle button
        const toggleButton = document.createElement("button");
        toggleButton.innerHTML = "⋯"; // Vertical ellipsis
        toggleButton.title = "Toggle controls";
        toggleButton.classList.add("flywave-gl_controls-toggle");
        container.appendChild(toggleButton);

        // Create expanded controls container (initially hidden)
        const expandedContainer = document.createElement("div");
        expandedContainer.className = "flywave-gl_controls-expanded";
        expandedContainer.style.display = "none";
        container.appendChild(expandedContainer);

        // Create zoom in button
        const zoomInButton = document.createElement("button");
        zoomInButton.innerText = "+";
        zoomInButton.title = "Zoom in";
        zoomInButton.classList.add("flywave-gl_controls-button", "expanded");
        expandedContainer.appendChild(zoomInButton);

        // Optional zoom level displaying
        if (options.zoomLevel === "show") {
            this.m_zoomLevelElement = document.createElement("div");
            this.m_zoomLevelElement.classList.add("flywave-gl_controls_zoom-level");
            expandedContainer.appendChild(this.m_zoomLevelElement);
            controls.mapView.addEventListener(
                MapViewEventNames.Render,
                this.m_onMapViewRenderEvent
            );
        } else if (options.zoomLevel === "input") {
            const input = document.createElement("input");
            input.type = "number";
            input.step = "0.1";
            input.classList.add("flywave-gl_controls_zoom-level");
            controls.mapView.addEventListener(
                MapViewEventNames.Render,
                this.m_onMapViewRenderEvent
            );

            const updateZoom = (event: KeyboardEvent | FocusEvent) => {
                controls.mapView.lookAt({zoomLevel: parseFloat(input.value)});
                event.preventDefault();
            };

            input.addEventListener("blur", updateZoom);
            input.addEventListener("keypress", event => {
                if (event.key === "Enter") {
                    updateZoom(event);
                }
            });
            window.addEventListener("click", this.m_onWindowClick);
            this.m_zoomLevelElement = input;
            expandedContainer.appendChild(this.m_zoomLevelElement);
        }

        // Create zoom out button
        const zoomOutButton = document.createElement("button");
        zoomOutButton.innerText = "-";
        zoomOutButton.title = "Zoom out";
        zoomOutButton.classList.add("flywave-gl_controls-button", "expanded");
        expandedContainer.appendChild(zoomOutButton);

        // Create tilt button
        const tiltButton = document.createElement("button");
        tiltButton.innerText = "3D";
        tiltButton.id = "flywave-gl_controls_tilt-button-ui";
        tiltButton.title = "Toggle tilt";
        tiltButton.classList.add("flywave-gl_controls-button", "expanded");
        expandedContainer.appendChild(tiltButton);

        // Create screenshot button if enabled
        if (options.screenshotButton !== false) {
            const screenshotButton = document.createElement("button");
            screenshotButton.innerHTML = getScreenshotSVG();
            screenshotButton.id = "flywave-gl_controls_screenshot-button";
            screenshotButton.title = this.getScreenshotTooltip();
            screenshotButton.classList.add("flywave-gl_controls-button", "expanded");
            screenshotButton.addEventListener("click", async (event) => {
                await this.captureScreenshot();
            });
            expandedContainer.appendChild(screenshotButton);
            this.m_screenshotButton = screenshotButton;
        }

        // Create projection switch button if enabled
        if (options.projectionSwitch) {
            const switcher = document.createElement("button");
            switcher.id = "flywave-gl_controls_switch_projection";
            switcher.classList.add("flywave-gl_controls-button", "expanded");
            const getTitle: () => string = () => {
                return `Switch to ${this.controls.mapView.projection.type === ProjectionType.Spherical
                    ? "flat"
                    : "globe"
                    } projection`;
            };
            switcher.title = getTitle();
            const globeSVG = getGlobeSVG();
            const flatMapSVG = getFlatMapSVG();
            switcher.innerHTML =
                this.controls.mapView.projection.type === ProjectionType.Spherical
                    ? flatMapSVG
                    : globeSVG;
            switcher.addEventListener("click", () => {
                this.controls.mapView.projection =
                    this.controls.mapView.projection.type === ProjectionType.Spherical
                        ? mercatorProjection
                        : sphereProjection;
                switcher.title = getTitle();
                switcher.innerHTML =
                    this.controls.mapView.projection.type === ProjectionType.Spherical
                        ? flatMapSVG
                        : globeSVG;
            });
            expandedContainer.appendChild(switcher);
            this.m_projectionSwitchElement = switcher;
        }

        // Toggle controls visibility
        toggleButton.addEventListener("click", (event) => {
            event.stopPropagation(); // Prevent event bubbling
            isExpanded = !isExpanded;
            expandedContainer.style.display = isExpanded ? "flex" : "none";
            toggleButton.innerHTML = isExpanded ? "×" : "⋯"; // Change icon based on state
        });

        // Add event listeners for buttons
        zoomInButton.addEventListener("click", event => {
            const zoomLevel = controls.mapView.zoomLevel + 1;
            controls.mapView.lookAt({zoomLevel});
        });

        zoomOutButton.addEventListener("click", event => {
            const zoomLevel = controls.mapView.zoomLevel - 1;
            controls.mapView.lookAt({zoomLevel});
        });

        tiltButton.addEventListener("click", event => {
            controls.mapView.lookAt({tilt: controls.mapView.tilt === 0 ? 45 : 0});
        });

        compassButton.addEventListener("click", event => {
            controls.mapView.lookAt({heading: 0});
        });

        controls.mapView.addEventListener(MapViewEventNames.AfterRender, () => {
            compass.style.transform = `rotate(${controls.mapView.heading}deg)`;
        });

        this.domElement.className = "flywave-gl_controls";

        if (options.disableDefaultStyle !== true) {
            this.initStyle();
            this.domElement.style.cssText = `
                position: absolute;
                right: 20px;
                bottom: 20px;
            `;
        }

        // Create geoCenter display if enabled
        if (options.geoCenterDisplay !== false) {
            const geoCenterContainer = document.createElement("div");
            geoCenterContainer.className = "flywave-gl_geo-center-display";
            this.m_geoCenterElement = document.createElement("div");
            this.m_geoCenterElement.className = "flywave-gl_geo-center-text";
            geoCenterContainer.appendChild(this.m_geoCenterElement);

            // Add the geoCenter display to the map view's renderer dom element instead of controls container
            // to avoid layout conflicts
            controls.mapView.renderer.domElement.parentElement?.appendChild(geoCenterContainer);

            // Add event listener to update geoCenter display
            controls.mapView.addEventListener(
                MapViewEventNames.Render,
                this.m_onGeoCenterUpdate
            );
        }

        return this;
    }

    /**
     * Normalize screenshot configuration
     */
    private normalizeScreenshotConfig(config: boolean | ScreenshotConfig | undefined): ScreenshotConfig {
        if (config === false) {
            return { width: 0, height: 0 }; // Disabled
        }

        if (typeof config === 'boolean') {
            // Default configuration
            return {
                width: 512,
                height: 512,
                quality: 0.9,
                filename: 'flywave-screenshot-{timestamp}_{width}x{height}.png'
            };
        }

        // Custom configuration with defaults
        return {
            width: config?.width || 512,
            height: config?.height || 512,
            quality: config?.quality || 0.9,
            filename: config?.filename || 'flywave-screenshot-{timestamp}_{width}x{height}.png'
        };
    }

    /**
     * Get screenshot tooltip text
     */
    private getScreenshotTooltip(): string {
        return `Capture screenshot (${this.m_screenshotConfig.width}×${this.m_screenshotConfig.height})`;
    }

    /**
     * Update screenshot configuration
     */
    public updateScreenshotConfig(config: ScreenshotConfig): void {
        Object.assign(this.m_screenshotConfig, config);

        // Update tooltip if button exists
        if (this.m_screenshotButton) {
            this.m_screenshotButton.title = this.getScreenshotTooltip();
        }
    }

    /**
     * Get current screenshot configuration
     */
    public getScreenshotConfig(): ScreenshotConfig {
        return { ...this.m_screenshotConfig };
    }

    get projectionSwitchElement(): HTMLButtonElement | null {
        return this.m_projectionSwitchElement;
    }

    /**
     * Capture screenshot of the current map view
     */
    private async captureScreenshot(): Promise<void> {
        // Check if screenshot is enabled
        if (this.m_screenshotConfig.width === 0 || this.m_screenshotConfig.height === 0) {
            return;
        }

        const canvas = this.controls.mapView.canvas;
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;

        try {
            // 显示加载状态
            if (this.m_screenshotButton) {
                const originalHTML = this.m_screenshotButton.innerHTML;
                this.m_screenshotButton.innerHTML = getLoadingSVG();
                this.m_screenshotButton.disabled = true;

                // 使用配置的尺寸
                const targetWidth = this.m_screenshotConfig.width!;
                const targetHeight = this.m_screenshotConfig.height!;

                this.controls.mapView.resize(targetWidth, targetHeight);
                this.controls.mapView.renderSync();
                const dataURL = canvas.toDataURL('image/png', this.m_screenshotConfig.quality);
                this.downloadScreenshot(dataURL, targetWidth, targetHeight);

                // 恢复按钮状态
                this.m_screenshotButton.innerHTML = originalHTML;
                this.m_screenshotButton.disabled = false;
            }
        } catch (error) {
            console.error('截图失败:', error);
            // 恢复按钮状态
            if (this.m_screenshotButton) {
                this.m_screenshotButton.innerHTML = getScreenshotSVG();
                this.m_screenshotButton.disabled = false;
            }
        } finally {
            this.controls.mapView.resize(originalWidth, originalHeight);
            this.controls.mapView.renderSync();
        }
    }

    /**
     * Download screenshot as PNG file
     */
    private downloadScreenshot(dataURL: string, width: number, height: number): void {
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // 生成文件名，替换占位符
        let filename = this.m_screenshotConfig.filename!
            .replace(/{timestamp}/g, timestamp)
            .replace(/{width}/g, width.toString())
            .replace(/{height}/g, height.toString());

        // 确保文件扩展名
        if (!filename.toLowerCase().endsWith('.png')) {
            filename += '.png';
        }

        link.href = dataURL;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Destroy this [[MapControlsUI]] instance. Unregisters all event handlers used. This method
     * should be called when you stop using [[MapControlsUI]].
     */
    dispose() {
        if (this.m_zoomLevelElement !== null && this.m_zoomLevelElement.tagName === "INPUT") {
            window.removeEventListener("click", this.m_onWindowClick);
        }

        this.controls.mapView.removeEventListener(
            MapViewEventNames.Render,
            this.m_onMapViewRenderEvent
        );

        // Remove geoCenter update listener if it exists
        if (this.m_geoCenterElement !== null) {
            this.controls.mapView.removeEventListener(
                MapViewEventNames.Render,
                this.m_onGeoCenterUpdate
            );

            // Remove the geoCenter display element from the map view's parent container
            const geoCenterDisplay = document.querySelector('.flywave-gl_geo-center-display');
            if (geoCenterDisplay && geoCenterDisplay.parentNode) {
                geoCenterDisplay.parentNode.removeChild(geoCenterDisplay);
            }
        }

        this.domElement.remove();
    }

    private initStyle() {
        if (document.getElementById("here-flywave-controls.map-controls-ui-styles") !== null) {
            return;
        }
        const style = document.createElement("style");
        style.id = "here-flywave-controls.map-controls-ui-styles";
        style.appendChild(document.createTextNode(getTextStyle()));
        document.head.appendChild(style);
    }
}

function getTextStyle() {
    return `
        /* Main container for controls */
        .flywave-gl_controls {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
        }
        
        /* GeoCenter display styling - positioned relative to the parent container */
        .flywave-gl_geo-center-display {
            position: absolute;
            left: 20px;
            bottom: 20px;
            background: rgba(39, 45, 55, 0.5);
            border-radius: 6px;
            padding: 6px 8px;
            color: white;
            font-size: 9px;
            font-family: monospace;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            backdrop-filter: blur(4px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            min-width: 130px;
            text-align: center;
            transition: all 0.3s ease;
            z-index: 10;
            max-width: 220px;
            overflow: hidden;
        }
        
        .flywave-gl_geo-center-text {
            margin: 0;
            font-weight: 500;
            letter-spacing: 0.5px;
            color: #fff;
            line-height: 1.3;
        }
        
        .flywave-gl_geo-center-text {
            margin: 0;
            font-weight: 500;
            letter-spacing: 0.5px;
            color: #fff;
        }
        
        /* Hover effect for the geo center display */
        .flywave-gl_geo-center-display:hover {
            background: rgba(55, 65, 85, 0.95);
            transform: scale(1.02);
        }
        
        /* Circular compass button */
        .flywave-gl_controls-button.compass {
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(39, 45, 55, 0.85);
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            box-shadow: 0px 0px 5px 0 rgba(0, 0, 0, 0.3);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            margin-bottom: 6px;
        }
        
        .flywave-gl_controls-button.compass:hover {
            background-color: rgba(55, 65, 85, 0.95);
            transform: scale(1.05);
        }
        
        .flywave-gl_controls-button.compass:active {
            background-color: rgba(55, 175, 170, 0.95);
            transform: scale(0.95);
        }
        
        #flywave-gl_controls_compass {
            pointer-events: none;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        #flywave-gl_controls_compass::after {
            content: " ";
            position: absolute;
            left: 50%;
            margin-left: -3px;
            top: 50%;
            margin-top: -18px;
            border: solid 3px rgba(0,0,0,0);
            border-bottom: solid 15px #a34f2e;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        #flywave-gl_controls_compass::before {
            content: " ";
            position: absolute;
            left: 50%;
            margin-left: -3px;
            top: 50%;
            margin-top: 0px;
            border: solid 3px rgba(0,0,0,0);
            border-top: solid 15px #eee;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        /* Toggle button for expanding/collapsing controls */
        .flywave-gl_controls-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(39, 45, 55, 0.85);
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            box-shadow: 0px 0px 5px 0 rgba(0, 0, 0, 0.3);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            color: rgba(255, 255, 255, 0.9);
            font-size: 22px;
            font-weight: bold;
        }
        
        .flywave-gl_controls-toggle:hover {
            background-color: rgba(55, 65, 85, 0.95);
            transform: scale(1.05);
        }
        
        .flywave-gl_controls-toggle:active {
            background-color: rgba(55, 175, 170, 0.95);
            transform: scale(0.95);
        }
        
        /* Expanded controls container */
        .flywave-gl_controls-expanded {
            display: none;
            flex-direction: row-reverse;
            align-items: center;
            background-color: transparent;
            padding: 0;
            box-shadow: none;
            position: absolute;
            right: 50px;
            bottom: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        /* Control buttons in expanded view */
        .flywave-gl_controls-button.expanded {
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(39, 45, 55, 0.85);
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            margin: 0;
            margin-left: 6px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 22px;
            font-weight: bold;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0px 0px 5px 0 rgba(0, 0, 0, 0.3);
            opacity: 0;
            transform: translateX(10px);
        }
        
        .flywave-gl_controls-expanded:not(.collapsed) .flywave-gl_controls-button.expanded {
            opacity: 1;
            transform: translateX(0);
        }
        
        .flywave-gl_controls-button.expanded:last-child {
            margin-left: 0;
        }
        
        .flywave-gl_controls-button.expanded:hover {
            background-color: rgba(55, 65, 85, 0.95);
            transform: scale(1.05) translateX(0);
        }
        
        .flywave-gl_controls-button.expanded:active {
            background-color: rgba(55, 175, 170, 0.95);
            transform: scale(0.95) translateX(0);
        }
        
        #flywave-gl_controls_tilt-button-ui.expanded {
            font-size: 16px;
        }

        /* Screenshot button specific styles */
        #flywave-gl_controls_screenshot-button.expanded {
            font-size: 18px;
        }
        
        .flywave-gl_controls_screenshot_svg {
            width: 20px;
            height: 20px;
            stroke: #d4d5d7;
            fill: none;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .flywave-gl_controls-button:hover .flywave-gl_controls_screenshot_svg {
            stroke: #fff;
        }
        
        /* Loading spinner for screenshot */
        .flywave-gl_controls_loading_svg {
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Zoom level display */
        .flywave-gl_controls_zoom-level {
            display: block;
            background-color: rgba(255, 255, 255, 0.9);
            width: 40px;
            height: 40px;
            font-size: 12px;
            font-weight: bold;
            outline: none;
            border: none;
            color: #333;
            box-shadow: 0px 0px 5px 0 rgba(0, 0, 0, 0.3);
            padding: 2px 0 0;
            text-align: center;
            user-select: text;
            border-radius: 50%;
            margin: 0;
            margin-left: 6px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0;
            transform: translateX(10px);
        }
        
        .flywave-gl_controls-expanded:not(.collapsed) .flywave-gl_controls_zoom-level {
            opacity: 1;
            transform: translateX(0);
        }
        
        .flywave-gl_controls_zoom-level:last-child {
            margin-left: 0;
        }
        
        .flywave-gl_controls_zoom-level:focus {
            box-shadow: 0 0 0 2px rgba(55, 175, 170, 0.6);
        }
        
        input.flywave-gl_controls_zoom-level::-webkit-outer-spin-button,
        input.flywave-gl_controls_zoom-level::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        
        input.flywave-gl_controls_zoom-level[type=number] {
            -moz-appearance: textfield;
        }
        
        /* Projection switch button */
        #flywave-gl_controls_switch_projection {
            margin-left: 6px;
        }
        
        .flywave-gl_controls-switch_svg {
            width: 25px;
            height: 25px;
            stroke: #d4d5d7;
            fill: #d4d5d7;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .flywave-gl_controls-button:hover .flywave-gl_controls-switch_svg {
            stroke: #fff;
            fill: #fff;
        }
    `;
}

function getFlatMapSVG() {
    return `
    <svg class="flywave-gl_controls_switch_svg" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 6H20V18H4V6Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M4 10H20" stroke="currentColor" stroke-width="1.5"/>
        <path d="M4 14H20" stroke="currentColor" stroke-width="1.5"/>
        <path d="M10 6V18" stroke="currentColor" stroke-width="1.5"/>
        <path d="M14 6V18" stroke="currentColor" stroke-width="1.5"/>
    </svg>`;
}

function getGlobeSVG() {
    return `
    <svg class="flywave-gl_controls_switch_svg" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M4 12H20" stroke="currentColor" stroke-width="1.5"/>
        <path d="M12 4C14.5 4 16.5 6 16.5 9C16.5 12 14.5 14 12 14C9.5 14 7.5 12 7.5 9C7.5 6 9.5 4 12 4Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M9 16C10 15 11 14.5 12 14.5C13 14.5 14 15 15 16" stroke="currentColor" stroke-width="1.5"/>
    </svg>`;
}

function getScreenshotSVG() {
    return `
    <svg class="flywave-gl_controls_screenshot_svg" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 8L6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M16 8L18 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M8 16L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M16 16L18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
}

function getLoadingSVG() {
    return `
    <svg class="flywave-gl_controls_loading_svg" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="31.4 31.4"/>
    </svg>`;
}