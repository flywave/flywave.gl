/* Copyright (C) 2025 flywave.gl contributors */

import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import * as THREE from "three";

const textureCache = new Map<string, THREE.Texture>();

export interface TerrainControlPointConfig {
    brushType?: "raise" | "lower" | "smooth" | "flatten" | "noise" | "erode";
    radius?: number;
    hardness?: number;
    heightDelta?: number;
    strength?: number;
    targetAltitude?: number;
    scale?: number;
    persistence?: number;
    blendMode?: "normal" | "add" | "multiply" | "screen" | "overlay";
}

export class TerrainControlPoint extends THREE.Object3D {
    private mapView: MapView;
    public readonly id: number;
    public geoPosition: GeoCoordinates;
    public config: TerrainControlPointConfig;
    private sprite: THREE.Sprite;
    private spriteMaterial: THREE.SpriteMaterial;
    private ringMesh: THREE.Mesh;
    public isSelected: boolean = false;
    private baseColor: number = 0x00ff00;

    constructor(
        mapView: MapView,
        position: GeoCoordinates,
        config: TerrainControlPointConfig = {}
    ) {
        super();
        this.mapView = mapView;
        this.geoPosition = position;
        this.config = config;
        this.id = (Math.random() * 0xffffff) | 0;

        this.baseColor = this.getBrushColor(config.brushType || "raise");

        this.spriteMaterial = this.createSpriteMaterial(this.baseColor, false);
        this.sprite = new THREE.Sprite(this.spriteMaterial);

        this.sprite.scale.set(0.02, 0.02, 1);
        this.sprite.renderOrder = 100;

        const ringGeometry = new THREE.RingGeometry(1.5, 1.7, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthTest: false
        });
        this.ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
        this.ringMesh.rotation.x = Math.PI / 2;
        this.ringMesh.renderOrder = 99;

        this.add(this.ringMesh);
        this.add(this.sprite);

        this.update();

        mapView.addEventListener(
            MapViewEventNames.CameraPositionChanged,
            this.onCameraPositionChanged
        );
    }

    private onCameraPositionChanged = (): void => {
        this.update();
    };

    private getBrushColor(type: string): number {
        const colors: Record<string, number> = {
            raise: 0x00ff00,
            lower: 0xff0000,
            smooth: 0x0088ff,
            flatten: 0xffff00,
            noise: 0x8800ff,
            erode: 0xff8800
        };
        return colors[type] || 0x00ff00;
    }

    private createSpriteMaterial(color: number, isSelected: boolean): THREE.SpriteMaterial {
        const texture = this.createPointTexture(color, isSelected);
        return new THREE.SpriteMaterial({
            map: texture,
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            sizeAttenuation: false,
            depthTest: false,
            depthWrite: false
        });
    }

    private createPointTexture(color: number, isSelected: boolean): THREE.Texture {
        const cacheKey = `${color}-${isSelected}`;

        if (textureCache.has(cacheKey)) {
            return textureCache.get(cacheKey)!;
        }

        const canvas = document.createElement("canvas");
        const size = isSelected ? 104 : 80;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d")!;

        context.clearRect(0, 0, size, size);

        const center = size / 2;
        const hexColor = "#" + color.toString(16).padStart(6, "0");

        if (isSelected) {
            context.strokeStyle = "#ffd700";
            context.lineWidth = size / 8;
            context.beginPath();
            context.arc(center, center, size / 2 - size / 16, 0, Math.PI * 2);
            context.stroke();

            context.strokeStyle = "#ffd700";
            context.lineWidth = size / 8;
            context.beginPath();
            context.arc(center, center, size / 4, 0, Math.PI * 2);
            context.stroke();
        } else {
            context.strokeStyle = "#ffff00";
            context.lineWidth = size / 8;
            context.beginPath();
            context.arc(center, center, size / 2 - size / 16, 0, Math.PI * 2);
            context.stroke();

            context.strokeStyle = "#ffff00";
            context.lineWidth = size / 8;
            context.beginPath();
            context.arc(center, center, size / 4, 0, Math.PI * 2);
            context.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        textureCache.set(cacheKey, texture);

        return texture;
    }

    public update(): void {
        const worldPos = this.mapView.projection.projectPoint(
            this.geoPosition,
            new THREE.Vector3()
        );
        this.position.copy(worldPos);
    }

    public updateVisuals(): void {
        let displayColor = this.baseColor;

        if (this.isSelected) {
            displayColor = 0x00ff00;
        }

        const oldMaterial = this.spriteMaterial;
        this.spriteMaterial = this.createSpriteMaterial(displayColor, this.isSelected);
        this.sprite.material = this.spriteMaterial;

        if (oldMaterial) {
            oldMaterial.dispose();
        }

        if (this.ringMesh) {
            (this.ringMesh.material as THREE.MeshBasicMaterial).opacity = this.isSelected ? 0.8 : 0;
        }
    }

    public setSelected(selected: boolean): void {
        if (this.isSelected !== selected) {
            this.isSelected = selected;
            this.updateVisuals();
        }
    }

    public getSelected(): boolean {
        return this.isSelected;
    }

    public setConfig(config: Partial<TerrainControlPointConfig>): void {
        this.config = { ...this.config, ...config };
        this.baseColor = this.getBrushColor(this.config.brushType || "raise");
        this.updateVisuals();
    }

    public getConfig(): TerrainControlPointConfig {
        return { ...this.config };
    }

    public moveTo(newPosition: GeoCoordinates): void {
        this.geoPosition = new GeoCoordinates(
            newPosition.latitude,
            newPosition.longitude,
            newPosition.altitude || this.geoPosition.altitude
        );
        this.update();
    }

    public dispose(): void {
        if (this.spriteMaterial) {
            this.spriteMaterial.dispose();
        }

        if (this.ringMesh) {
            this.ringMesh.geometry.dispose();
            (this.ringMesh.material as THREE.MeshBasicMaterial).dispose();
        }

        this.removeFromParent();

        this.mapView.removeEventListener(
            MapViewEventNames.CameraPositionChanged,
            this.onCameraPositionChanged
        );
    }
}

export const clearControlPointTextureCache = (): void => {
    textureCache.forEach(texture => {
        texture.dispose();
    });
    textureCache.clear();
};
