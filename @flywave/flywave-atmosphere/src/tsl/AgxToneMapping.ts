// @ts-nocheck
import type { ToneMapping } from "three";
import { add, cdl, float, mat3, vec3 } from "three/tsl";

import { FnLayout } from "./FnLayout";
import { FnVar as FnVarFn } from "./FnVar";
import type { Node } from "./node";

const LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
    vec3(1.6605, -0.1246, -0.0182),
    vec3(-0.5876, 1.1329, -0.1006),
    vec3(-0.0728, -0.0083, 1.1187)
);

const LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
    vec3(0.6274, 0.0691, 0.0164),
    vec3(0.3293, 0.9195, 0.088),
    vec3(0.0433, 0.0113, 0.8956)
);

const approximateDefaultContrast = FnVarFn((x: Node) => {
    const x2 = x.pow2().toConst();
    const x4 = x2.pow2().toConst();
    return add(
        x4.mul(x2).mul(15.5),
        x4.mul(x).mul(-40.14),
        x4.mul(31.96),
        x2.mul(x).mul(-6.868),
        x2.mul(0.4298),
        x.mul(0.1191),
        -0.00232
    );
});

const insetMatrix = mat3(
    vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
    vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
    vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859)
);

const outsetMatrix = mat3(
    vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
    vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
    vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405)
);

const minEv = -12.47393;
const maxEv = 4.026069;

const agx = FnLayout({
    name: "agx",
    type: "vec3",
    inputs: [
        { name: "color", type: "vec3" },
        { name: "exposure", type: "float" }
    ]
})(([color, exposure]) => {
    const value = color.toVar();
    value.mulAssign(exposure);
    value.assign(LINEAR_SRGB_TO_LINEAR_REC2020.mul(value));
    value.assign(insetMatrix.mul(value));
    value.assign(value.max(1e-10).log2());
    value.assign(value.sub(minEv).div(float(maxEv).sub(minEv)));
    value.assign(value.saturate());
    value.assign(approximateDefaultContrast(value));
    return value;
});

const agxEOTF = FnLayout({
    name: "agxEOTF",
    type: "vec3",
    inputs: [{ name: "color", type: "vec3" }]
})(([color]) => {
    const value = color.toVar();
    value.assign(outsetMatrix.mul(value));
    value.assign(value.max(0).pow(2.2));
    value.assign(LINEAR_REC2020_TO_LINEAR_SRGB.mul(value));
    value.assign(value.saturate());
    return value;
});

export const agxPunchyToneMapping = FnLayout({
    name: "agxPunchyToneMapping",
    type: "vec3",
    inputs: [
        { name: "color", type: "vec3" },
        { name: "exposure", type: "float" }
    ]
})(([color, exposure]) => {
    const value = color.toVar();
    value.assign(agx(value, exposure.mul(1.5)));
    value.assign(cdl(value, vec3(1), vec3(0), vec3(1.35), float(1.2)));
    value.assign(agxEOTF(value));
    return value;
});

export const AgXPunchyToneMapping = 100 as ToneMapping;
