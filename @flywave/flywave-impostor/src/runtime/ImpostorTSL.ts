// @ts-nocheck
import {
    Fn,
    uniform,
    texture,
    vec2,
    vec3,
    vec4,
    float,
    dot,
    cross,
    normalize,
    sign,
    abs,
    floor,
    fract,
    clamp,
    min,
    mix,
    ceil,
    varying,
    positionGeometry,
    If,
    Discard
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import * as THREE from "three/webgpu";

export interface ImpostorMaterialOptions {
    frameSize: number;
    scale: number;
    aabbMax: number;
}

export function createImpostorNodeMaterial(
    atlasTexture: THREE.Texture,
    options: ImpostorMaterialOptions
) {
    const { frameSize, scale, aabbMax } = options;

    const uFrames = uniform(new THREE.Vector2(frameSize, frameSize));
    const uScale = uniform(scale);
    const uAabbMax = uniform(aabbMax);
    // Camera position in object space. Set from JS each frame.
    // For standard three.js: defaults to (0,0,10) which works for typical scenes.
    // For RTE: must call updateCamPos() from JS with the real camera direction.
    const uCamPos = uniform(new THREE.Vector3(0, 0, 10));

    const UV = positionGeometry.xy.add(float(0.5));

    const vUv1 = varying(vec2(0), "vImpUv1");
    const vUv2 = varying(vec2(0), "vImpUv2");
    const vUv3 = varying(vec2(0), "vImpUv3");
    const vBW = varying(vec4(0), "vImpBW");

    const VecToSphereOct = Fn(([v]) => {
        const octant = sign(v);
        const sum = dot(v, octant);
        const h = v.div(sum);
        const a = abs(h);
        const folded = vec2(octant.x.mul(float(1).sub(a.z)), octant.z.mul(float(1).sub(a.x)));
        return h.y.lessThan(float(0)).select(folded, h.xz);
    });

    const OctaSphereEnc = Fn(([coord]) => {
        const c2 = coord.sub(float(0.5)).mul(float(2));
        const p = vec3(c2.x, float(0), c2.y);
        const a = abs(p.xz);
        const yVal = float(1).sub(a.x).sub(a.y);
        const folded = sign(p.xz).mul(vec2(float(1).sub(a.y), float(1).sub(a.x)));
        const xz = yVal.lessThan(float(0)).select(folded, p.xz);
        return vec3(xz.x, yVal, xz.y);
    });

    const FrameXYToRay = Fn(([frame, fm]) => normalize(OctaSphereEnc(frame.div(fm))));

    const SpriteProjection = Fn(([dir, size, locUv]) => {
        const z = normalize(dir);
        const up0 = vec3(0, 1, 0);
        const up = z.y.abs().greaterThan(float(0.999)).select(vec3(0, 0, -1), up0);
        const x = normalize(cross(up, z));
        const y = normalize(cross(x, z));
        const adj = locUv.sub(vec2(0.5)).mul(float(2));
        const halfSize = size.mul(float(0.5));
        return x.mul(adj.x.mul(halfSize.x)).add(y.mul(adj.y.mul(halfSize.y)));
    });

    const QuadBlendWeights = Fn(([c]) =>
        vec4(
            min(float(1).sub(c.x), float(1).sub(c.y)),
            abs(c.x.sub(c.y)),
            min(c.x, c.y),
            ceil(c.x.sub(c.y))
        )
    );

    const vertFn = Fn(() => {
        const fm = uFrames.sub(vec2(1));
        const camPosOS = uCamPos;
        const pivotDir = normalize(camPosOS);

        let grid = VecToSphereOct(pivotDir);
        grid = clamp(grid.add(float(1)).mul(float(0.5)), vec2(0), vec2(1));
        grid = grid.mul(fm);
        grid = clamp(grid, vec2(0), fm);
        const gridFloor = min(floor(grid), fm);
        const gridFract = fract(grid);

        const sz = vec2(float(2)).mul(uScale);
        const projected = SpriteProjection(pivotDir, sz, UV);

        const bw = QuadBlendWeights(gridFract);
        const vF1 = gridFloor;
        const vF2 = clamp(vF1.add(mix(vec2(0, 1), vec2(1, 0), bw.w)), vec2(0), fm);
        const vF3 = clamp(vF1.add(vec2(1)), vec2(0), fm);

        const quadSize = vec2(float(1)).div(uFrames);
        vUv1.assign(clamp(quadSize.mul(vF1.add(UV)), vec2(0), vec2(1)));
        vUv2.assign(clamp(quadSize.mul(vF2.add(UV)), vec2(0), vec2(1)));
        vUv3.assign(clamp(quadSize.mul(vF3.add(UV)), vec2(0), vec2(1)));
        vBW.assign(bw);

        const finalPos = projected.add(pivotDir.mul(uAabbMax));
        return finalPos;
    });

    const fragFn = Fn(() => {
        const c1 = texture(atlasTexture, vUv1);
        const c2 = texture(atlasTexture, vUv2);
        const c3 = texture(atlasTexture, vUv3);
        const col = c1.mul(vBW.x).add(c2.mul(vBW.y)).add(c3.mul(vBW.z));
        const brightness = col.r.add(col.g).add(col.b);
        If(brightness.lessThan(float(0.02)), () => {
            Discard();
        });
        return col.rgb;
    });

    const material = new MeshBasicNodeMaterial();
    material.positionNode = vertFn();
    material.colorNode = fragFn();
    material.transparent = true;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;

    return { material, camPosUniform: uCamPos };
}
