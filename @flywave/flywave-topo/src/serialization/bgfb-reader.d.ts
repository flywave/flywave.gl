import { AkimaCurve3d } from "../bspline/akima-curve3d";
import { BSplineCurve3d } from "../bspline/bspline-curve";
import { BSplineCurve3dH } from "../bspline/bspline-curve3d-homogeneous";
import { BSplineSurface3d, BSplineSurface3dH } from "../bspline/bspline-surface";
import { InterpolationCurve3d } from "../bspline/interpolation-curve3d";
import { type CurveCollection } from "../curve/curve-collection";
import { type CurvePrimitive } from "../curve/curve-primitive";
import { GeometryQuery } from "../curve/geometry-query";
import { PointString3d } from "../curve/point-string3d";
import { TransitionSpiral3d } from "../curve/spiral/transition-spiral3d";
import { AuxChannel, AuxChannelData, PolyfaceAuxData } from "../polyface/aux-data";
import { IndexedPolyface } from "../polyface/polyface";
import { TaggedNumericData } from "../polyface/tagged-numeric-data";
import { type SolidPrimitive } from "../solid/solid-primitive";
import { BGFBAccessors } from "./bgfb-accessors";
/** * Context to write to a flatbuffer blob.
 *  * This class is internal.
 *  * Public access is through GeometryFlatBuffer.geometryToBytes()
 * @internal
 */
export declare class BGFBReader {
    constructor();
    /**
     * Extract a bspline surface
     * @param variant read position in the flat buffer.
     */
    readBSplineSurfaceFromVariant(variantHeader: BGFBAccessors.VariantGeometry): BSplineSurface3d | BSplineSurface3dH | undefined;
    /**
     * Extract an interpolating curve
     * @param variant read position in the flat buffer.
     */
    readInterpolationCurve3d(header: BGFBAccessors.InterpolationCurve): InterpolationCurve3d | undefined;
    /**
     * Extract an akima curve
     * @param variant read position in the flat buffer.
     */
    readAkimaCurve3d(header: BGFBAccessors.AkimaCurve): AkimaCurve3d | undefined;
    /**
     * Extract a bspline curve
     * @param variant read position in the flat buffer.
     */
    readBSplineCurve(header: BGFBAccessors.BsplineCurve): BSplineCurve3d | BSplineCurve3dH | undefined;
    /**
     * Extract a bspline curve
     * @param variant read position in the flat buffer.
     */
    readTransitionSpiral(header: BGFBAccessors.TransitionSpiral): TransitionSpiral3d | undefined;
    /**
     * Extract a curve primitive
     * @param variant read position in the flat buffer.
     */
    readCurvePrimitiveFromVariant(variant: BGFBAccessors.VariantGeometry): CurvePrimitive | undefined;
    /**
     * Extract a curve primitive
     * @param variant read position in the flat buffer.
     */
    readPointStringFromVariant(variant: BGFBAccessors.VariantGeometry): PointString3d | undefined;
    /**
     * Extract auxData for a mesh
     * @param variant read position in the flat buffer.
     */
    readPolyfaceAuxChannelData(channelDataHeader: BGFBAccessors.PolyfaceAuxChannelData | null): AuxChannelData | undefined;
    /**
     * Extract auxData for a mesh
     * @param variant read position in the flat buffer.
     */
    readPolyfaceAuxChannel(channelHeader: BGFBAccessors.PolyfaceAuxChannel | null): AuxChannel | undefined;
    /**
     * Extract auxData for a mesh
     * @param variant read position in the flat buffer.
     */
    readPolyfaceAuxData(auxDataHeader: BGFBAccessors.PolyfaceAuxData | null): PolyfaceAuxData | undefined;
    /**
     * Extract auxData for a mesh
     * @param variant read position in the flat buffer.
     */
    readTaggedNumericData(accessor: BGFBAccessors.TaggedNumericData | undefined): TaggedNumericData | undefined;
    /**
     * Extract a mesh
     * @param variant read position in the flat buffer.
     */
    readPolyfaceFromVariant(variant: BGFBAccessors.VariantGeometry): IndexedPolyface | undefined;
    readCurveCollectionFromCurveVectorTable(cvTable: BGFBAccessors.CurveVector): CurveCollection;
    /**
     * Extract a curve collection
     * @param variant read position in the flat buffer.
     */
    readCurveCollectionFromVariantGeometry(variant: BGFBAccessors.VariantGeometry): CurveCollection | undefined;
    /**
     * Extract a curve collection
     * @param variant read position in the flat buffer.
     */
    readSolidPrimitiveFromVariant(variant: BGFBAccessors.VariantGeometry): SolidPrimitive | undefined;
    /**
     * Extract any geometry type or array of geometry.
     * @param variant read position in the flat buffer.
     */
    readGeometryQueryFromVariant(variant: BGFBAccessors.VariantGeometry): GeometryQuery | GeometryQuery[] | undefined;
    /**
     * Deserialize bytes from a flatbuffer.
     * @param justTheBytes FlatBuffer bytes as created by BGFBWriter.createFlatBuffer (g);
     */
    static bytesToGeometry(theBytes: Uint8Array, signature?: Uint8Array): GeometryQuery | GeometryQuery[] | undefined;
}
/**
 * mappings between typescript spiral type strings and native integers.
 * @internal
 */
export declare class TopoSpiralTypeQueries {
    private static readonly spiralTypeCodeMap;
    /** Convert native integer type (e.g. from flatbuffer) to typescript string */
    static typeCodeToString(typeCode: number): string | undefined;
    /** Convert typescript string to native integer type */
    static stringToTypeCode(s: string, defaultToClothoid?: boolean): number | undefined;
    /** Ask if the indicated type code is a "direct" spiral */
    static isDirectSpiralType(typeCode: number): boolean;
}
