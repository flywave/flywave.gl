/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection } from "@flywave/flywave-geoutils";
import { type MapAnchor } from "@flywave/flywave-mapview";
import * as THREE from "three/webgpu";

import { type Material } from "../decoder";

// Collapse pillar profile structure
export interface CollapseProfile {
    collapseID: string;
    crossSections: THREE.BufferGeometry[];
    polys: THREE.Vector3[][];
    material: number;
}

// Stratum profile structure
export interface StratumProfile {
    stratumID: string; // unique stratum identifier
    top: THREE.Vector3[]; // roof intersection points (ordered along the cut line)
    base: THREE.Vector3[]; // floor intersection points
    crossSections: THREE.BufferGeometry[]; // triangulated TIN mesh set
    polys: THREE.Vector3[][]; // original profile polygon vertex sequences
    material: number;
}

export interface SectionProfile {
    stratumProfiles: StratumProfile[];
    collapseProfiles: CollapseProfile[];
    line: THREE.Vector3[]; // [startPoint, endPoint]
}

// Project 3D points to 2D section plane
function projectPointsToSectionPlane(
    points: THREE.Vector3[],
    origin: THREE.Vector3,
    u: THREE.Vector3,
    w: THREE.Vector3
): Array<{ x: number; z: number }> {
    return points.map(point => {
        const dir = new THREE.Vector3().subVectors(point, origin);
        return {
            x: dir.dot(u),
            z: dir.dot(w)
        };
    });
}

// Calculate projection vectors for a section
function getSectionProjectionVectors(
    line: THREE.Vector3[],
    upDir: THREE.Vector3
): {
    origin: THREE.Vector3;
    u: THREE.Vector3;
    w: THREE.Vector3;
    sectionLength: number;
} {
    const origin = line[0].clone();
    const u = new THREE.Vector3().subVectors(line[1], line[0]).normalize();
    const w = upDir.clone().normalize();
    const sectionLength = line[0].distanceTo(line[1]);

    return { origin, u, w, sectionLength };
}

// Project an entire section profile to 2D
function projectSectionProfile(profile: SectionProfile, upDir: THREE.Vector3): SectionProfile {
    const { origin, u, w } = getSectionProjectionVectors(profile.line, upDir);

    return {
        ...profile,
        stratumProfiles: profile.stratumProfiles.map(stratum => ({
            ...stratum,
            top: projectPointsToSectionPlane(stratum.top, origin, u, w).map(
                p => new THREE.Vector3(p.x, 0, p.z) // Add y=0 to maintain Vector3 type
            ),
            base: projectPointsToSectionPlane(stratum.base, origin, u, w).map(
                p => new THREE.Vector3(p.x, 0, p.z)
            )
        })),
        collapseProfiles: profile.collapseProfiles.map(collapse => ({
            ...collapse,
            polys: collapse.polys.map(poly =>
                projectPointsToSectionPlane(poly, origin, u, w).map(
                    p => new THREE.Vector3(p.x, 0, p.z)
                )
            )
        }))
    };
}

// Calculate bounds for multiple profiles
function calculateMultiProfileBounds(profiles: SectionProfile[]): {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
} {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    profiles.forEach(profile => {
        // Stratum bounds
        profile.stratumProfiles.forEach(stratum => {
            stratum.top.concat(stratum.base).forEach(point => {
                minX = Math.min(minX, point.x);
                maxX = Math.max(maxX, point.x);
                minZ = Math.min(minZ, point.z);
                maxZ = Math.max(maxZ, point.z);
            });
        });

        // Collapse bounds
        profile.collapseProfiles.forEach(collapse => {
            collapse.polys.forEach(poly => {
                poly.forEach(point => {
                    minX = Math.min(minX, point.x);
                    maxX = Math.max(maxX, point.x);
                    minZ = Math.min(minZ, point.z);
                    maxZ = Math.max(maxZ, point.z);
                });
            });
        });
    });

    // Add margin
    const xMargin = (maxX - minX) * 0.1 || 10; // Handle case where all x are equal
    const zMargin = (maxZ - minZ) * 0.1 || 10;

    return {
        minX: minX - xMargin,
        maxX: maxX + xMargin,
        minZ: minZ - zMargin,
        maxZ: maxZ + zMargin
    };
}

