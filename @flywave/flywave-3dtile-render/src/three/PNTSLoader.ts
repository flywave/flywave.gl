import { PNTSLoaderBase } from "../base/PNTSLoaderBase";
import {
    Points,
    PointsMaterial,
    BufferGeometry,
    BufferAttribute,
    DefaultLoadingManager,
    LoadingManager
} from "three";
import { BatchTableHeader, FeatureComponentType, FeatureType } from "../utilities/FeatureTable";
import { TileGLTF } from "../base/LoaderBase";

export class PNTSLoader<
    BatchTableExtensions extends BatchTableHeader
> extends PNTSLoaderBase<BatchTableExtensions> {
    public manager: LoadingManager;

    constructor(manager: LoadingManager = DefaultLoadingManager) {
        super();
        this.manager = manager;
    }

    public parse(buffer: ArrayBuffer): Promise<TileGLTF> {
        return super.unpack(buffer).then(result => {
            const { featureTable } = result;

            const POINTS_LENGTH = featureTable.getData("POINTS_LENGTH") as number;
            const POSITION = featureTable.getData(
                "POSITION",
                POINTS_LENGTH,
                FeatureComponentType.FLOAT,
                FeatureType.VEC3
            ) as Float32Array;
            const RGB = featureTable.getData(
                "RGB",
                POINTS_LENGTH,
                FeatureComponentType.UNSIGNED_BYTE,
                FeatureType.VEC3
            ) as Uint8Array;

            const unsupportedFeatures = [
                "RTC_CENTER",
                "QUANTIZED_VOLUME_OFFSET",
                "QUANTIZED_VOLUME_SCALE",
                "CONSTANT_RGBA",
                "BATCH_LENGTH",
                "POSITION_QUANTIZED",
                "RGBA",
                "RGB565",
                "NORMAL",
                "NORMAL_OCT16P"
            ];

            unsupportedFeatures.forEach(feature => {
                if (feature in featureTable.header) {
                    console.warn(
                        `PNTSLoader: Unsupported FeatureTable feature "${feature}" detected.`
                    );
                }
            });

            const geometry = new BufferGeometry();
            geometry.setAttribute("position", new BufferAttribute(POSITION, 3, false));

            const material = new PointsMaterial({
                size: 2,
                sizeAttenuation: false,
                vertexColors: RGB !== null
            });

            if (RGB !== null) {
                const normalizedColors = new Float32Array(RGB.length);
                for (let i = 0; i < RGB.length; i++) {
                    normalizedColors[i] = RGB[i] / 255.0;
                }
                geometry.setAttribute("color", new BufferAttribute(normalizedColors, 3, true));
            }

            const points = new Points(geometry, material);

            const rtcCenter = featureTable.getData("RTC_CENTER") as number[] | undefined;
            if (rtcCenter) {
                points.position.x += rtcCenter[0];
                points.position.y += rtcCenter[1];
                points.position.z += rtcCenter[2];
            }

            return {
                scene: points
            } as unknown as TileGLTF;
        });
    }
}
