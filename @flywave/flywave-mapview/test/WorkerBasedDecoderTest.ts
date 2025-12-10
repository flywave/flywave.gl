/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as sinon from "sinon";

import { ConcurrentWorkerSet } from "../src/ConcurrentWorkerSet";
import { WorkerBasedDecoder } from "../src/WorkerBasedDecoder";

describe("WorkerBasedDecoder", function () {
    it("#dispose releases associates workerSet", function () {
        const workerSetStub = sinon.createStubInstance<ConcurrentWorkerSet>(ConcurrentWorkerSet);

        const target = new WorkerBasedDecoder(workerSetStub as any as ConcurrentWorkerSet, "foo");

        assert.equal(workerSetStub.addReference.callCount, 1);
        assert.equal(workerSetStub.removeReference.callCount, 0);

        target.dispose();

        assert.equal(workerSetStub.addReference.callCount, 1);
        assert.equal(workerSetStub.removeReference.callCount, 1);
    });
});
