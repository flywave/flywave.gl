/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import type * as sinon from "sinon";

import { PoiManager } from "../src/poi/PoiManager";

/**
 * Stubs poi manager.
 * @param sandbox - Sinon sandbox used to track created stubs.
 * @returns PoiManager stub.
 */
export function stubPoiManager(sandbox: sinon.SinonSandbox): PoiManager {
    const stub = sandbox.createStubInstance(PoiManager);
    stub.updatePoiFromPoiTable.returns(true);

    return stub as unknown as PoiManager;
}
