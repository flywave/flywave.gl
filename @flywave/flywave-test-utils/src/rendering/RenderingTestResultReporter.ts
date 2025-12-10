/* Copyright (C) 2025 flywave.gl contributors */

import { LoggerManager } from "@flywave/flywave-utils";

import { imageDataToDataUrl } from "./DomImageUtils";
import {
    type ImageComparisonResult,
    type ImageTestResultRequest,
    type TestImageProps
} from "./Interface";

const logger = LoggerManager.instance.create("RenderingTestResultReporter");

/**
 * Rpoerts IBCT test images to `FeedbackServer`.
 */
export class RenderingTestResultReporter {
    constructor(readonly backendUrl: string) {}

    reportImageComparisonResult(
        imageProps: TestImageProps,
        actualImage: ImageData,
        passed: boolean,
        _referenceImage?: ImageData, // server already has reference image
        comparisonResult?: ImageComparisonResult
    ) {
        const url = `${this.backendUrl}/ibct-feedback`;
        const payload: ImageTestResultRequest = {
            imageProps,
            actualImage: imageDataToDataUrl(actualImage),
            passed,
            comparisonResult: comparisonResult
                ? {
                      mismatchedPixels: comparisonResult.mismatchedPixels,
                      diffImage: imageDataToDataUrl(comparisonResult.diffImage)
                  }
                : undefined
        };
        const requestPayload = JSON.stringify(payload);

        const headers = new Headers();
        headers.set("Content-type", "application/json");
        fetch(url, { method: "POST", headers, body: requestPayload })
            .then(() => {
                // just ignore success
            })
            .catch(error => {
                logger.error(`failed to store actual image for report on server: ${error}`);
            });
    }
}
