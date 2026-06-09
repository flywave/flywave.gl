import * as THREE from "three";
import { type ExplodePart } from "./ExplodeView";

const DEFAULT_OPACITY = 1;
const FOCUS_OPACITY = 0.15;
const FOCUS_EMISSIVE_COLOR = new THREE.Color(0x4488ff);
const FOCUS_EMISSIVE_INTENSITY = 0.6;

interface OriginalMaterialState {
    transparent: boolean;
    opacity: number;
    depthWrite: boolean;
    emissive: THREE.Color;
    emissiveIntensity: number;
}

export class ModelHighlighter {
    private parts: ExplodePart[] = [];
    private storedMaterials = new Map<THREE.Mesh, OriginalMaterialState>();
    private _focusedPart: ExplodePart | null = null;
    private getRaycaster: ((x: number, y: number) => THREE.Raycaster) | null = null;

    constructor(parts: ExplodePart[]) {
        this.parts = parts;
    }

    setRaycasterProvider(provider: (x: number, y: number) => THREE.Raycaster) {
        this.getRaycaster = provider;
    }

    get isFocused(): boolean {
        return this._focusedPart !== null;
    }

    get focusedPart(): ExplodePart | null {
        return this._focusedPart;
    }

    focus(part: ExplodePart) {
        if (this._focusedPart === part) return;
        this.restore();
        this._focusedPart = part;
        this.applyFocus();
    }

    unfocus() {
        if (!this._focusedPart) return;
        this.restore();
    }

    toggleFocus(part: ExplodePart) {
        if (this._focusedPart === part) {
            this.unfocus();
        } else {
            this.focus(part);
        }
    }

    hitTest(x: number, y: number): ExplodePart | null {
        if (!this.getRaycaster) return null;
        const raycaster = this.getRaycaster(x, y);
        let closest: { part: ExplodePart; distance: number } | null = null;
        for (const part of this.parts) {
            const intersects = raycaster.intersectObject(part.wrapper, true);
            if (intersects.length > 0 && (!closest || intersects[0].distance < closest.distance)) {
                closest = { part, distance: intersects[0].distance };
            }
        }
        return closest?.part ?? null;
    }

    private storeOriginal(mesh: THREE.Mesh, mat: THREE.MeshStandardMaterial) {
        if (!this.storedMaterials.has(mesh)) {
            this.storedMaterials.set(mesh, {
                transparent: mat.transparent,
                opacity: mat.opacity,
                depthWrite: mat.depthWrite,
                emissive: mat.emissive.clone(),
                emissiveIntensity: mat.emissiveIntensity
            });
        }
    }

    private applyFocus() {
        for (const part of this.parts) {
            part.object.traverse(obj => {
                if (!(obj as THREE.Mesh).isMesh) return;
                const mesh = obj as THREE.Mesh;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

                for (const mat of materials) {
                    if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
                    this.storeOriginal(mesh, mat);

                    if (part === this._focusedPart) {
                        mat.transparent = false;
                        mat.opacity = DEFAULT_OPACITY;
                        mat.depthWrite = true;
                        mat.emissive.copy(FOCUS_EMISSIVE_COLOR);
                        mat.emissiveIntensity = FOCUS_EMISSIVE_INTENSITY;
                    } else {
                        mat.transparent = true;
                        mat.opacity = FOCUS_OPACITY;
                        mat.depthWrite = false;
                        mat.emissive.set(0x000000);
                        mat.emissiveIntensity = 0;
                    }
                    mat.needsUpdate = true;
                }
            });
        }
    }

    private restore() {
        this._focusedPart = null;
        this.storedMaterials.forEach((orig, mesh) => {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of materials) {
                if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
                mat.transparent = orig.transparent;
                mat.opacity = orig.opacity;
                mat.depthWrite = orig.depthWrite;
                mat.emissive.copy(orig.emissive);
                mat.emissiveIntensity = orig.emissiveIntensity;
                mat.needsUpdate = true;
            }
        });
        this.storedMaterials.clear();
    }

    dispose() {
        this.restore();
        this.parts = [];
    }
}
