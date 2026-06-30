// @ts-nocheck
import { luminance, smoothstep, uniform, vec4 } from "three/tsl";
import invariant from "tiny-invariant";
import { mipmapBlurDownsample } from "./MipmapBlurNode";
import { SingleFilterNode } from "./SingleFilterNode";
export class DownsampleThresholdNode extends SingleFilterNode {
    constructor() {
        super(...arguments);
        this.resolutionScale = 0.5;
        this.thresholdLevel = uniform(5);
        this.thresholdRange = uniform(1);
    }
    static get type() {
        return "DownsampleThresholdNode";
    }
    setupOutputNode(builder) {
        const { inputNode, thresholdLevel, thresholdRange, inputTexelSize } = this;
        invariant(inputNode != null, "inputNode cannot be null during setup.");
        const outputColor = mipmapBlurDownsample(inputNode, inputTexelSize);
        const outputLuminance = luminance(outputColor.rgb);
        const scale = smoothstep(thresholdLevel, thresholdLevel.add(thresholdRange), outputLuminance);
        return vec4(outputColor.rgb, outputLuminance).mul(scale);
    }
}
export const downsampleThreshold = (...args) => new DownsampleThresholdNode(...args);
//# sourceMappingURL=DownsampleThresholdNode.js.map