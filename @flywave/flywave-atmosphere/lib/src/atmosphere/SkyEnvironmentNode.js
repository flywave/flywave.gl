// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
import { CubeCamera, WebGLCubeRenderTarget as CubeRenderTarget, HalfFloatType, Mesh, RGBAFormat, Vector3 } from "three";
import { Fn, pmremTexture, positionGeometry, uniform, vec4 } from "three/tsl";
import { NodeMaterial, NodeUpdateType, TempNode } from "three/webgpu";
import { QuadGeometry } from "./QuadGeometry";
import { inverseProjectionMatrix } from "../tsl/accessors";
import { getAtmosphereContext } from "./AtmosphereContext";
import { sky } from "./SkyNode";
const vectorScratch = /*#__PURE__*/ new Vector3();
export class SkyEnvironmentNode extends TempNode {
    static get type() {
        return "SkyEnvironmentNode";
    }
    constructor(size = 64) {
        super("vec3");
        this.distanceThreshold = 1000;
        this.angularThreshold = (0.1 * Math.PI) / 180;
        this.material = new NodeMaterial();
        this.mesh = new Mesh(new QuadGeometry(), this.material);
        this.prevCameraPosition = new Vector3();
        this.prevSunDirection = new Vector3();
        this.prevMoonDirection = new Vector3();
        this.updateBeforeType = NodeUpdateType.FRAME;
        this.material.name = "SkyEnvironment";
        this.skyNode = sky();
        this.skyNode.showSun = false;
        this.skyNode.showMoon = false;
        this.skyNode.showStars = false;
        const matrixViewToECEF = uniform("mat4")
            .setName("matrixViewToECEF")
            .onRenderUpdate(({ renderer, camera }, { value }) => {
            if (renderer != null && camera != null) {
                const { matrixWorldToECEF } = getAtmosphereContext(renderer);
                value.multiplyMatrices(matrixWorldToECEF.value, camera.matrixWorld);
            }
        });
        this.skyNode.rayDirectionECEF = Fn(() => {
            const positionView = inverseProjectionMatrix().mul(vec4(positionGeometry, 1)).xyz;
            return matrixViewToECEF
                .mul(vec4(positionView, 0))
                .xyz.toVarying("rayDirectionECEF")
                .normalize();
        })();
        this.renderTarget = new CubeRenderTarget(size, {
            depthBuffer: false,
            type: HalfFloatType,
            format: RGBAFormat
        });
        this.cubeCamera = new CubeCamera(0.1, 1000, this.renderTarget);
        this.material.vertexNode = vec4(positionGeometry.xy, 0, 1);
        this.material.fragmentNode = this.skyNode;
        this.pmremNode = pmremTexture(this.renderTarget.texture);
    }
    updateBefore({ renderer }) {
        if (renderer == null) {
            return;
        }
        const { camera, sunDirectionECEF, moonDirectionECEF } = getAtmosphereContext(renderer);
        if (camera != null) {
            const { prevCameraPosition: prevPosition } = this;
            const nextPosition = vectorScratch;
            // TODO: Ideally, this should be compared against the parameterization
            // values of the LUT. (i.e. radius, angle between view and sun, etc.)
            nextPosition.copy(camera.position).divideScalar(this.distanceThreshold).round();
            if (!prevPosition.equals(nextPosition)) {
                prevPosition.copy(nextPosition);
                this.needsUpdate = true;
            }
        }
        {
            const { prevSunDirection: prevValue } = this;
            const { value } = sunDirectionECEF;
            if (prevValue.angleTo(value) > this.angularThreshold) {
                prevValue.copy(value);
                this.needsUpdate = true;
            }
        }
        {
            const { prevMoonDirection: prevValue } = this;
            const { value } = moonDirectionECEF;
            if (prevValue.angleTo(value) > this.angularThreshold) {
                prevValue.copy(value);
                this.needsUpdate = true;
            }
        }
        if (this.version === this.currentVersion) {
            return;
        }
        this.currentVersion = this.version;
        this.cubeCamera.update(renderer, this.mesh);
    }
    // This setup can be called by many materials.
    setup(builder) {
        if (this.removeLUTUpdate == null) {
            const { lutNode } = getAtmosphereContext(builder);
            const callback = () => {
                this.needsUpdate = true;
            };
            lutNode.addEventListener(
            // @ts-expect-error Cannot specify the events map
            "update", callback);
            this.removeLUTUpdate = () => {
                lutNode.removeEventListener(
                // @ts-expect-error Cannot specify the events map
                "update", callback);
            };
        }
        return this.pmremNode;
    }
    dispose() {
        this.removeLUTUpdate?.();
        this.renderTarget.dispose();
        this.material.dispose();
        this.mesh.geometry.dispose();
        super.dispose();
    }
}
export const skyEnvironment = (...args) => new SkyEnvironmentNode(...args);
//# sourceMappingURL=SkyEnvironmentNode.js.map