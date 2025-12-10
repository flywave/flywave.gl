/* Copyright (C) 2025 flywave.gl contributors */

import { type TextLayoutParameters, type TextRenderParameters } from "@flywave/flywave-text-canvas";
import * as THREE from "three";

import { TextElement } from "../src/text/TextElement";
import { PoiInfoBuilder } from "./PoiInfoBuilder";

export const DEF_TEXT: string = "Text";
export const DEF_RENDER_PARAMS: TextRenderParameters = {};
export const DEF_LAYOUT_PARAMS: TextLayoutParameters = {};
export const DEF_PRIORITY: number = 0;
export const DEF_POSITION = new THREE.Vector3(0, 0, 1);
export const DEF_PATH = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 0.1, 0)];
export const DEF_IGNORE_DISTANCE: boolean = true;
export const DEF_MAY_OVERLAP: boolean = false;
const DEF_TILE_CENTER = new THREE.Vector3(0, 0, 0.1);

export function pointTextBuilder(text: string = DEF_TEXT): TextElementBuilder {
    return new TextElementBuilder().withText(text).withPositionVec(DEF_POSITION);
}

export function poiBuilder(text: string = DEF_TEXT): TextElementBuilder {
    return new TextElementBuilder()
        .withText(text)
        .withPositionVec(DEF_POSITION.clone())
        .withPoiInfo(new PoiInfoBuilder().withPoiTechnique());
}

export function createPath(coordScale: number, points: THREE.Vector3[]) {
    return points.map((point: THREE.Vector3) => point.clone().multiplyScalar(coordScale));
}

export function pathTextBuilder(coordScale: number, text: string = DEF_TEXT): TextElementBuilder {
    return new TextElementBuilder().withText(text).withPath(createPath(coordScale, DEF_PATH));
}

export function lineMarkerBuilder(coordScale: number, text: string = DEF_TEXT): TextElementBuilder {
    return new TextElementBuilder()
        .withText(text)
        .withPath(createPath(coordScale, DEF_PATH))
        .withPoiInfo(new PoiInfoBuilder().withLineMarkerTechnique());
}

export class TextElementBuilder {
    private m_text: string = DEF_TEXT;
    private m_priority: number = DEF_PRIORITY;
    private m_points: THREE.Vector3 | THREE.Vector3[] = DEF_POSITION.clone();
    private m_ignoreDistance: boolean = DEF_IGNORE_DISTANCE;
    private m_poiInfoBuilder: PoiInfoBuilder | undefined;
    private m_xOffset: number | undefined;
    private m_yOffset: number | undefined;
    private m_featureId: number | undefined;
    private m_pathLengthSqr: number | undefined;
    private m_userData: any;
    private m_mayOverlap: boolean = DEF_MAY_OVERLAP;

    withPoiInfo(poiInfoBuilder: PoiInfoBuilder): this {
        this.m_poiInfoBuilder = poiInfoBuilder;
        return this;
    }

    withText(text: string): this {
        this.m_text = text;
        return this;
    }

    withPriority(priority: number): this {
        this.m_priority = priority;
        return this;
    }

    withPosition(x: number, y: number, z: number = 0): this {
        this.m_points = new THREE.Vector3(x, y, z).add(DEF_TILE_CENTER);
        return this;
    }

    withPositionVec(position: THREE.Vector3): this {
        this.m_points = position.add(DEF_TILE_CENTER);
        return this;
    }

    withPath(path: THREE.Vector3[]): this {
        for (const point of path) {
            point.add(DEF_TILE_CENTER);
        }
        this.m_points = path;
        return this;
    }

    withIgnoreDistance(ignoreDistance: boolean): this {
        this.m_ignoreDistance = ignoreDistance;
        return this;
    }

    withOffset(x: number, y: number): this {
        this.m_xOffset = x;
        this.m_yOffset = y;
        return this;
    }

    withFeatureId(id: number): this {
        this.m_featureId = id;
        return this;
    }

    withUserData(data: any): this {
        this.m_userData = data;
        return this;
    }

    withPathLengthSqr(lengthSqr: number): this {
        this.m_pathLengthSqr = lengthSqr;
        return this;
    }

    withMayOverlap(mayOverlap: boolean): this {
        this.m_mayOverlap = mayOverlap;
        return this;
    }

    build(): TextElement {
        const textElement = new TextElement(
            this.m_text,
            this.m_points,
            DEF_RENDER_PARAMS,
            DEF_LAYOUT_PARAMS,
            this.m_priority,
            this.m_xOffset,
            this.m_yOffset,
            this.m_featureId
        );
        textElement.ignoreDistance = this.m_ignoreDistance;
        if (this.m_poiInfoBuilder !== undefined) {
            textElement.poiInfo = this.m_poiInfoBuilder.build(textElement);
        }
        textElement.userData = this.m_userData;
        textElement.pathLengthSqr = this.m_pathLengthSqr;
        textElement.mayOverlap = this.m_mayOverlap;

        return textElement;
    }
}
