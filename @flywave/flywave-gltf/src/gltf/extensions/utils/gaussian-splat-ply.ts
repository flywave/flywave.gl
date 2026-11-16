/* Copyright (C) 2025 flywave.gl contributors */

import type {
    GLTFAccessorPostprocessed,
    GLTFMeshPrimitivePostprocessed
} from "../../types/gltf-postprocessed-schema";

const ATTRIBUTE_PREFIX = "KHR_gaussian_splatting:";
const SH_C0 = 0.2820947917738781;
const MAX_OPACITY_LOGIT = 20;
const MIN_LOG_SCALE = -30;

function linearToSrgb(value: number): number {
    return value < 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 0.41666) - 0.055;
}

function findAttribute(
    primitive: GLTFMeshPrimitivePostprocessed,
    name: string
): GLTFAccessorPostprocessed | undefined {
    const attributes = primitive.attributes;
    return attributes[name] ?? attributes[ATTRIBUTE_PREFIX + name] ?? attributes["_" + name];
}

function signedMax(componentType: number): number {
    return componentType === 5120 ? 127 : 32767;
}

function unsignedMax(componentType: number): number {
    switch (componentType) {
        case 5121:
            return 255;
        case 5123:
            return 65535;
        case 5125:
            return 4294967295;
        default:
            return 1;
    }
}

/**
 * Reads one component, applying glTF normalized-integer semantics. Dequantized float
 * accessors are returned unchanged.
 */
function component(accessor: GLTFAccessorPostprocessed, index: number, channel: number): number {
    const data = accessor.value as unknown as ArrayLike<number>;
    const value = data[index * accessor.components + channel];
    if (!accessor.normalized || accessor.componentType === 5126) {
        return value;
    }

    if (accessor.componentType === 5120 || accessor.componentType === 5122) {
        return Math.max(value / signedMax(accessor.componentType), -1);
    }

    return value / unsignedMax(accessor.componentType);
}

function collectSphericalHarmonics(
    primitive: GLTFMeshPrimitivePostprocessed
): GLTFAccessorPostprocessed[] {
    const coefficients: GLTFAccessorPostprocessed[] = [];

    for (let degree = 1; degree <= 3; degree++) {
        const expected = 2 * degree + 1;
        const level: GLTFAccessorPostprocessed[] = [];

        for (let index = 0; index < expected; index++) {
            const accessor = findAttribute(primitive, `SH_DEGREE_${degree}_COEF_${index}`);
            if (!accessor) {
                break;
            }
            level.push(accessor);
        }

        if (level.length === 0) {
            break;
        }
        if (level.length !== expected) {
            throw new Error(
                "Gaussian splatting: SH degrees must include every coefficient and all lower degrees"
            );
        }

        coefficients.push(...level);
    }

    return coefficients;
}

/**
 * Encodes uncompressed KHR_gaussian_splatting attributes as a standard 3DGS PLY so that
 * gaussian-splat-lite can decode it. Mirrors the conventions of the 3D Tiles 3DGS plugin:
 * logarithmic scales, w/x/y/z quaternion order, logit opacity and SH DC coefficients.
 */
export function encodeRawGaussianPly(primitive: GLTFMeshPrimitivePostprocessed): Uint8Array {
    if (primitive.mode !== undefined && primitive.mode !== 0) {
        throw new Error("Gaussian splatting: Gaussian primitives must use POINTS");
    }

    const position = findAttribute(primitive, "POSITION");
    const rotation = findAttribute(primitive, "ROTATION");
    const scale = findAttribute(primitive, "SCALE");
    if (!position || !rotation || !scale) {
        throw new Error("Gaussian splatting: missing POSITION, ROTATION or SCALE attribute");
    }

    const color = findAttribute(primitive, "COLOR_0");
    const opacity = findAttribute(primitive, "OPACITY");
    const sh0 = findAttribute(primitive, "SH_DEGREE_0_COEF_0");
    if (!color && (!opacity || !sh0)) {
        throw new Error(
            "Gaussian splatting: either COLOR_0 or both OPACITY and SH_DEGREE_0_COEF_0 are required"
        );
    }

    const sh = collectSphericalHarmonics(primitive);
    const indices = primitive.indices;
    const count = indices?.count ?? position.count;

    const properties = [
        "x",
        "y",
        "z",
        "scale_0",
        "scale_1",
        "scale_2",
        "rot_0",
        "rot_1",
        "rot_2",
        "rot_3",
        "opacity",
        "f_dc_0",
        "f_dc_1",
        "f_dc_2",
        ...Array.from({ length: sh.length * 3 }, (_, index) => `f_rest_${index}`)
    ];

    const header = new TextEncoder().encode(
        "ply\nformat binary_little_endian 1.0\n" +
            `element vertex ${count}\n` +
            properties.map(property => `property float ${property}\n`).join("") +
            "end_header\n"
    );
    const bytes = new Uint8Array(header.byteLength + count * properties.length * 4);
    bytes.set(header);

    const output = new DataView(bytes.buffer);
    let byteOffset = header.byteLength;
    const writeFloat = (value: number): void => {
        output.setFloat32(byteOffset, value, true);
        byteOffset += 4;
    };

    for (let index = 0; index < count; index++) {
        const i = indices ? component(indices, index, 0) : index;
        if (i >= position.count) {
            throw new Error("Gaussian splatting: index exceeds the attribute count");
        }

        for (let c = 0; c < 3; c++) {
            writeFloat(component(position, i, c));
        }

        for (let c = 0; c < 3; c++) {
            const value = component(scale, i, c);
            if (!(value >= 0 && value < Infinity)) {
                throw new Error("Gaussian splatting: scale must be finite and non-negative");
            }
            writeFloat(Math.max(Math.log(value), MIN_LOG_SCALE));
        }

        // PLY stores the quaternion as w, x, y, z.
        writeFloat(component(rotation, i, 3));
        for (let c = 0; c < 3; c++) {
            writeFloat(component(rotation, i, c));
        }

        const alpha = opacity
            ? component(opacity, i, 0)
            : color!.components === 4
            ? component(color!, i, 3)
            : 1;
        if (!(alpha >= 0 && alpha <= 1)) {
            throw new Error("Gaussian splatting: opacity must be between 0 and 1");
        }
        const logit = Math.log(alpha / (1 - alpha));
        writeFloat(Math.min(Math.max(logit, -MAX_OPACITY_LOGIT), MAX_OPACITY_LOGIT));

        if (sh0) {
            for (let c = 0; c < 3; c++) {
                writeFloat(component(sh0, i, c));
            }
        } else {
            for (let c = 0; c < 3; c++) {
                writeFloat((linearToSrgb(component(color!, i, c)) - 0.5) / SH_C0);
            }
        }

        // f_rest is stored channel-major: R coefficients, then G, then B.
        for (let c = 0; c < 3; c++) {
            for (const coefficient of sh) {
                writeFloat(component(coefficient, i, c));
            }
        }
    }

    return bytes;
}
