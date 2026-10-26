/* Copyright (C) 2025 flywave.gl contributors */

/**
 * React UI components for the map example, written with `createElement`
 * calls because the entry must stay `index.ts` (the examples webpack glob
 * only collects `src/<example>/index.ts`, so an `index.tsx` entry would
 * never be picked up). With JSX these functions map one-to-one to `.tsx`
 * markup: `createElement("button", ...)` is `<button ...>`.
 */

import { type GeoCoordinates, type MapView } from "@flywave/flywave.gl";
import { createElement, type CSSProperties } from "react";

/** A fly-to destination advertised by the toolbar. */
export interface FlyToTarget {
    label: string;
    target: GeoCoordinates;
    zoomLevel: number;
    tilt?: number;
    heading?: number;
}

/** Shared button look. */
const BUTTON_STYLE: CSSProperties = {
    padding: "6px 10px",
    border: "1px solid #4a5568",
    borderRadius: "6px",
    background: "#2d3748",
    color: "#e2e8f0",
    font: "12px sans-serif",
    cursor: "pointer"
};

/**
 * One toolbar button. Stateless: the MapView arrives via props from
 * `useMap()` — in the real react flow the map instance is never a global.
 */
export function FlyToButton(props: {
    label: string;
    mapView: MapView | null;
    target: FlyToTarget;
}): object {
    return createElement(
        "button",
        {
            className: "fly-to-button",
            style: BUTTON_STYLE,
            onClick: () => {
                const mapView = props.mapView;
                if (mapView === null) {
                    return;
                }
                // MapView.flyTo: one-shot camera keytrack animation.
                // FlyToOptions: { target, zoomLevel, tilt, heading, distance,
                // duration (seconds, default 5), curve, altitude }.
                void mapView.flyTo({
                    target: props.target.target,
                    zoomLevel: props.target.zoomLevel,
                    tilt: props.target.tilt,
                    heading: props.target.heading,
                    duration: 3
                });
            }
        },
        props.label
    );
}

/** The control panel: title, fly-to buttons and a live status line. */
export function Toolbar(props: {
    mapView: MapView | null;
    targets: FlyToTarget[];
    status: string;
}): object {
    const panelStyle: CSSProperties = {
        position: "absolute",
        left: "12px",
        bottom: "12px",
        padding: "12px 14px",
        borderRadius: "8px",
        background: "rgba(24, 26, 32, 0.85)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        color: "#e2e8f0",
        textAlign: "left",
        zIndex: 100
    };
    return createElement(
        "div",
        { className: "map-toolbar", style: panelStyle },
        createElement("b", null, "React integration toolbar"),
        createElement(
            "div",
            { style: { display: "flex", gap: "6px", flexWrap: "wrap" } as CSSProperties },
            props.targets.map(target =>
                // Function component resolved through the React element tree.
                createElement(FlyToButton, {
                    key: target.label,
                    label: target.label,
                    mapView: props.mapView,
                    target
                })
            )
        ),
        createElement("div", { style: { opacity: 0.75 } as CSSProperties }, props.status)
    );
}
