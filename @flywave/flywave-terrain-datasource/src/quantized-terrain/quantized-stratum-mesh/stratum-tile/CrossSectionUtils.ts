/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection } from "@flywave/flywave-geoutils";
import { type MapAnchor } from "@flywave/flywave-mapview";
import * as THREE from "three";

import { type Material } from "../decoder";

// 陷落柱剖面结构
export interface CollapseProfile {
    collapseID: string;
    crossSections: THREE.BufferGeometry[];
    polys: THREE.Vector3[][];
    material: number;
}

// 地层剖面结构
export interface StratumProfile {
    stratumID: string; // 地层唯一标识
    top: THREE.Vector3[]; // 顶板交线点序列（沿剖切线有序排列）
    base: THREE.Vector3[]; // 底板交线点序列
    crossSections: THREE.BufferGeometry[]; // 三角剖分后的TIN网格集合
    polys: THREE.Vector3[][]; // 原始剖面多边形顶点序列
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
        show?: boolean; // 是否显示图例
        position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "custom"; // 图例位置
        customPosition?: { x: number; y: number }; // 自定义位置
        backgroundColor?: string; // 背景颜色
        backgroundOpacity?: number; // 背景透明度
        borderColor?: string; // 边框颜色
        borderWidth?: number; // 边框宽度
        borderRadius?: number; // 边框圆角
        title?: string; // 图例标题
        titleColor?: string; // 标题颜色
        titleSize?: number; // 标题大小
        itemSpacing?: number; // 图例项间距
        symbolSize?: number; // 颜色标记大小
        textColor?: string; // 文本颜色
        textSize?: number; // 文本大小
        columns?: number; // 分列显示
        horizontal?: boolean; // 水平排列
    };
}

// Main SVG rendering function
export function sectionProfileToSVG(
    svgId: string,
    profiles: SectionProfile[],
    meterials: Material[],
    upDir: THREE.Vector3,
    styleOptions?: SVGStyleOptions // 新增可选参数
): void {
    // 合并默认样式和用户自定义样式
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

        // 收集地层
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

            // 收集塌陷
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

        // 计算图例尺寸
        const itemHeight = Math.max(legendOptions.symbolSize, legendOptions.textSize) + 5;
        const titleHeight = legendOptions.title ? legendOptions.titleSize + 15 : 0;
        const itemsPerColumn = Math.ceil(legendItems.length / legendOptions.columns);
        const columnWidth = 200; // 每列宽度

        const legendWidth = legendOptions.columns * columnWidth;
        const legendHeight =
            titleHeight +
            itemsPerColumn * itemHeight +
            (itemsPerColumn - 1) * legendOptions.itemSpacing +
            20;

        // 确定图例位置
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

        // 创建图例组
        const legendGroup = document.createElementNS(svgNS, "g");
        legendGroup.setAttribute("class", "geology-legend");

        // 绘制图例背景
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

        // 添加图例标题
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

        // 添加图例项
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

            // 绘制颜色标记
            const symbol = document.createElementNS(svgNS, "rect");
            symbol.setAttribute("x", itemX.toString());
            symbol.setAttribute("y", (itemY - legendOptions.symbolSize / 2).toString());
            symbol.setAttribute("width", legendOptions.symbolSize.toString());
            symbol.setAttribute("height", legendOptions.symbolSize.toString());
            symbol.setAttribute("fill", item.color);

            // 为地层添加特殊标记
            // 绘制颜色标记
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
                // 塌陷使用梯形标记
                const symbol = document.createElementNS(svgNS, "polygon");
                const symbolSize = legendOptions.symbolSize;
                const points = [
                    `${itemX + symbolSize * 0.2},${itemY - symbolSize / 2}`, // 上左（向右缩进20%）
                    `${itemX + symbolSize * 0.8},${itemY - symbolSize / 2}`, // 上右（向左缩进20%）
                    `${itemX + symbolSize},${itemY + symbolSize / 2}`, // 下右（保持原右边界）
                    `${itemX},${itemY + symbolSize / 2}` // 下左（保持原左边界）
                ].join(" ");
                symbol.setAttribute("points", points);
                symbol.setAttribute("fill", item.color);
                symbol.setAttribute("stroke", "#ffffff");
                symbol.setAttribute("stroke-width", "1");
                legendGroup.appendChild(symbol);
            }

            legendGroup.appendChild(symbol);

            // 添加文本标签
            const text = document.createElementNS(svgNS, "text");
            text.setAttribute("x", (itemX + legendOptions.symbolSize + 10).toString());
            text.setAttribute("y", itemY.toString());
            text.setAttribute("dominant-baseline", "middle");
            text.setAttribute("fill", legendOptions.textColor);
            text.setAttribute("font-size", legendOptions.textSize.toString());

            // 添加类型前缀
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
    subtitle.setAttribute("fill", styles.title.color); // 或使用特定颜色
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

    // 材质缓存
    const materialCache = new Map<string, THREE.Material>();

    // 获取或创建材质
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

    // 为每个剖面创建平面
    profiles.forEach((profile, profileIndex) => {
        const sectionGroup = new THREE.Group();
        sectionGroup.name = `Section-${profileIndex}`;

        const bbox = new THREE.Box3();
        const allPoints: THREE.Vector3[] = [];

        // 收集所有顶点
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

        // 计算包围盒和中心点
        allPoints.forEach(p => bbox.expandByPoint(p));
        center.copy(bbox.getCenter(new THREE.Vector3()));

        // 转换坐标系到局部
        const matrix = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);

        // 处理地层几何体
        profile.stratumProfiles.forEach(stratum => {
            // 获取地层材质
            const color = getColor(stratum.material, meterials);
            const material = getMaterial(new THREE.Color(color), 0.6);

            // 克隆并转换几何体
            stratum.crossSections = stratum.crossSections.map(geometry => {
                const cloned = geometry.clone();
                cloned.applyMatrix4(matrix);
                return cloned;
            });

            // 创建网格
            stratum.crossSections.forEach((geometry, geomIndex) => {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = `Stratum-${stratum.stratumID}-${geomIndex}`;
                mesh.renderOrder = 1; // 确保地层在塌陷区域之上
                sectionGroup.add(mesh);
            });
        });

        // 处理塌陷几何体
        profile.collapseProfiles.forEach(collapse => {
            // 获取塌陷材质
            const color = getColor(collapse.material, meterials);
            const material = getMaterial(new THREE.Color(color), 0.7);

            // 克隆并转换几何体
            collapse.crossSections = collapse.crossSections.map(geometry => {
                const cloned = geometry.clone();
                cloned.applyMatrix4(matrix);
                return cloned;
            });

            // 创建网格
            collapse.crossSections.forEach((geometry, geomIndex) => {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = `Collapse-${collapse.collapseID}-${geomIndex}`;
                mesh.renderOrder = 0; // 塌陷区域在地层之下
                sectionGroup.add(mesh);
            });
        });

        // 设置组位置到原始中心点
        group.add(sectionGroup);
    });

    group.anchor = project.unprojectPoint(center);
    group.overlay = true;

    return group;
}
