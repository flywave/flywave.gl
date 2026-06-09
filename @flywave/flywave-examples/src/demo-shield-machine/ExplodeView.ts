import * as THREE from "three";
import { classifyPart } from "./mockData";

export type ExplodeMode = "axial" | "radial";

export interface ExplodePart {
    wrapper: THREE.Group;
    object: THREE.Object3D;
    axialOffset: THREE.Vector3;
    radialOffset: THREE.Vector3;
    transitionStart?: THREE.Vector3;
}

const _worldSphere = new THREE.Sphere();

export class ExplodeView {
    private parts: ExplodePart[] = [];
    private progress = 0;
    private targetProgress = 0;
    private animating = false;
    private _mode: ExplodeMode = "axial";
    private _transitionFrom = 1;
    private sseThreshold = 50;

    constructor(private model: THREE.Object3D, private spreadFactor = 1.0) {
        this.analyzeParts();
    }

    getParts(): ExplodePart[] {
        return this.parts;
    }

    getCutterheadParts(): ExplodePart[] {
        this.model.updateMatrixWorld(true);
        const root = this.findExplodableRoot(this.model);
        return this.parts.filter(p => {
            const localPos = root.worldToLocal(p.object.getWorldPosition(new THREE.Vector3()));
            const sub = classifyPart(p.object.name || "", localPos.z);
            return sub && sub.id === "cutterhead";
        });
    }

    getExplodableRoot(): THREE.Object3D {
        return this.findExplodableRoot(this.model);
    }

    get mode(): ExplodeMode {
        return this._mode;
    }

    get isExploded(): boolean {
        return this.progress >= 0.999;
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

            child.traverse(obj => {
                if ((obj as THREE.Mesh).isMesh) {
                    const mesh = obj as THREE.Mesh;
                    mesh.geometry.computeBoundingSphere();
                }
            });

            const pos = child.position.clone();

            const centerVal = useZ ? pos.z : pos.x;
            const minVal = useZ ? box.min.z : box.min.x;
            const t = (centerVal - minVal) / axisLength;
            const dir = t < 0.5 ? -1 : 1;
            const dist = Math.abs(t - 0.5) * 2;

            const axialOffset = new THREE.Vector3(
                useZ ? 0 : dir * spread * dist,
                0,
                useZ ? dir * spread * dist : 0
            );

            const radialDir = new THREE.Vector3(0, pos.y, pos.z);
            const radialDist = radialDir.length();
            if (radialDist > 0.01) {
                radialDir.divideScalar(radialDist);
            } else {
                radialDir.set(0, 1, 0);
            }
            const radialOffset = radialDir.multiplyScalar(radialDist * this.spreadFactor);

            this.parts.push({
                wrapper,
                object: child,
                axialOffset,
                radialOffset
            });
        });

        this.syncOffsets();
    }

    private syncOffsets() {
        for (const part of this.parts) {
            part.wrapper.position.set(0, 0, 0);
        }
    }

    updateSSECulling(camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
        const height = renderer.domElement.height;
        const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 1;
        const sseDenom = 2.0 * Math.tan((0.5 * fov * Math.PI) / 180);
        const cameraPos = new THREE.Vector3();

        for (const part of this.parts) {
            part.object.traverse(obj => {
                if (!(obj as THREE.Mesh).isMesh) return;
                const mesh = obj as THREE.Mesh;
                const sphere = mesh.geometry.boundingSphere;
                if (!sphere) return;

                _worldSphere.copy(sphere).applyMatrix4(mesh.matrixWorld);
                const distance = Math.abs(_worldSphere.distanceToPoint(cameraPos));
                const sse = (_worldSphere.radius * 2 * height) / (distance * sseDenom);

                mesh.visible = sse >= this.sseThreshold;
            });
        }
    }

    setMode(mode: ExplodeMode) {
        if (this._mode === mode) return;
        this._mode = mode;
        if (this.progress > 0) {
            for (const part of this.parts) {
                part.transitionStart = part.wrapper.position.clone();
            }
            this._transitionFrom = 0;
            this.animating = false;
            this.startAnimation();
        }
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

    private startAnimation() {
        if (this.animating) return;
        this.animating = true;
        this.animate();
    }

    private animate() {
        if (!this.animating) return;

        const transitioning = this._transitionFrom < 1;
        const step = 1 / 1.5 / 60;

        if (!transitioning && Math.abs(this.progress - this.targetProgress) < 0.002) {
            this.progress = this.targetProgress;
            this.applyProgress();
            this.animating = false;
            return;
        }

        if (!transitioning) {
            this.progress += this.targetProgress > this.progress ? step : -step;
            this.progress = THREE.MathUtils.clamp(this.progress, 0, 1);
        }

        this.applyProgress();

        requestAnimationFrame(() => this.animate());
    }

    private applyProgress() {
        const transitioning = this._transitionFrom < 1;
        for (const part of this.parts) {
            const offset = this._mode === "axial" ? part.axialOffset : part.radialOffset;
            const tx = offset.x * this.progress;
            const ty = offset.y * this.progress;
            const tz = offset.z * this.progress;
            if (transitioning && part.transitionStart) {
                part.wrapper.position.lerpVectors(
                    part.transitionStart,
                    new THREE.Vector3(tx, ty, tz),
                    this._transitionFrom
                );
            } else {
                part.wrapper.position.set(tx, ty, tz);
            }
        }
        if (transitioning) {
            this._transitionFrom = THREE.MathUtils.clamp(this._transitionFrom + 1 / 1.5 / 60, 0, 1);
            if (this._transitionFrom >= 1) {
                this.animating = false;
                for (const part of this.parts) {
                    delete part.transitionStart;
                }
            }
        }
    }
}
