import { FeatureIndex, QParams3d } from "../common";

export interface PointCloudArgs {
    positions: Uint8Array | Uint16Array | Float32Array;
    qparams: QParams3d;
    colors: Uint8Array;
    features: FeatureIndex;
    voxelSize: number;
    colorFormat: "bgr" | "rgb";
}
