import { ShaderMaterial, Texture, UniformsLib, UniformsUtils, Vector3 } from "three";

import fragmentShader from "./shaders/fragment.glsl";
import vertexShader from "./shaders/vertex.glsl";

export interface ColorStep {
    color: Vector3;
    altitude: number;
}

export interface StylingOptions {
    colorSteps?: ColorStep[];
    texture?: Texture | null;
    textureIntensity?: number;
    lightVector?: Vector3;
    opacity?: number;
}

export type DecodedTile = any;

export class ElevationMaterial extends ShaderMaterial {
    constructor(decodedTile: DecodedTile, stylingOptions?: StylingOptions) {
        const options: Required<StylingOptions> = {
            colorSteps: stylingOptionsDefaults.colorSteps,
            texture: stylingOptionsDefaults.texture,
            textureIntensity: stylingOptionsDefaults.textureIntensity,
            lightVector: stylingOptionsDefaults.lightVector,
            opacity: stylingOptionsDefaults.opacity,
            ...stylingOptions
        };

        const sortedColorSteps = [...options.colorSteps].sort((a, b) => a.altitude - b.altitude);
        const colors = sortedColorSteps.map(item => item.color);
        const altitudes = sortedColorSteps.map(item => item.altitude);

        const uniforms = UniformsUtils.merge([
            {
                useOctNormal: { value: ElevationMaterial.containsOctNormals(decodedTile) },
                colorSteps: { value: colors },
                altitudeSteps: { value: altitudes },
                textureIntensity: { value: options.textureIntensity },
                hasTexture: { value: options.texture ? 1 : 0 },
                texture: { value: options.texture },
                lightVector: { value: options.lightVector },
                opacity: { value: options.opacity }
            },
            UniformsLib.fog
        ]);

        super({
            vertexShader: vertexShader(),
            fragmentShader: fragmentShader({
                COLOR_STEPS_COUNT: sortedColorSteps.length
            }),
            uniforms
        });
    }

    static containsOctNormals(decodedTile: DecodedTile): boolean {
        const geometry = decodedTile.geometries[0];
        return geometry.vertexAttributes.some(this.isOctNormalAttribute);
    }

    static isOctNormalAttribute(attribute: { name: string }): boolean {
        return attribute.name === "octNormal";
    }
}

const stylingOptionsDefaults: Required<StylingOptions> = {
    colorSteps: [
        {
            color: new Vector3(0, 0, 0),
            altitude: -300
        },
        {
            color: new Vector3(1, 1, 1),
            altitude: 8848
        }
    ],
    texture: null,
    textureIntensity: 0.4,
    lightVector: new Vector3(1.0, 0.0, 0.5),
    opacity: 1
};
