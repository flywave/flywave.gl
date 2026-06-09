import * as THREE from "three";

interface ExplodePart {
    wrapper: THREE.Group;
    targetOffset: THREE.Vector3;
}

export class ExplodeView {
    private parts: ExplodePart[] = [];
    private progress = 0;
    private targetProgress = 0;
    private animating = false;

    constructor(private model: THREE.Object3D, spreadFactor = 0.5) {
        this.analyzeParts(spreadFactor);
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

    private analyzeParts(spreadFactor: number) {
        this.model.updateMatrixWorld(true);
        const root = this.findExplodableRoot(this.model);
        const children = [...root.children];

        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const useZ = size.z >= size.x;
        const axisLength = Math.max(useZ ? size.z : size.x, 1);
        const spread = axisLength * spreadFactor;

        children.forEach(child => {
            const wrapper = new THREE.Group();
            root.remove(child);
            wrapper.add(child);
            root.add(wrapper);

            const childBox = new THREE.Box3().setFromObject(child);
            const childCenter = new THREE.Vector3();
            childBox.getCenter(childCenter);

            const centerVal = useZ ? childCenter.z : childCenter.x;
            const minVal = useZ ? box.min.z : box.min.x;
            const t = (centerVal - minVal) / axisLength;
            const direction = t < 0.5 ? -1 : 1;
            const distance = Math.abs(t - 0.5) * 2;

            this.parts.push({
                wrapper,
                targetOffset: new THREE.Vector3(
                    useZ ? 0 : direction * spread * distance,
                    0,
                    useZ ? direction * spread * distance : 0
                )
            });
        });
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
