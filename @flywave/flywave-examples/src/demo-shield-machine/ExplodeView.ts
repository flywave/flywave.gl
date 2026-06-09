import * as THREE from "three";

interface ExplodePart {
    wrapper: THREE.Group;
    targetOffset: THREE.Vector3;
}

export type ExplodeMode = "axial" | "radial";

export class ExplodeView {
    private parts: ExplodePart[] = [];
    private axialOffsets: THREE.Vector3[] = [];
    private radialOffsets: THREE.Vector3[] = [];
    private progress = 0;
    private targetProgress = 0;
    private animating = false;
    private currentMode: ExplodeMode = "axial";

    constructor(private model: THREE.Object3D, private spreadFactor = 0.5) {
        this.analyzeParts();
    }

    private findExplodableRoot(obj: THREE.Object3D): THREE.Object3D {
        let current = obj;
        let child = current.children[0];
        while (child && child.children.length > current.children.length) {
            current = child;
            child = current.children[0];
        }
        return current;
    }

    private analyzeParts() {
        this.model.updateMatrixWorld(true);
        const root = this.findExplodableRoot(this.model);
        const children = [...root.children];

        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const useZ = size.z >= size.x;
        const axisLength = Math.max(useZ ? size.z : size.x, 1);
        const spread = axisLength * this.spreadFactor;

        children.forEach(child => {
            const wrapper = new THREE.Group();
            root.remove(child);
            wrapper.add(child);
            root.add(wrapper);

            const pos = child.position.clone();

            const centerVal = useZ ? pos.z : pos.x;
            const minVal = useZ ? box.min.z : box.min.x;
            const t = (centerVal - minVal) / axisLength;
            const dir = t < 0.5 ? -1 : 1;
            const dist = Math.abs(t - 0.5) * 2;

            this.axialOffsets.push(
                new THREE.Vector3(useZ ? 0 : dir * spread * dist, 0, useZ ? dir * spread * dist : 0)
            );

            const radialDir = new THREE.Vector3(0, pos.y, pos.z);
            const radialDist = radialDir.length();
            if (radialDist > 0.01) {
                radialDir.divideScalar(radialDist);
            } else {
                radialDir.set(0, 1, 0);
            }
            this.radialOffsets.push(radialDir.multiplyScalar(radialDist * this.spreadFactor));

            this.parts.push({
                wrapper,
                targetOffset: new THREE.Vector3()
            });
        });

        this.syncOffsets();
    }

    private syncOffsets() {
        const offsets = this.currentMode === "axial" ? this.axialOffsets : this.radialOffsets;
        for (let i = 0; i < this.parts.length; i++) {
            this.parts[i].targetOffset.copy(offsets[i]);
        }
    }

    setMode(mode: ExplodeMode) {
        this.currentMode = mode;
        this.syncOffsets();
        if (this.progress > 0) {
            this.applyProgress();
        }
    }

    get mode() {
        return this.currentMode;
    }

    explode() {
        this.targetProgress = 1;
        this.startAnimation();
    }

    collapse() {
        this.targetProgress = 0;
        this.startAnimation();
    }

    toggle() {
        this.targetProgress > 0 ? this.collapse() : this.explode();
    }

    get isExploded() {
        return this.progress >= 0.999;
    }

    private startAnimation() {
        if (this.animating) return;
        this.animating = true;
        this.animate();
    }

    private animate() {
        if (!this.animating) return;

        const step = 1 / 1.5 / 60;
        if (Math.abs(this.progress - this.targetProgress) < 0.002) {
            this.progress = this.targetProgress;
            this.applyProgress();
            this.animating = false;
            return;
        }
        this.progress += this.targetProgress > this.progress ? step : -step;
        this.progress = THREE.MathUtils.clamp(this.progress, 0, 1);
        this.applyProgress();

        requestAnimationFrame(() => this.animate());
    }

    private applyProgress() {
        for (const part of this.parts) {
            part.wrapper.position.set(
                part.targetOffset.x * this.progress,
                part.targetOffset.y * this.progress,
                part.targetOffset.z * this.progress
            );
        }
    }
}
