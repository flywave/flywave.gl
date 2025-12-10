/* Copyright (C) 2025 flywave.gl contributors */

/* eslint-disable no-console */

import { type IChannel } from "./IChannel";

/**
 * Class for the default console channel.
 */

export class ConsoleChannel implements IChannel {
    error(message?: any, ...optionalParams: any[]) {
        console.error(message, ...(optionalParams as any[]));
    }

    debug(message?: any, ...optionalParams: any[]) {
        console.debug(message, ...(optionalParams as any[]));
    }

    info(message?: any, ...optionalParams: any[]) {
        console.info(message, ...(optionalParams as any[]));
    }

    log(message?: any, ...optionalParams: any[]) {
        console.log(message, ...(optionalParams as any[]));
    }

    trace(message?: any, ...optionalParams: any[]) {
        console.trace(message, ...(optionalParams as any[]));
    }

    warn(message?: any, ...optionalParams: any[]) {
        console.warn(message, ...(optionalParams as any[]));
    }
}
