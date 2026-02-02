/* Copyright (C) 2025 flywave.gl contributors */

import { BrushType } from "@flywave/flywave-terrain-datasource";
import { type MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";

export class BrushPreview extends THREE.Group {
    private mapView: MapView;
    private ringMesh: THREE.Mesh;
    private centerMarker: THREE.Mesh;
    private currentRadius: number = 50;
    private currentBrushType: BrushType = BrushType.RAISE;

    private readonly brushColors: Record<BrushType, number> = {
        [BrushType.RAISE]: 0x00ff00,
        [BrushType.LOWER]: 0xff0000,
        [BrushType.SMOOTH]: 0x0088ff,
        [BrushType.FLATTEN]: 0xffff00,
        [BrushType.NOISE]: 0x8800ff,
        [BrushType.ERODE]: 0xff8800
    };

    constructor(mapView: MapView) {
        super();
        this.mapView = mapView;
        this.createMeshes();
        this.updateColor();
        this.visible = false;
    }

    private createMeshes(): void {
        const ringGeometry = new THREE.RingGeometry(0, 1, 64);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: this.brushColors[BrushType.RAISE],
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });

        this.ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
        this.ringMesh.rotation.x = Math.PI / 2;
        this.ringMesh.renderOrder = 1000;
        this.add(this.ringMesh);

        const centerGeometry = new THREE.CircleGeometry(0.05, 32);
        const centerMaterial = new THREE.MeshBasicMaterial({
            color: this.brushColors[BrushType.RAISE],
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });

        this.centerMarker = new THREE.Mesh(centerGeometry, centerMaterial);
        this.centerMarker.rotation.x = Math.PI / 2;
        this.centerMarker.renderOrder = 1001;
        this.add(this.centerMarker);
    }

    update(mouseEvent: MouseEvent): void {
        const worldPos = this.getWorldPositionFromMouse(mouseEvent);
        if (!worldPos) {
            this.visible = false;
            return;
        }

        this.visible = true;
        this.position.copy(worldPos);
        this.updateScale();
    }

    setRadius(radius: number): void {
        this.currentRadius = radius;
        this.updateScale();
    }

    setBrushType(type: BrushType): void {
        this.currentBrushType = type;
        this.updateColor();
    }

    private updateColor(): void {
        const color = this.brushColors[this.currentBrushType];

        const ringMaterial = this.ringMesh.material as THREE.MeshBasicMaterial;
        ringMaterial.color.setHex(color);

        const centerMaterial = this.centerMarker.material as THREE.MeshBasicMaterial;
        centerMaterial.color.setHex(color);
    }

    private updateScale(): void {
        const scale = this.currentRadius;
        this.ringMesh.scale.set(scale, scale, 1);
    }

    private getWorldPositionFromMouse(mouseEvent: MouseEvent): THREE.Vector3 | null {
        const canvas = this.mapView.canvas;
        const rect = canvas.getBoundingClientRect();
        const x = mouseEvent.clientX - rect.left;
        const y = mouseEvent.clientY - rect.top;

        const mousePoint = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePoint, this.mapView.camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();

        if (raycaster.ray.intersectPlane(plane, intersection)) {
            return intersection;
        }

        return null;
    }
}