function getColor(materialId: number, materials: Material[]) {
    if (materialId >= materials.length) {
        return undefined;
    }
    const color = materials[materialId].color;
    return new THREE.Color(color.r, color.g, color.b).getStyle();
}

// Calculate optimal interval for grid/axis
function calculateOptimalInterval(range: number): number {
    if (range === 0) return 10; // Default value if range is zero

    const magnitude = Math.pow(10, Math.floor(Math.log10(range)));
    const normalizedRange = range / magnitude;

    if (normalizedRange < 2) return 0.2 * magnitude;
    if (normalizedRange < 5) return 0.5 * magnitude;
    return magnitude;
}

export interface SVGStyleOptions {
    background?: {
        color?: string;
        opacity?: number;
    };
    grid?: {
        color?: string;
        width?: number;
        opacity?: number;
    };
    axis?: {
        color?: string;
        width?: number;
        labelColor?: string;
        labelSize?: number;
    };
    title?: {
        label?: string;
        subtitle?: string;
        color?: string;
        size?: number;
        subtitleSize?: number;
    };
    stratum?: {
        labelColor?: string;
        labelSize?: number;
        labelWeight?: string;
    };
    collapse?: {
        labelColor?: string;
        labelSize?: number;
        labelWeight?: string;
    };
    sectionLabel?: {
        color?: string;
        size?: number;
        weight?: string;
    };
    legend?: {
        show?: boolean; // whether to show the legend
        position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "custom"; // legend position
        customPosition?: { x: number; y: number }; // custom position
        backgroundColor?: string; // background color
        backgroundOpacity?: number; // background opacity
        borderColor?: string; // border color
        borderWidth?: number; // border width
        borderRadius?: number; // border corner radius
        title?: string; // legend title
        titleColor?: string; // title color
        titleSize?: number; // title size
        itemSpacing?: number; // spacing between legend items
        symbolSize?: number; // color swatch size
        textColor?: string; // text color
        textSize?: number; // text size
        columns?: number; // lay out in columns
        horizontal?: boolean; // horizontal arrangement
    };
}

