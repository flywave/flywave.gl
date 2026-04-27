import { flatbuffers } from "flatbuffers";
import { AkimaCurve3d } from "../bspline/akima-curve3d";
import { BSplineCurve3d } from "../bspline/bspline-curve";
import { BSplineCurve3dH } from "../bspline/bspline-curve3d-homogeneous";
import { BSplineSurface3d, BSplineSurface3dH } from "../bspline/bspline-surface";
import { InterpolationCurve3d } from "../bspline/interpolation-curve3d";
import { CurveCollection } from "../curve/curve-collection";
import { CurvePrimitive } from "../curve/curve-primitive";
import { GeometryQuery } from "../curve/geometry-query";
import { PointString3d } from "../curve/point-string3d";
import { XYZ } from "../geometry3d/point3d-vector3d";
import { AuxChannel, AuxChannelData, PolyfaceAuxData } from "../polyface/aux-data";
import { IndexedPolyface } from "../polyface/polyface";
import { type TaggedNumericData } from "../polyface/tagged-numeric-data";
import { SolidPrimitive } from "../solid/solid-primitive";
/**
 * Context to write to a flatbuffer blob.
 *  * This class is internal.
 *  * Public access is through GeometryFlatBuffer.geometryToBytes()
 * @internal
 */
export declare class BGFBWriter {
    builder: flatbuffers.Builder;
    constructor(defaultSize?: number);
    /**
     *
     * @param data data source, as Float64Array or number[].
     * @param count optional count, used only if less than .length numbers are to be written.
     */
    writeDoubleArray(data: Float64Array | number[] | undefined, count?: number): number;
    /**
     *
     * @param data data source, as Float64Array or number[].
     * @param count optional count, used only if less than .length numbers are to be written.
     */
    writeIntArray(data: Int32Array | number[] | undefined): number;
    /**
     *
     * @param data data source, as array derived from XYZ.
     * The data is output as a flat array of 3*data.length numbers.
     */
    writePackedYZArray(data: XYZ[] | undefined): number;
    writeCurveCollectionAsFBCurveVector(cv: CurveCollection): number | undefined;
    writeCurveCollectionAsFBVariantGeometry(cv: CurveCollection): number | undefined;
    writeInterpolationCurve3dAsFBVariantGeometry(curve: InterpolationCurve3d): number | undefined;
    writeAkimaCurve3dAsFBVariantGeometry(curve: AkimaCurve3d): number | undefined;
    writeBsplineCurve3dAsFBVariantGeometry(bcurve: BSplineCurve3d): number | undefined;
    writeBSplineSurfaceAsFBVariantGeometry(bsurf: BSplineSurface3d | BSplineSurface3dH): number | undefined;
    writeBsplineCurve3dAHsFBVariantGeometry(bcurve: BSplineCurve3dH): number | undefined;
    writeCurvePrimitiveAsFBVariantGeometry(curvePrimitive: CurvePrimitive): number | undefined;
    writePointString3dAsFBVariantGeometry(pointString: PointString3d): number | undefined;
    writeSolidPrimitiveAsFBVariantGeometry(solid: SolidPrimitive): number | undefined;
    writePolyfaceAuxChannelDataAsFBVariantGeometry(channelData: AuxChannelData): number | undefined;
    writePolyfaceAuxChannelAsFBVariantGeometry(channel: AuxChannel): number | undefined;
    writePolyfaceAuxDataAsFBVariantGeometry(data: PolyfaceAuxData): number | undefined;
    writeTaggedNumericDataArray(data: TaggedNumericData | undefined): number;
    writePolyfaceAsFBVariantGeometry(mesh: IndexedPolyface): number | undefined;
    fillOneBasedIndexArray(mesh: IndexedPolyface, sourceIndex: number[], visible: boolean[] | undefined, facetTerminator: number | undefined, destIndex: number[]): void;
    writeGeometryQueryAsFBVariantGeometry(g: GeometryQuery): number | undefined;
    writeGeometryQueryArrayAsFBVariantGeometry(allGeometry: GeometryQuery | GeometryQuery[] | undefined): number | undefined;
    /**
     * Serialize bytes to a flatbuffer.
     */
    static geometryToBytes(data: GeometryQuery | GeometryQuery[], signatureBytes?: Uint8Array): Uint8Array | undefined;
}
