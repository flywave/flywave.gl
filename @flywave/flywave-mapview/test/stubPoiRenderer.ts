/* Copyright (C) 2025 flywave.gl contributors */

import { type Env } from "@flywave/flywave-datasource-protocol";
import { Math2D } from "@flywave/flywave-utils";
import type * as sinon from "sinon";
import type * as THREE from "three";

import { PoiRenderer } from "../src/poi/PoiRenderer";
import { type ScreenCollisions } from "../src/ScreenCollisions";
import { type PoiInfo } from "../src/text/TextElement";

/**
 * Creates a PoiRenderer stub.
 * @param sandbox - Sinon sandbox used to keep track of created stubs.
 * @param renderPoiSpy - Spy that will be called when [[renderPoi]] method is called on
 * the created PoiRenderer stub.
 * @returns PoiRenderer stub.
 */
export function stubPoiRenderer(
    sandbox: sinon.SinonSandbox,
    renderPoiSpy: sinon.SinonSpy
): sinon.SinonStubbedInstance<PoiRenderer> {
    const stub = sandbox.createStubInstance(PoiRenderer);
    stub.prepareRender.returns(true);

    // Workaround to capture the value of screenPosition vector on the time of the call,
    // otherwise it's lost afterwards since the same vector is used to pass positions for
    // other pois.
    stub.addPoi.callsFake(
        (
            poiInfo: PoiInfo,
            screenPosition: THREE.Vector2,
            screenCollisions: ScreenCollisions,
            _viewDistance: number,
            scale: number,
            allocateScreenSpace: boolean,
            opacity: number,
            env: Env
        ) => {
            // TODO: FLYWAVE-7648 Refactor PoiRenderer.renderPoi, to take out
            // bbox computation(already done during placement) and screen allocation (should
            // be done during placement instead).
            const bbox = new Math2D.Box();
            PoiRenderer.computeIconScreenBox(poiInfo, screenPosition, scale, env, bbox);
            if (allocateScreenSpace) {
                screenCollisions.allocate(bbox);
            }
            const screenPosCopy = screenPosition.toArray();
            if (opacity > 0) {
                renderPoiSpy(poiInfo, screenPosCopy, opacity);
                return true;
            }
            return false;
        }
    );

    return stub;
}
