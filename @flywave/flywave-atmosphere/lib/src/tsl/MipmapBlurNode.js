// @ts-nocheck
import { add, uv, vec2, vec4 } from "three/tsl";
import invariant from "tiny-invariant";
import { DualMipmapFilterNode } from "./DualMipmapFilterNode";
export const mipmapBlurDownsample = (inputNode, texelSize) => {
    const center = uv();
    const offset1 = vec4(1, 1, -1, -1).mul(texelSize.xyxy).add(center.xyxy).toVertexStage();
    const offset2 = vec4(2, 2, -2, -2).mul(texelSize.xyxy).add(center.xyxy).toVertexStage();
    const uv01 = offset1.zy; // -1, 1
    const uv02 = offset1.xy; // 1, 1
    const uv03 = offset1.zw; // -1, -1
    const uv04 = offset1.xw; // 1, -1
    const uv05 = vec2(center.x, offset2.y); // 0, 2
    const uv06 = vec2(offset2.z, center.y); // -2, 0
    const uv07 = vec2(offset2.x, center.y); // 2, 0
    const uv08 = vec2(center.x, offset2.w); // 0, -2
    const uv09 = offset2.zy; // -2, 2
    const uv10 = offset2.xy; // 2, 2
    const uv11 = offset2.zw; // -2, -2
    const uv12 = offset2.xw; // 2, -2
    return add(add(inputNode.sample(center), inputNode.sample(uv01), inputNode.sample(uv02), inputNode.sample(uv03), inputNode.sample(uv04)).mul(1 / 8), add(inputNode.sample(uv05), inputNode.sample(uv06), inputNode.sample(uv07), inputNode.sample(uv08)).mul(1 / 16), add(inputNode.sample(uv09), inputNode.sample(uv10), inputNode.sample(uv11), inputNode.sample(uv12)).mul(1 / 32));
};
export const mipmapBlurUpsample = (inputNode, texelSize) => {
    const center = uv();
    const offset = vec4(1, 1, -1, -1).mul(texelSize.xyxy).add(center.xyxy).toVertexStage();
    const uv1 = vec2(center.x, offset.y); // 0, 1
    const uv2 = vec2(offset.z, center.y); // -1, 0
    const uv3 = vec2(offset.x, center.y); // 1, 0
    const uv4 = vec2(center.x, offset.w); // 0, -1
    const uv5 = offset.zy; // -1, 1
    const uv6 = offset.xy; // 1, 1
    const uv7 = offset.zw; // -1, -1
    const uv8 = offset.xw; // 1, -1
    return add(inputNode.sample(center).mul(0.25), add(inputNode.sample(uv1), inputNode.sample(uv2), inputNode.sample(uv3), inputNode.sample(uv4)).mul(0.125), add(inputNode.sample(uv5), inputNode.sample(uv6), inputNode.sample(uv7), inputNode.sample(uv8)).mul(0.0625));
};
// Implementation of Sledgehammer Games' temporary-stable bloom blur.
// See: https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/
export class MipmapBlurNode extends DualMipmapFilterNode {
    static get type() {
        return "MipmapBlurNode";
    }
    constructor(inputNode, levels = 4) {
        super(inputNode, levels);
        this.resolutionScale = 0.5;
    }
    setupDownsampleNode(builder) {
        const { inputNode } = this;
        invariant(inputNode != null, "inputNode cannot be null during setup.");
        return mipmapBlurDownsample(inputNode, this.inputTexelSize);
    }
    setupUpsampleNode(builder) {
        const { inputNode } = this;
        invariant(inputNode != null, "inputNode cannot be null during setup.");
        return mipmapBlurUpsample(inputNode, this.inputTexelSize);
    }
}
export const mipmapBlur = (...args) => new MipmapBlurNode(...args);
//# sourceMappingURL=MipmapBlurNode.js.map