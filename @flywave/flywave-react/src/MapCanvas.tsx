/* Copyright (C) 2025 flywave.gl contributors */

import * as React from "react";
import { useEffect, useRef } from "react";
import { LoggerManager } from "@flywave/flywave.gl";

import { MapCanvasProps } from "./types";
import { useMapContext } from "./MapProvider";

const logger = LoggerManager.instance.create("MapCanvas");

/**
 * React component that renders the map canvas.
 *
 * This component is responsible for rendering the canvas element and connecting it
 * to the MapView instance provided by MapProvider.
 *
 * @example
 * ```tsx
 * <MapProvider
 *   theme="resources/tilezen_base.json"
 *   decoderUrl="./decoder.bundle.js"
 * >
 *   <MapCanvas style={{ width: '100%', height: '400px' }} />
 * </MapProvider>
 * ```
 */
export function MapCanvas({
    style = { width: "100%", height: "100%" },
    className,
    onResize
}: MapCanvasProps): React.JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const {
        mapView,
        isLoading,
        error,
        canvasRef: providerCanvasRef,
        initializeMap,
        disposeMap
    } = useMapContext();

    // Update the provider's canvasRef
    useEffect(() => {
        if (canvasRef.current) {
            if (providerCanvasRef) {
                providerCanvasRef.current = canvasRef.current;
            }
        }
    }, [providerCanvasRef]);

    // Initialize map when canvas is available
    useEffect(() => {
        const initMap = async () => {
            if (canvasRef.current && !mapView && initializeMap) {
                try {
                    await initializeMap(canvasRef.current);
                } catch (err) {
                    logger.error("Failed to initialize map:", err);
                }
            }
        };

        initMap();

        return () => {
            if (disposeMap) {
                disposeMap();
            }
        };
    }, [mapView, initializeMap, disposeMap]);

    /**
     * Handle resize events
     */
    useEffect(() => {
        const handleResize = () => {
            if (mapView && canvasRef.current?.parentElement) {
                const { clientWidth, clientHeight } = canvasRef.current.parentElement;
                mapView.resize(clientWidth, clientHeight);
                onResize?.(clientWidth, clientHeight);
            }
        };

        // Set up resize observer
        let resizeObserver: ResizeObserver | null = null;
        if (canvasRef.current?.parentElement) {
            resizeObserver = new ResizeObserver(() => handleResize());
            resizeObserver.observe(canvasRef.current.parentElement);
        }

        // Handle initial resize
        handleResize();

        return () => {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
        };
    }, [mapView, onResize]);

    /**
     * Handle window resize
     */
    useEffect(() => {
        const handleWindowResize = () => {
            if (mapView && containerRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                mapView.resize(clientWidth, clientHeight);
                onResize?.(clientWidth, clientHeight);
            }
        };

        window.addEventListener("resize", handleWindowResize);
        return () => window.removeEventListener("resize", handleWindowResize);
    }, [mapView, onResize]);

    return (
        <div
            ref={containerRef}
            style={{
                position: "relative",
                overflow: "hidden",
                ...style
            }}
            className={className}
        >
            <canvas
                ref={canvasRef}
                style={{
                    display: "block",
                    width: "100%",
                    height: "100%"
                }}
            />

            {/* Loading indicator */}
            {isLoading && (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(255, 255, 255, 0.8)",
                        zIndex: 1000
                    }}
                >
                    <div>正在加载地图...</div>
                </div>
            )}

            {/* Error indicator */}
            {error && (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(255, 0, 0, 0.1)",
                        color: "red",
                        padding: "20px",
                        textAlign: "center",
                        zIndex: 1000
                    }}
                >
                    <div>
                        <div style={{ fontWeight: "bold", marginBottom: "10px" }}>地图加载失败</div>
                        <div style={{ fontSize: "0.9em" }}>{error.message}</div>
                    </div>
                </div>
            )}
        </div>
    );
}
