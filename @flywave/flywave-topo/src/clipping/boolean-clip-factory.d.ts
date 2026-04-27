import { type Clipper } from "./clip-utils";
export declare class BooleanClipFactory {
    static createCaptureUnion(clippers: Clipper | Clipper[], keepInside: boolean): Clipper;
    static createCaptureIntersection(clippers: Clipper | Clipper[], keepInside: boolean): Clipper;
    static createCaptureParity(clippers: Clipper | Clipper[], keepInside: boolean): Clipper;
    static createCaptureDifference(primaryClipper: Clipper, excludedClipper: Clipper, keepInside: boolean): Clipper;
    static createCaptureClipOutside(primaryClipper: Clipper): Clipper;
    static parseToClipperArray(source: any): Clipper[] | undefined;
    static parseToClipper(source?: object): Clipper | undefined;
    static anyClipperToJSON(clipper: any): any | undefined;
}
