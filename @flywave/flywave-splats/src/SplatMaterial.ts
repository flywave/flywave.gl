/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import {
    type Camera,
    DataTexture,
    DoubleSide,
    NormalBlending,
    RGBAFormat,
    UnsignedByteType,
    Vector2
} from "three";
import { type Renderer, NodeMaterial } from "three/webgpu";
import {
    Fn,
    attribute,
    dot,
    float,
    floor as tslFloor,
    length,
    mat3,
    min as tslMin,
    mod,
    normalize,
    pow,
    sqrt,
    texture,
    transpose,
    uniform,
    vec2,
    vec3,
    vec4,
    positionLocal,
    modelViewMatrix,
    cameraProjectionMatrix,
    modelWorldMatrix,
    cameraViewMatrix,
    cameraPosition
} from "three/tsl";

import { type SplatMesh } from "./SplatMesh";

export class SplatMaterial {
    static build(maxSphericalHarmonicsDegree: number = 0): NodeMaterial {
        const material = new NodeMaterial();
        material.name = "SplatMaterial";
        material.transparent = true;
        material.blending = NormalBlending;
        material.depthTest = true;
        material.depthWrite = false;
        material.side = DoubleSide;

        const invViewport = uniform(new Vector2());
        const dataTextureSize = uniform(new Vector2());
        const focal = uniform(new Vector2());

        const placeholder = new DataTexture(
            new Uint8Array([255, 255, 255, 255]),
            1,
            1,
            RGBAFormat,
            UnsignedByteType
        );
        placeholder.needsUpdate = true;

        const covariancesATexture = texture(placeholder);
        const covariancesBTexture = texture(placeholder);
        const centersTexture = texture(placeholder);
        const colorsTexture = texture(placeholder);
        const shTexture0 = texture(placeholder);
        const shTexture1 = texture(placeholder);
        const shTexture2 = texture(placeholder);

        const splatIndexAttr = attribute("splatIndex", "float");
        const meshPos = positionLocal.xy;

        const getDataUV = Fn(([index, texSize]) => {
            const y = tslFloor(index.div(texSize.x));
            const x = index.sub(y.mul(texSize.x));
            return vec2(x.add(0.5).div(texSize.x), y.add(0.5).div(texSize.y));
        });

        const splatUV = getDataUV(splatIndexAttr, dataTextureSize);

        const center = texture(centersTexture, splatUV);
        const baseColor = texture(colorsTexture, splatUV);
        const covAData = texture(covariancesATexture, splatUV).mul(center.w);
        const covBData = texture(covariancesBTexture, splatUV).mul(center.w);
        const covA = vec3(covAData.x, covAData.y, covAData.z);
        const covB = vec3(covAData.w, covBData.x, covBData.y);

        const SH_C1 = float(0.48860251);
        const SH_C2_0 = float(1.09254843);
        const SH_C2_1 = float(-1.09254843);
        const SH_C2_2 = float(0.315391565);
        const SH_C2_3 = float(-1.09254843);
        const SH_C2_4 = float(0.546274215);
        const SH_C3_0 = float(-0.59004358);
        const SH_C3_1 = float(2.890611442);
        const SH_C3_2 = float(-0.45704579);
        const SH_C3_3 = float(0.373176332);
        const SH_C3_4 = float(-0.45704579);
        const SH_C3_5 = float(1.445305721);
        const SH_C3_6 = float(-0.59004358);

        const decompose = Fn(([value]) => {
            const v = value.mul(255.0);
            const b0 = mod(v, 256.0);
            const b1 = mod(tslFloor(v.div(256.0)), 256.0);
            const b2 = mod(tslFloor(v.div(65536.0)), 256.0);
            const b3 = mod(tslFloor(v.div(16777216.0)), 256.0);
            const comps = vec4(b0, b1, b2, b3);
            return comps.mul(2.0 / 255.0).sub(1.0);
        });

        const computeSHColor = Fn(() => {
            const worldPos = modelWorldMatrix.mul(vec4(center.xyz, 1.0));
            const dir = normalize(worldPos.xyz.sub(cameraPosition));

            const x = dir.x;
            const y = dir.y;
            const z = dir.z;

            let result = baseColor.rgb;

            if (maxSphericalHarmonicsDegree > 0) {
                const sh0 = texture(shTexture0, splatUV);
                const sh00 = decompose(sh0.x);
                const sh01 = decompose(sh0.y);
                const sh02 = decompose(sh0.z);
                const sh03 = decompose(sh0.w);

                const sh1 = vec3(sh00.x, sh00.y, sh00.z);
                const sh2 = vec3(sh00.w, sh01.x, sh01.y);
                const sh3 = vec3(sh01.z, sh01.w, sh02.x);

                result = result
                    .add(SH_C1.negate().mul(y).mul(sh1))
                    .add(SH_C1.mul(z).mul(sh2))
                    .add(SH_C1.negate().mul(x).mul(sh3));

                if (maxSphericalHarmonicsDegree > 1) {
                    const shTex1 = texture(shTexture1, splatUV);
                    const sh04 = decompose(shTex1.x);
                    const sh05 = decompose(shTex1.y);

                    const xx = x.mul(x);
                    const yy = y.mul(y);
                    const zz = z.mul(z);
                    const xy = x.mul(y);
                    const yz = y.mul(z);
                    const xz = x.mul(z);

                    const sh4 = vec3(sh02.y, sh02.z, sh02.w);
                    const sh5 = vec3(sh03.x, sh03.y, sh03.z);
                    const sh6 = vec3(sh03.w, sh04.x, sh04.y);
                    const sh7 = vec3(sh04.z, sh04.w, sh05.x);
                    const sh8 = vec3(sh05.y, sh05.z, sh05.w);

                    result = result
                        .add(SH_C2_0.mul(xy).mul(sh4))
                        .add(SH_C2_1.mul(yz).mul(sh5))
                        .add(SH_C2_2.mul(zz.mul(2).sub(xx).sub(yy)).mul(sh6))
                        .add(SH_C2_3.mul(xz).mul(sh7))
                        .add(SH_C2_4.mul(xx.sub(yy)).mul(sh8));

                    if (maxSphericalHarmonicsDegree > 2) {
                        const shTex2 = texture(shTexture2, splatUV);
                        const sh06 = decompose(shTex2.x);
                        const sh07 = decompose(shTex2.y);
                        const sh08 = decompose(shTex2.z);
                        const sh09 = decompose(shTex2.w);

                        const sh9 = vec3(sh06.x, sh06.y, sh06.z);
                        const sh10 = vec3(sh06.w, sh07.x, sh07.y);
                        const sh11 = vec3(sh07.z, sh07.w, sh08.x);
                        const sh12 = vec3(sh08.y, sh08.z, sh08.w);
                        const sh13 = vec3(sh09.x, sh09.y, sh09.z);

                        result = result
                            .add(SH_C3_0.mul(y).mul(xx.mul(3).sub(yy)).mul(sh9))
                            .add(SH_C3_1.mul(xy).mul(z).mul(sh10))
                            .add(SH_C3_2.mul(y).mul(zz.mul(4).sub(xx).sub(yy)).mul(sh11))
                            .add(
                                SH_C3_3.mul(z)
                                    .mul(zz.mul(2).sub(xx.mul(3)).sub(yy.mul(3)))
                                    .mul(sh12)
                            )
                            .add(SH_C3_4.mul(x).mul(zz.mul(4).sub(xx).sub(yy)).mul(sh13));
                    }
                }
            }
            return result;
        });

        const worldPos = modelWorldMatrix.mul(vec4(center.xyz, 1.0));
        const camspace = cameraViewMatrix.mul(worldPos);
        const pos2d = cameraProjectionMatrix.mul(camspace);

        const bounds = float(1.2).mul(pos2d.w);
        const outOfBounds = pos2d.z
            .lessThan(0)
            .or(pos2d.x.lessThan(bounds.negate()))
            .or(pos2d.x.greaterThan(bounds))
            .or(pos2d.y.lessThan(bounds.negate()))
            .or(pos2d.y.greaterThan(bounds));

        const Vrk = mat3(covA.x, covA.y, covA.z, covA.y, covB.x, covB.y, covA.z, covB.y, covB.z);

        const J00 = focal.x.div(camspace.z);
        const J02 = focal.x.mul(camspace.x).div(camspace.z.mul(camspace.z)).negate();
        const J11 = focal.y.div(camspace.z);
        const J12 = focal.y.mul(camspace.y).div(camspace.z.mul(camspace.z)).negate();

        const J = mat3(J00, 0, J02, 0, J11, J12, 0, 0, 0);

        const mvMat3 = mat3(modelViewMatrix);
        const T = transpose(mvMat3).mul(J);
        const cov2d = transpose(T).mul(Vrk).mul(T);

        const c00 = cov2d.element(0).x;
        const c11 = cov2d.element(1).y;
        const c01 = cov2d.element(0).y;

        const mid = c00.add(c11).mul(0.5);
        const radius = length(vec2(c00.sub(c11).mul(0.5), c01));
        const lambda1 = mid.add(radius);
        const lambda2 = mid.sub(radius);

        const degenerate = lambda2.lessThan(0);

        const diagVec = normalize(vec2(c01, lambda1.sub(c00)));
        const majorAxis = tslMin(sqrt(lambda1.mul(2)), float(1024)).mul(diagVec);
        const minorAxis = tslMin(sqrt(lambda2.mul(2)), float(1024)).mul(
            vec2(diagVec.y, diagVec.x.negate())
        );

        const offset = meshPos.x
            .mul(majorAxis)
            .add(meshPos.y.mul(minorAxis))
            .mul(invViewport)
            .mul(pos2d.w);
        const finalPos = vec4(pos2d.xy.add(offset), pos2d.zw);

        material.vertexNode = outOfBounds.or(degenerate).select(vec4(0, 0, 2, 1), finalPos);

        const A = meshPos.dot(meshPos).negate();
        const B = pow(float(Math.E), A).mul(baseColor.a);

        let shColor = baseColor.rgb;
        if (maxSphericalHarmonicsDegree > 0) {
            shColor = computeSHColor();
        }

        material.colorNode = shColor;
        material.opacityNode = B;
        material.maskNode = A.greaterThanEqual(-4.0);

        (material as any)._uniforms = {
            invViewport,
            dataTextureSize,
            focal,
            covariancesATexture,
            covariancesBTexture,
            centersTexture,
            colorsTexture,
            shTexture0,
            shTexture1,
            shTexture2
        };

        return material;
    }

