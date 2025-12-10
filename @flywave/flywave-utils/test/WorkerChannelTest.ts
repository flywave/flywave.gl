/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as sinon from "sinon";

import { LogLevel } from "../src/Logger/ILogger";
import { LoggerManager } from "../src/Logger/LoggerManager";
import {
    type IWorkerChannelMessage,
    WorkerChannel,
    WORKERCHANNEL_MSG_TYPE
} from "../src/Logger/WorkerChannel";

declare const global: any;

describe("WorkerChannel", function () {
    beforeEach(function () {
        if (typeof self === "undefined") {
            global.self = {
                postMessage() {
                    // stubbed implementation
                }
            };
        }
    });

    afterEach(function () {
        if (Object.keys(self).length === 1) {
            delete global.self;
        }
    });

    it("The WorkerChannel post messages with the format of IWorkerChannelMessage.", function () {
        const message1 = "My message : ";
        const message2 = "is original.";
        const loggerName = "myLogger";

        const expectedMessage: IWorkerChannelMessage = {
            message: [`${loggerName}:`, message1, message2],
            type: WORKERCHANNEL_MSG_TYPE,
            level: LogLevel.Log
        };

        const stubbedPost = sinon.stub(self, "postMessage") as any;

        const previousChannel = LoggerManager.instance.channel;
        // !!Messing with the global instance is bad, because it affects other tests.!!
        LoggerManager.instance.setChannel(new WorkerChannel());
        const logger = LoggerManager.instance.create(loggerName);
        logger.log(message1, message2);

        assert.equal(stubbedPost.callCount, 1);
        assert.isTrue(stubbedPost.alwaysCalledWithExactly(expectedMessage));

        // !!Messing with the global instance is bad, because it affects other tests.!!
        LoggerManager.instance.setChannel(previousChannel);
    });
});
