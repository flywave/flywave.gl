// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
import { Fn, fwidth, If, smoothstep, uniform, vec4 } from "three/tsl";
import { TempNode } from "three/webgpu";
import { getAtmosphereContext } from "./AtmosphereContext";
import { getSolarLuminance } from "./runtime";
export class SunNode extends TempNode {
    static get type() {
        return "SunNode";
    }
    constructor() {
        super("vec4");
        this.rayDirectionECEF = null;
        this.angularRadius = uniform(0.004675); // ≈ 16 arcminutes
        this.intensity = uniform(1);
    }
    setup(builder) {
        const atmosphereContext = getAtmosphereContext(builder);
        const { rayDirectionECEF } = this;
        if (rayDirectionECEF == null) {
            return;
        }
        const { sunDirectionECEF } = atmosphereContext;
        return Fn(() => {
            // See: https://github.com/takram-design-engineering/three-geospatial/issues/110#issuecomment-4363786179
            const cosAngularRadius = uniform("float").onFrameUpdate(() => Math.cos(this.angularRadius.value));
            const chordThreshold = cosAngularRadius.oneMinus().mul(2);
            const chordVector = rayDirectionECEF.sub(sunDirectionECEF);
            const chordLength = chordVector.dot(chordVector);
            const filterWidth = fwidth(chordLength);
            const luminance = vec4(0).toVar();
            If(chordLength.lessThan(chordThreshold), () => {
                const antialias = smoothstep(chordThreshold, chordThreshold.sub(filterWidth), chordLength);
                luminance.assign(vec4(getSolarLuminance().mul(this.intensity), antialias));
            });
            return luminance;
        })();
    }
}
//# sourceMappingURL=SunNode.js.map