// Main SVG rendering function
export function sectionProfileToSVG(
    svgId: string,
    profiles: SectionProfile[],
    meterials: Material[],
    upDir: THREE.Vector3,
    styleOptions?: SVGStyleOptions // optional parameter
): void {
    // Merge default styles with user-supplied styles
    const styles: Required<SVGStyleOptions> = {
        background: {
            color: "#1e1e28",
            opacity: 0.7,
            ...styleOptions?.background
        },
        grid: {
            color: "rgba(255, 255, 255, 0.1)",
            width: 0.5,
            opacity: 1,
            ...styleOptions?.grid
        },
        axis: {
            color: "rgba(255, 255, 255, 0.7)",
            width: 2,
            labelColor: "white",
            labelSize: 12,
            ...styleOptions?.axis
        },
        title: {
            label: "地质剖面图",
            subtitle: "勘探线剖面",
            color: "#4ECDC4",
            size: 24,
            subtitleSize: 16,
            ...styleOptions?.title
        },
        stratum: {
            labelColor: "white",
            labelSize: 16,
            labelWeight: "bold",
            ...styleOptions?.stratum
        },
        collapse: {
            labelColor: "white",
            labelSize: 16,
            labelWeight: "bold",
            ...styleOptions?.collapse
        },
        sectionLabel: {
            color: "#4ECDC4",
            size: 20,
            weight: "bold",
            ...styleOptions?.sectionLabel
        },
        legend: {
            show: true,
            position: "top-right",
            customPosition: { x: 0, y: 0 },
            backgroundColor: "#2c2c3a",
            backgroundOpacity: 0.8,
            borderColor: "#4ECDC4",
            borderWidth: 2,
            borderRadius: 8,
            title: "图例",
            titleColor: "#ffffff",
            titleSize: 18,
            itemSpacing: 10,
            symbolSize: 15,
            textColor: "#ffffff",
            textSize: 14,
            columns: 1,
            horizontal: false
        }
    };

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.getElementById(svgId) as unknown as SVGElement;

    // Clear existing content
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }

    // Project all profiles to 2D
    const projectedProfiles = profiles.map(profile => projectSectionProfile(profile, upDir));

    // Calculate overall bounds
    const bounds = calculateMultiProfileBounds(projectedProfiles);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxZ - bounds.minZ;

    // Set SVG viewBox
    svg.setAttribute("viewBox", `${bounds.minX} ${bounds.minZ} ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    // Create background
    const background = document.createElementNS(svgNS, "rect");
    background.setAttribute("x", bounds.minX.toString());
    background.setAttribute("y", bounds.minZ.toString());
    background.setAttribute("width", width.toString());
    background.setAttribute("height", height.toString());
    background.setAttribute("fill", styles.background.color);
    background.setAttribute("opacity", styles.background.opacity.toString());
    svg.appendChild(background);

    // Add grid
    const gridGroup = document.createElementNS(svgNS, "g");
    gridGroup.setAttribute("stroke", styles.grid.color);
    gridGroup.setAttribute("stroke-width", styles.grid.width.toString());
    gridGroup.setAttribute("opacity", styles.grid.opacity.toString());

    // Horizontal grid lines (Z direction)
    const zStep = calculateOptimalInterval(height);
    for (let z = Math.ceil(bounds.minZ / zStep) * zStep; z <= bounds.maxZ; z += zStep) {
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", bounds.minX.toString());
        line.setAttribute("y1", z.toString());
        line.setAttribute("x2", bounds.maxX.toString());
        line.setAttribute("y2", z.toString());
        gridGroup.appendChild(line);
    }

    // Vertical grid lines (X direction)
    const xStep = calculateOptimalInterval(width);
    for (let x = Math.ceil(bounds.minX / xStep) * xStep; x <= bounds.maxX; x += xStep) {
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", x.toString());
        line.setAttribute("y1", bounds.minZ.toString());
        line.setAttribute("x2", x.toString());
        line.setAttribute("y2", bounds.maxZ.toString());
        gridGroup.appendChild(line);
    }

    svg.appendChild(gridGroup);

    // Draw all profiles
    projectedProfiles.forEach((profile, index) => {
        // Draw strata
        const strataGroup = document.createElementNS(svgNS, "g");
        profile.stratumProfiles.forEach(stratum => {
            const color = getColor(stratum.material, meterials);

            // Create polygon
            const polygon = document.createElementNS(svgNS, "polygon");
            let pointsStr = "";

            // Top points (left to right)
            stratum.top.forEach(point => {
                pointsStr += `${point.x},${point.z} `;
            });

            // Base points (right to left)
            stratum.base
                .slice()
                .reverse()
                .forEach(point => {
                    pointsStr += `${point.x},${point.z} `;
                });

            polygon.setAttribute("points", pointsStr.trim());
            polygon.setAttribute("fill", color);
            polygon.setAttribute("fill-opacity", "0.4");
            polygon.setAttribute("stroke", color);
            polygon.setAttribute("stroke-width", "2");
            polygon.setAttribute("class", `stratum profile-${index}`);
            strataGroup.appendChild(polygon);

            // Add label
            const midIndex = Math.floor(stratum.top.length / 2);
            const midPoint = stratum.top[midIndex];
            const basePoint = stratum.base[midIndex];
            const labelX = midPoint.x;
            const labelZ = (midPoint.z + basePoint.z) / 2;

            const text = document.createElementNS(svgNS, "text");
            text.setAttribute("x", labelX.toString());
            text.setAttribute("y", labelZ.toString());
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("dominant-baseline", "middle");
            text.setAttribute("fill", styles.stratum.labelColor);
            text.setAttribute("font-size", styles.stratum.labelSize.toString());
            text.setAttribute("font-weight", styles.stratum.labelWeight);
            text.textContent = stratum.stratumID;
            strataGroup.appendChild(text);
        });
        svg.appendChild(strataGroup);

        // Draw collapses
        const collapseGroup = document.createElementNS(svgNS, "g");
        profile.collapseProfiles.forEach(collapse => {
            const color = getColor(collapse.material, meterials);

            collapse.polys.forEach(poly => {
                const polygon = document.createElementNS(svgNS, "polygon");
                let pointsStr = "";

                poly.forEach(point => {
                    pointsStr += `${point.x},${point.z} `;
                });

                polygon.setAttribute("points", pointsStr.trim());
                polygon.setAttribute("fill", color);
                polygon.setAttribute("fill-opacity", "0.7");
                polygon.setAttribute("stroke", color);
                polygon.setAttribute("stroke-width", "2");
                polygon.setAttribute("class", `collapse profile-${index}`);
                collapseGroup.appendChild(polygon);

                // Add label
                const center = { x: 0, y: 0, z: 0 };
                poly.forEach(point => {
                    center.x += point.x;
                    center.z += point.z;
                });
                center.x /= poly.length;
                center.z /= poly.length;

                const text = document.createElementNS(svgNS, "text");
                text.setAttribute("x", center.x.toString());
                text.setAttribute("y", center.z.toString());
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("dominant-baseline", "middle");
                text.setAttribute("fill", styles.collapse.labelColor);
                text.setAttribute("font-size", styles.collapse.labelSize.toString());
                text.setAttribute("font-weight", styles.collapse.labelWeight);
                text.textContent = collapse.collapseID;
                collapseGroup.appendChild(text);
            });
        });
        svg.appendChild(collapseGroup);

        // Add section line label
        const sectionLabel = document.createElementNS(svgNS, "text");
        const midX = (profile.line[0].x + profile.line[1].x) / 2;
        const labelY = bounds.maxZ - (bounds.maxZ - bounds.minZ) * 0.05;
        sectionLabel.setAttribute("x", midX.toString());
        sectionLabel.setAttribute("y", labelY.toString());
        sectionLabel.setAttribute("text-anchor", "middle");
        sectionLabel.setAttribute("fill", styles.sectionLabel.color);
        sectionLabel.setAttribute("font-size", styles.sectionLabel.size.toString());
        sectionLabel.setAttribute("font-weight", styles.sectionLabel.weight);
        sectionLabel.textContent = `Section ${index + 1}`;
        svg.appendChild(sectionLabel);
    });

    const legendOptions = styles.legend;
    if (legendOptions.show) {
        const legendItems: Array<{
            id: string;
            label: string;
            color: string;
            type: "stratum" | "collapse";
        }> = [];

        // Collect strata
        profiles.forEach(profile => {
            profile.stratumProfiles.forEach(stratum => {
                if (!legendItems.some(item => item.id === stratum.stratumID)) {
                    const color = getColor(stratum.material, meterials);
                    legendItems.push({
                        id: stratum.stratumID,
                        label: stratum.stratumID,
                        color,
                        type: "stratum"
                    });
                }
            });

            // Collect collapse pillars
            profile.collapseProfiles.forEach(collapse => {
                if (!legendItems.some(item => item.id === collapse.collapseID)) {
                    const color = getColor(collapse.material, meterials);
                    legendItems.push({
                        id: collapse.collapseID,
                        label: collapse.collapseID,
                        color,
                        type: "collapse"
                    });
                }
            });
        });

        // Compute the legend dimensions
        const itemHeight = Math.max(legendOptions.symbolSize, legendOptions.textSize) + 5;
        const titleHeight = legendOptions.title ? legendOptions.titleSize + 15 : 0;
        const itemsPerColumn = Math.ceil(legendItems.length / legendOptions.columns);
        const columnWidth = 200; // width of each column

        const legendWidth = legendOptions.columns * columnWidth;
        const legendHeight =
            titleHeight +
            itemsPerColumn * itemHeight +
            (itemsPerColumn - 1) * legendOptions.itemSpacing +
            20;

        // Determine the legend position
        let legendX: number, legendY: number;
        const padding = 20;

        switch (legendOptions.position) {
            case "top-right":
                legendX = bounds.maxX - legendWidth - padding;
                legendY = bounds.minZ + padding;
                break;
            case "top-left":
                legendX = bounds.minX + padding;
                legendY = bounds.minZ + padding;
                break;
            case "bottom-right":
                legendX = bounds.maxX - legendWidth - padding;
                legendY = bounds.maxZ - legendHeight - padding;
                break;
            case "bottom-left":
                legendX = bounds.minX + padding;
                legendY = bounds.maxZ - legendHeight - padding;
                break;
            case "custom":
                legendX = legendOptions.customPosition.x;
                legendY = legendOptions.customPosition.y;
                break;
            default:
                legendX = bounds.maxX - legendWidth - padding;
                legendY = bounds.minZ + padding;
        }

        // Create the legend group
        const legendGroup = document.createElementNS(svgNS, "g");
        legendGroup.setAttribute("class", "geology-legend");

        // Draw the legend background
        const legendBg = document.createElementNS(svgNS, "rect");
        legendBg.setAttribute("x", legendX.toString());
        legendBg.setAttribute("y", legendY.toString());
        legendBg.setAttribute("width", legendWidth.toString());
        legendBg.setAttribute("height", legendHeight.toString());
        legendBg.setAttribute("rx", legendOptions.borderRadius.toString());
        legendBg.setAttribute("ry", legendOptions.borderRadius.toString());
        legendBg.setAttribute("fill", legendOptions.backgroundColor);
        legendBg.setAttribute("fill-opacity", legendOptions.backgroundOpacity.toString());
        legendBg.setAttribute("stroke", legendOptions.borderColor);
        legendBg.setAttribute("stroke-width", legendOptions.borderWidth.toString());
        legendGroup.appendChild(legendBg);

        // Add the legend title
        if (legendOptions.title) {
            const title = document.createElementNS(svgNS, "text");
            title.setAttribute("x", (legendX + legendWidth / 2).toString());
            title.setAttribute("y", (legendY + legendOptions.titleSize + 10).toString());
            title.setAttribute("text-anchor", "middle");
            title.setAttribute("fill", legendOptions.titleColor);
            title.setAttribute("font-size", legendOptions.titleSize.toString());
            title.setAttribute("font-weight", "bold");
            title.textContent = legendOptions.title;
            legendGroup.appendChild(title);
        }

        // Add legend items
        legendItems.forEach((item, index) => {
            const colIndex = legendOptions.horizontal
                ? Math.floor(index / itemsPerColumn)
                : index % legendOptions.columns;

            const rowIndex = legendOptions.horizontal
                ? index % itemsPerColumn
                : Math.floor(index / legendOptions.columns);

            const itemX = legendX + 20 + colIndex * columnWidth;
            const itemY =
                legendY + titleHeight + 15 + rowIndex * (itemHeight + legendOptions.itemSpacing);

            // Draw the color swatch
            const symbol = document.createElementNS(svgNS, "rect");
            symbol.setAttribute("x", itemX.toString());
            symbol.setAttribute("y", (itemY - legendOptions.symbolSize / 2).toString());
            symbol.setAttribute("width", legendOptions.symbolSize.toString());
            symbol.setAttribute("height", legendOptions.symbolSize.toString());
            symbol.setAttribute("fill", item.color);

            // Special marker for strata
            // Draw the color swatch
            if (item.type === "stratum") {
                const symbol = document.createElementNS(svgNS, "rect");
                symbol.setAttribute("x", itemX.toString());
                symbol.setAttribute("y", (itemY - legendOptions.symbolSize / 2).toString());
                symbol.setAttribute("width", legendOptions.symbolSize.toString());
                symbol.setAttribute("height", legendOptions.symbolSize.toString());
                symbol.setAttribute("rx", "2");
                symbol.setAttribute("ry", "2");
                symbol.setAttribute("stroke", "#ffffff");
                symbol.setAttribute("stroke-width", "1");
                symbol.setAttribute("fill", item.color);
                legendGroup.appendChild(symbol);
            } else {
                // Collapse pillars use a trapezoid marker
                const symbol = document.createElementNS(svgNS, "polygon");
                const symbolSize = legendOptions.symbolSize;
                const points = [
                    `${itemX + symbolSize * 0.2},${itemY - symbolSize / 2}`, // top-left (indented 20% to the right)
                    `${itemX + symbolSize * 0.8},${itemY - symbolSize / 2}`, // top-right (indented 20% to the left)
                    `${itemX + symbolSize},${itemY + symbolSize / 2}`, // bottom-right (keeps original right edge)
                    `${itemX},${itemY + symbolSize / 2}` // bottom-left (keeps original left edge)
                ].join(" ");
                symbol.setAttribute("points", points);
                symbol.setAttribute("fill", item.color);
                symbol.setAttribute("stroke", "#ffffff");
                symbol.setAttribute("stroke-width", "1");
                legendGroup.appendChild(symbol);
            }

            legendGroup.appendChild(symbol);

            // Add the text label
            const text = document.createElementNS(svgNS, "text");
            text.setAttribute("x", (itemX + legendOptions.symbolSize + 10).toString());
            text.setAttribute("y", itemY.toString());
            text.setAttribute("dominant-baseline", "middle");
            text.setAttribute("fill", legendOptions.textColor);
            text.setAttribute("font-size", legendOptions.textSize.toString());

            // Add the type prefix
            const prefix = item.type === "stratum" ? "地层: " : "陷落柱: ";
            text.textContent = prefix + item.label;
            legendGroup.appendChild(text);
        });

        svg.appendChild(legendGroup);
    }

    // Add axes
    const axisGroup = document.createElementNS(svgNS, "g");
    axisGroup.setAttribute("stroke", styles.axis.color);
    axisGroup.setAttribute("stroke-width", styles.axis.width.toString());

    // X-axis
    const xAxis = document.createElementNS(svgNS, "line");
    xAxis.setAttribute("x1", bounds.minX.toString());
    xAxis.setAttribute("y1", bounds.maxZ.toString());
    xAxis.setAttribute("x2", bounds.maxX.toString());
    xAxis.setAttribute("y2", bounds.maxZ.toString());
    axisGroup.appendChild(xAxis);

    // Z-axis
    const zAxis = document.createElementNS(svgNS, "line");
    zAxis.setAttribute("x1", bounds.minX.toString());
    zAxis.setAttribute("y1", bounds.minZ.toString());
    zAxis.setAttribute("x2", bounds.minX.toString());
    zAxis.setAttribute("y2", bounds.maxZ.toString());
    axisGroup.appendChild(zAxis);

    // X-axis ticks
    const xInterval = calculateOptimalInterval(width);
    for (let x = Math.ceil(bounds.minX / xInterval) * xInterval; x <= bounds.maxX; x += xInterval) {
        const tick = document.createElementNS(svgNS, "line");
        tick.setAttribute("x1", x.toString());
        tick.setAttribute("y1", bounds.maxZ.toString());
        tick.setAttribute("x2", x.toString());
        tick.setAttribute("y2", (bounds.maxZ + height * 0.02).toString());
        axisGroup.appendChild(tick);

        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", x.toString());
        label.setAttribute("y", (bounds.maxZ + height * 0.05).toString());
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("fill", styles.axis.labelColor);
        label.setAttribute("font-size", styles.axis.labelSize.toString());
        label.textContent = `${x}`;
        axisGroup.appendChild(label);
    }

    // Z-axis ticks
    const zInterval = calculateOptimalInterval(height);
    for (let z = Math.ceil(bounds.minZ / zInterval) * zInterval; z <= bounds.maxZ; z += zInterval) {
        const tick = document.createElementNS(svgNS, "line");
        tick.setAttribute("x1", bounds.minX.toString());
        tick.setAttribute("y1", z.toString());
        tick.setAttribute("x2", (bounds.minX - width * 0.02).toString());
        tick.setAttribute("y2", z.toString());
        axisGroup.appendChild(tick);

        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", (bounds.minX - width * 0.05).toString());
        label.setAttribute("y", z.toString());
        label.setAttribute("text-anchor", "end");
        label.setAttribute("dominant-baseline", "middle");
        label.setAttribute("fill", styles.axis.labelColor);
        label.setAttribute("font-size", styles.axis.labelSize.toString());
        label.textContent = `${z}`;
        axisGroup.appendChild(label);
    }

    // Axis labels
    const xLabel = document.createElementNS(svgNS, "text");
    xLabel.setAttribute("x", bounds.maxX.toString());
    xLabel.setAttribute("y", (bounds.maxZ + height * 0.1).toString());
    xLabel.setAttribute("fill", "white");
    xLabel.setAttribute("font-weight", "bold");
    xLabel.textContent = "X (m)";
    axisGroup.appendChild(xLabel);

    const zLabel = document.createElementNS(svgNS, "text");
    zLabel.setAttribute("x", (bounds.minX - width * 0.1).toString());
    zLabel.setAttribute("y", bounds.minZ.toString());
    zLabel.setAttribute("fill", "white");
    zLabel.setAttribute("font-weight", "bold");
    zLabel.textContent = "Z (m)";
    axisGroup.appendChild(zLabel);

    svg.appendChild(axisGroup);

    // Add title
    const titleGroup = document.createElementNS(svgNS, "g");
    const title = document.createElementNS(svgNS, "text");
    title.setAttribute("x", (bounds.minX + width / 2).toString());
    title.setAttribute("y", (bounds.minZ + height * 0.05).toString());
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("fill", styles.title.color);
    title.setAttribute("font-size", styles.title.size.toString());
    title.setAttribute("font-weight", "bold");
    title.textContent = styles.title.label;
    titleGroup.appendChild(title);

    const subtitle = document.createElementNS(svgNS, "text");
    subtitle.setAttribute("x", (bounds.minX + width / 2).toString());
    subtitle.setAttribute("y", (bounds.minZ + height * 0.1).toString());
    subtitle.setAttribute("text-anchor", "middle");
    subtitle.setAttribute("fill", styles.title.color); // or use a dedicated color
    subtitle.setAttribute("font-size", styles.title.subtitleSize.toString());
    subtitle.textContent = styles.title.subtitle;
    titleGroup.appendChild(subtitle);

    svg.appendChild(titleGroup);
}

export function createSectionPlanes(
    profiles: SectionProfile[],
    meterials: Material[],
    project: Projection
): MapAnchor<THREE.Group> {
    const group = new THREE.Group() as MapAnchor<THREE.Group>;
    group.name = "SectionPlanesGroup";
    const center = new THREE.Vector3();

    // Material cache
    const materialCache = new Map<string, THREE.Material>();

    // Get or create a material
    const getMaterial = (color: { r: number; g: number; b: number }, opacity: number) => {
        const key = `${color.r}-${color.g}-${color.b}-${opacity}`;
        if (!materialCache.has(key)) {
            materialCache.set(
                key,
                new THREE.MeshPhongMaterial({
                    color: new THREE.Color(color.r, color.g, color.b),
                    transparent: opacity < 1,
                    opacity,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    blending: THREE.CustomBlending,
                    blendSrc: THREE.SrcAlphaFactor,
                    blendDst: THREE.OneMinusSrcAlphaFactor
                })
            );
        }
        return materialCache.get(key)!;
    };

    // Create planes for each profile
    profiles.forEach((profile, profileIndex) => {
        const sectionGroup = new THREE.Group();
        sectionGroup.name = `Section-${profileIndex}`;

        const bbox = new THREE.Box3();
        const allPoints: THREE.Vector3[] = [];

        // Collect all vertices
        profile.stratumProfiles.forEach(stratum => {
            stratum.crossSections.forEach(geometry => {
                const positions = geometry.getAttribute("position");
                for (let i = 0; i < positions.count; i++) {
                    const point = new THREE.Vector3();
                    point.fromBufferAttribute(positions, i);
                    allPoints.push(point);
                }
            });
            allPoints.push(...stratum.top, ...stratum.base);
        });

        profile.collapseProfiles.forEach(collapse => {
            collapse.crossSections.forEach(geometry => {
                const positions = geometry.getAttribute("position");
                for (let i = 0; i < positions.count; i++) {
                    const point = new THREE.Vector3();
                    point.fromBufferAttribute(positions, i);
                    allPoints.push(point);
                }
            });
            collapse.polys.forEach(poly => allPoints.push(...poly));
        });

        // Compute the bounding box and center point
        allPoints.forEach(p => bbox.expandByPoint(p));
        center.copy(bbox.getCenter(new THREE.Vector3()));

        // Transform into local coordinates around the center
        const matrix = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);

        // Process stratum geometry
        profile.stratumProfiles.forEach(stratum => {
            // Get the stratum material
            const color = getColor(stratum.material, meterials);
            const material = getMaterial(new THREE.Color(color), 0.6);

            // Clone and transform the geometry
            stratum.crossSections = stratum.crossSections.map(geometry => {
                const cloned = geometry.clone();
                cloned.applyMatrix4(matrix);
                return cloned;
            });

            // Create meshes
            stratum.crossSections.forEach((geometry, geomIndex) => {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = `Stratum-${stratum.stratumID}-${geomIndex}`;
                mesh.renderOrder = 1; // keep strata above the collapse areas
                sectionGroup.add(mesh);
            });
        });

        // Process collapse geometry
        profile.collapseProfiles.forEach(collapse => {
            // Get the collapse material
            const color = getColor(collapse.material, meterials);
            const material = getMaterial(new THREE.Color(color), 0.7);

            // Clone and transform the geometry
            collapse.crossSections = collapse.crossSections.map(geometry => {
                const cloned = geometry.clone();
                cloned.applyMatrix4(matrix);
                return cloned;
            });

            // Create meshes
            collapse.crossSections.forEach((geometry, geomIndex) => {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = `Collapse-${collapse.collapseID}-${geomIndex}`;
                mesh.renderOrder = 0; // collapse areas render below the strata
                sectionGroup.add(mesh);
            });
        });

        // Position the group at the original center
        group.add(sectionGroup);
    });

    group.anchor = project.unprojectPoint(center);
    group.overlay = true;

    return group;
}
