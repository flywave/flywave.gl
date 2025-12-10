/* Copyright (C) 2025 flywave.gl contributors */

export interface ImageComparisonResult {
    mismatchedPixels: number;
    diffImage: ImageData;
}
export type TestImageProps = Record<string, string>;

export interface Reporter {
    reportImageComparisonResult(
        imageProps: TestImageProps,
        actualImage: ImageData,
        passed: boolean,
        referenceImage?: ImageData,
        comparisonResult?: ImageComparisonResult
    ): void;
}

export interface ReferenceImageRepo {
    storeReferenceCandidate(imageProps: TestImageProps, actualImage: ImageData): Promise<void>;

    getReferenceImageUrl(imageProps: TestImageProps): string;
}

/**
 * Image test result transferable using Web API.
 *
 * Images are referenced by URIs.
 */
export interface ImageTestResultRequest {
    imageProps: TestImageProps;

    // URL or data-uri payload
    actualImage: string;
    passed: boolean;

    comparisonResult?: {
        mismatchedPixels: number;

        // URL or data-uri payload
        diffImage: string;
    };

    approveDifference?: boolean;
}

/**
 * Image test result in local context.
 *
 * Images are referenced by local filesystem paths.
 */
export interface ImageTestResultLocal {
    imageProps: TestImageProps;
    passed: boolean;

    actualImagePath?: string;
    diffImagePath?: string;
    mismatchedPixels?: number;
    approveDifference?: boolean;
}
