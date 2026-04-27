import { type Projection } from "@flywave/flywave-geoutils";
import { type MapAnchor } from "@flywave/flywave-mapview";
import * as THREE from "three";
import { type Material } from "../decoder";
export interface CollapseProfile {
    collapseID: string;
    crossSections: THREE.BufferGeometry[];
    polys: THREE.Vector3[][];
    material: number;
}
export interface StratumProfile {
    stratumID: string;
    top: THREE.Vector3[];
    base: THREE.Vector3[];
    crossSections: THREE.BufferGeometry[];
    polys: THREE.Vector3[][];
    material: number;
}
export interface SectionProfile {
    stratumProfiles: StratumProfile[];
    collapseProfiles: CollapseProfile[];
    line: THREE.Vector3[];
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
        show?: boolean;
        position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "custom";
        customPosition?: {
            x: number;
            y: number;
        };
        backgroundColor?: string;
        backgroundOpacity?: number;
        borderColor?: string;
        borderWidth?: number;
        borderRadius?: number;
        title?: string;
        titleColor?: string;
        titleSize?: number;
        itemSpacing?: number;
        symbolSize?: number;
        textColor?: string;
        textSize?: number;
        columns?: number;
        horizontal?: boolean;
    };
}
export declare function sectionProfileToSVG(svgId: string, profiles: SectionProfile[], meterials: Material[], upDir: THREE.Vector3, styleOptions?: SVGStyleOptions): void;
export declare function createSectionPlanes(profiles: SectionProfile[], meterials: Material[], project: Projection): MapAnchor<THREE.Group>;