    static updateUniforms(renderer: Renderer, camera: Camera, mesh: SplatMesh) {
        const material = mesh.material as any;
        if (!material || !material._uniforms) return;

        const u = material._uniforms;
        const renderSize = new Vector2();
        renderer.getSize(renderSize);
        const renderWidth = renderSize.x;
        const renderHeight = renderSize.y;

        u.invViewport.value.set(1 / renderWidth, 1 / renderHeight);

        if (camera) {
            const focalLengthX = camera.projectionMatrix.elements[0] * 0.5 * renderWidth;
            const focalLengthY = camera.projectionMatrix.elements[5] * 0.5 * renderHeight;
            u.focal.value.set(focalLengthX, focalLengthY);
        }

        const gsMesh = mesh as SplatMesh;
        if (gsMesh.covariancesATexture) {
            u.dataTextureSize.value.set(
                gsMesh.covariancesATexture.image.width,
                gsMesh.covariancesATexture.image.height
            );
            u.covariancesATexture.value = gsMesh.covariancesATexture;
            u.covariancesBTexture.value = gsMesh.covariancesBTexture;
            u.centersTexture.value = gsMesh.centersTexture;
            u.colorsTexture.value = gsMesh.colorsTexture;

            if (gsMesh.shTextures) {
                for (let i = 0; i < gsMesh.shTextures.length; i++) {
                    u[`shTexture${i}`].value = gsMesh.shTextures[i];
                }
            }
        }
    }
}
