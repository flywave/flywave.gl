/*
 * §734: unit coverage for the model color-theme LUT gating and the packed
 * LUT layout invariant that the GPU 8-tap port (§727) depends on.
 * Pure CPU — no GL, no tiles.
 */
import { expect } from "chai";
import * as THREE from "three";
import { applyColorTheme, ColorThemeLut } from "../src/MBColorTheme";
import { applyMeshFeatures } from "../src/MBMeshFeatures";

/** Synthetic N-cube LUT with the MBColorTheme packing: data index =
 * (r + g·N² + b·N)·4 over an N²×N image → texel (r + g·N, b). */
function makeSwapLut(n: number): ColorThemeLut {
    const data = new Uint8ClampedArray(n * n * n * 4);
    const at = (r: number, g: number, b: number): number => (r + g * n * n + b * n) * 4;
    for (let b = 0; b < n; b++) {
        for (let g = 0; g < n; g++) {
            for (let r = 0; r < n; r++) {
                // channel-swap table: red↔blue — unambiguous vs identity
                data[at(r, g, b)] = b * 255 / (n - 1);
                data[at(r, g, b) + 1] = g * 255 / (n - 1);
                data[at(r, g, b) + 2] = r * 255 / (n - 1);
                data[at(r, g, b) + 3] = 255;
            }
        }
    }
    return { data, n };
}

describe("MBColorTheme LUT packing (GPU-port invariant, §727)", () => {
    const lut = makeSwapLut(2);

    it("applyColorTheme at lattice points reads texel (r + g·N² + b·N)", () => {
        // pure red (255,0,0) → r=1,g=0,b=0 → swapped texel = (0,0,255)
        expect(applyColorTheme(lut, "rgb(255, 0, 0)")).to.equal("rgb(0, 0, 255)");
        // pure blue → (b=1 first channel) = (255,0,0)
        expect(applyColorTheme(lut, "rgb(0, 0, 255)")).to.equal("rgb(255, 0, 0)");
        // half-green: g=0.5·(N−1)=0.5 → lerp between g0/g1 slices
        const mid = applyColorTheme(lut, "rgb(0, 128, 0)");
        expect(mid).to.match(/^rgb\(\d+, \d+, \d+\)$/);
    });

    it("applyColorTheme preserves alpha in rgba form", () => {
        expect(applyColorTheme(lut, "rgba(255, 0, 0, 0.5)")).to.equal("rgba(0, 0, 255, 0.5)");
    });
});

describe("applyMeshFeatures model-color-use-theme gating (§734)", () => {
    const Z = 16;
    function featureMesh(): THREE.Mesh {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(
            new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
        // V1 4444: low u16 = part id, high u16 = color (colorShift=16).
        // color 0xFFF0 (white, alpha 0) + part 0 → u32 = (0xFFF0 << 16) | 0.
        const u32 = (0xfff0 << 16) | 0;
        const feat = new Uint16Array([u32 & 0xffff, (u32 >>> 16) & 0xffff]);
        geo.setAttribute("_feature_rgba4444", new THREE.BufferAttribute(feat, 2));
        geo.setIndex([0, 1, 2]);
        return new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    }
    const dsLut = { m_colorThemeLut: makeSwapLut(2), m_environment: {} };
    const dsPlain = { m_environment: {} };

    function bakedColor(paint: Record<string, unknown>, ds: any): THREE.BufferAttribute | null {
        const root = new THREE.Object3D();
        const mesh = featureMesh();
        root.add(mesh);
        applyMeshFeatures(root, paint as any, Z, ds);
        let found: THREE.BufferAttribute | null = null;
        root.traverse(o => {
            const m = o as THREE.Mesh;
            if (m.isMesh && m.userData?.__mbPart === 0) {
                found = m.geometry.getAttribute("color") as THREE.BufferAttribute;
            }
        });
        return found;
    }

    it("mix=1 paint rewrites the vertex color (no LUT in style)", () => {
        const attr = bakedColor({ "model-color": "red", "model-color-mix-intensity": 1 }, dsPlain);
        // red → srgbToLinear(1.0) = 1.0 on the r channel
        expect(attr!.array[0]).to.be.closeTo(1.0, 1e-3);
        expect(attr!.array[1]).to.equal(0);
    });

    it("use-theme default applies the LUT to the baked color", () => {
        const attr = bakedColor({ "model-color": "red", "model-color-mix-intensity": 1 }, dsLut);
        // red themed through the swap LUT = blue → linear b = 1.0
        expect(attr!.array[2]).to.be.closeTo(1.0, 1e-3);
        expect(attr!.array[0]).to.equal(0);
    });

    it("use-theme 'none' skips the LUT (mgl drawMesh:241)", () => {
        const attr = bakedColor({
            "model-color": "red", "model-color-mix-intensity": 1,
            "model-color-use-theme": "none",
        }, dsLut);
        expect(attr!.array[0]).to.be.closeTo(1.0, 1e-3);
        expect(attr!.array[2]).to.equal(0);
    });
});
