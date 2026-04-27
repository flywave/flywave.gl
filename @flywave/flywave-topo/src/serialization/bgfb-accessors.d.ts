import { flatbuffers } from "flatbuffers";
/** @packageDocumentation
 * @module Serialization
 */
export declare namespace BGFBAccessors {
    /**
     * @enum {number}
     */
    enum LoopTypeEnum {
        Parity = 1,
        InteriorToLeft = 2
    }
    /**
     * @enum {number}
     */
    enum VariantGeometryUnion {
        tagNONE = 0,
        tagLineSegment = 1,
        tagEllipticArc = 2,
        tagBsplineCurve = 3,
        tagLineString = 4,
        tagCurveVector = 5,
        tagTopoCone = 6,
        tagTopoSphere = 7,
        tagTopoTorusPipe = 8,
        tagTopoBox = 9,
        tagTopoExtrusion = 10,
        tagTopoRotationalSweep = 11,
        tagTopoRuledSweep = 12,
        tagPolyface = 13,
        tagBsplineSurface = 14,
        tagVectorOfVariantGeometry = 15,
        tagInterpolationCurve = 16,
        tagTransitionSpiral = 17,
        tagPointString = 18,
        tagAkimaCurve = 19,
        tagCatenaryCurve = 20,
        tagPartialCurve = 21
    }
    /**
     * @constructor
     */
    class DPoint3d {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns DPoint3d
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        x(): number;
        /**
         * @returns number
         */
        y(): number;
        /**
         * @returns number
         */
        z(): number;
        /**
         * @param flatbuffers.Builder builder
         * @param number x
         * @param number y
         * @param number z
         * @returns flatbuffers.Offset
         */
        static createDPoint3d(builder: flatbuffers.Builder, x: number, y: number, z: number): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class DRay3d {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns DRay3d
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        x(): number;
        /**
         * @returns number
         */
        y(): number;
        /**
         * @returns number
         */
        z(): number;
        /**
         * @returns number
         */
        ux(): number;
        /**
         * @returns number
         */
        uy(): number;
        /**
         * @returns number
         */
        uz(): number;
        /**
         * @param flatbuffers.Builder builder
         * @param number x
         * @param number y
         * @param number z
         * @param number ux
         * @param number uy
         * @param number uz
         * @returns flatbuffers.Offset
         */
        static createDRay3d(builder: flatbuffers.Builder, x: number, y: number, z: number, ux: number, uy: number, uz: number): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class DPoint2d {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns DPoint2d
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        x(): number;
        /**
         * @returns number
         */
        y(): number;
        /**
         * @param flatbuffers.Builder builder
         * @param number x
         * @param number y
         * @returns flatbuffers.Offset
         */
        static createDPoint2d(builder: flatbuffers.Builder, x: number, y: number): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class DVector3d {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns DVector3d
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        x(): number;
        /**
         * @returns number
         */
        y(): number;
        /**
         * @returns number
         */
        z(): number;
        /**
         * @param flatbuffers.Builder builder
         * @param number x
         * @param number y
         * @param number z
         * @returns flatbuffers.Offset
         */
        static createDVector3d(builder: flatbuffers.Builder, x: number, y: number, z: number): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class Angle {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns Angle
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        degrees(): number;
        /**
         * @param flatbuffers.Builder builder
         * @param number degrees
         * @returns flatbuffers.Offset
         */
        static createAngle(builder: flatbuffers.Builder, degrees: number): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class DEllipse3d {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns DEllipse3d
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        centerX(): number;
        /**
         * @returns number
         */
        centerY(): number;
        /**
         * @returns number
         */
        centerZ(): number;
        /**
         * @returns number
         */
        vector0X(): number;
        /**
         * @returns number
         */
        vector0Y(): number;
        /**
         * @returns number
         */
        vector0Z(): number;
        /**
         * @returns number
         */
        vector90X(): number;
        /**
         * @returns number
         */
        vector90Y(): number;
        /**
         * @returns number
         */
        vector90Z(): number;
        /**
         * @returns number
         */
        startRadians(): number;
        /**
         * @returns number
         */
        sweepRadians(): number;
        /**
         * @param flatbuffers.Builder builder
         * @param number centerX
         * @param number centerY
         * @param number centerZ
         * @param number vector0X
         * @param number vector0Y
         * @param number vector0Z
         * @param number vector90X
         * @param number vector90Y
         * @param number vector90Z
         * @param number startRadians
         * @param number sweepRadians
         * @returns flatbuffers.Offset
         */
        static createDEllipse3d(builder: flatbuffers.Builder, centerX: number, centerY: number, centerZ: number, vector0X: number, vector0Y: number, vector0Z: number, vector90X: number, vector90Y: number, vector90Z: number, startRadians: number, sweepRadians: number): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class DSegment3d {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns DSegment3d
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        point0X(): number;
        /**
         * @returns number
         */
        point0Y(): number;
        /**
         * @returns number
         */
        point0Z(): number;
        /**
         * @returns number
         */
        point1X(): number;
        /**
         * @returns number
         */
        point1Y(): number;
        /**
         * @returns number
         */
        point1Z(): number;
        /**
         * @param flatbuffers.Builder builder
         * @param number point0X
         * @param number point0Y
         * @param number point0Z
         * @param number point1X
         * @param number point1Y
         * @param number point1Z
         * @returns flatbuffers.Offset
         */
        static createDSegment3d(builder: flatbuffers.Builder, point0X: number, point0Y: number, point0Z: number, point1X: number, point1Y: number, point1Z: number): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class DTransform3d {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns DTransform3d
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        axx(): number;
        /**
         * @returns number
         */
        axy(): number;
        /**
         * @returns number
         */
        axz(): number;
        /**
         * @returns number
         */
        axw(): number;
        /**
         * @returns number
         */
        ayx(): number;
        /**
         * @returns number
         */
        ayy(): number;
        /**
         * @returns number
         */
        ayz(): number;
        /**
         * @returns number
         */
        ayw(): number;
        /**
         * @returns number
         */
        azx(): number;
        /**
         * @returns number
         */
        azy(): number;
        /**
         * @returns number
         */
        azz(): number;
        /**
         * @returns number
         */
        azw(): number;
        /**
         * @param flatbuffers.Builder builder
         * @param number axx
         * @param number axy
         * @param number axz
         * @param number axw
         * @param number ayx
         * @param number ayy
         * @param number ayz
         * @param number ayw
         * @param number azx
         * @param number azy
         * @param number azz
         * @param number azw
         * @returns flatbuffers.Offset
         */
        static createDTransform3d(builder: flatbuffers.Builder, axx: number, axy: number, axz: number, axw: number, ayx: number, ayy: number, ayz: number, ayw: number, azx: number, azy: number, azz: number, azw: number): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TopoBoxDetail {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TopoBoxDetail
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        baseOriginX(): number;
        /**
         * @returns number
         */
        baseOriginY(): number;
        /**
         * @returns number
         */
        baseOriginZ(): number;
        /**
         * @returns number
         */
        topOriginX(): number;
        /**
         * @returns number
         */
        topOriginY(): number;
        /**
         * @returns number
         */
        topOriginZ(): number;
        /**
         * @returns number
         */
        vectorXX(): number;
        /**
         * @returns number
         */
        vectorXY(): number;
        /**
         * @returns number
         */
        vectorXZ(): number;
        /**
         * @returns number
         */
        vectorYX(): number;
        /**
         * @returns number
         */
        vectorYY(): number;
        /**
         * @returns number
         */
        vectorYZ(): number;
        /**
         * @returns number
         */
        baseX(): number;
        /**
         * @returns number
         */
        baseY(): number;
        /**
         * @returns number
         */
        topX(): number;
        /**
         * @returns number
         */
        topY(): number;
        /**
         * @returns boolean
         */
        capped(): boolean;
        /**
         * @param flatbuffers.Builder builder
         * @param number baseOriginX
         * @param number baseOriginY
         * @param number baseOriginZ
         * @param number topOriginX
         * @param number topOriginY
         * @param number topOriginZ
         * @param number vectorXX
         * @param number vectorXY
         * @param number vectorXZ
         * @param number vectorYX
         * @param number vectorYY
         * @param number vectorYZ
         * @param number baseX
         * @param number baseY
         * @param number topX
         * @param number topY
         * @param boolean capped
         * @returns flatbuffers.Offset
         */
        static createTopoBoxDetail(builder: flatbuffers.Builder, baseOriginX: number, baseOriginY: number, baseOriginZ: number, topOriginX: number, topOriginY: number, topOriginZ: number, vectorXX: number, vectorXY: number, vectorXZ: number, vectorYX: number, vectorYY: number, vectorYZ: number, baseX: number, baseY: number, topX: number, topY: number, capped: boolean): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TopoSphereDetail {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TopoSphereDetail
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param DTransform3d= obj
         * @returns DTransform3d|null
         */
        localToWorld(obj?: DTransform3d): DTransform3d | null;
        /**
         * @returns number
         */
        startLatitudeRadians(): number;
        /**
         * @returns number
         */
        latitudeSweepRadians(): number;
        /**
         * @returns boolean
         */
        capped(): boolean;
        /**
         * @param flatbuffers.Builder builder
         * @param number localToWorld_axx
         * @param number localToWorld_axy
         * @param number localToWorld_axz
         * @param number localToWorld_axw
         * @param number localToWorld_ayx
         * @param number localToWorld_ayy
         * @param number localToWorld_ayz
         * @param number localToWorld_ayw
         * @param number localToWorld_azx
         * @param number localToWorld_azy
         * @param number localToWorld_azz
         * @param number localToWorld_azw
         * @param number startLatitudeRadians
         * @param number latitudeSweepRadians
         * @param boolean capped
         * @returns flatbuffers.Offset
         */
        static createTopoSphereDetail(builder: flatbuffers.Builder, localToWorld_axx: number, localToWorld_axy: number, localToWorld_axz: number, localToWorld_axw: number, localToWorld_ayx: number, localToWorld_ayy: number, localToWorld_ayz: number, localToWorld_ayw: number, localToWorld_azx: number, localToWorld_azy: number, localToWorld_azz: number, localToWorld_azw: number, startLatitudeRadians: number, latitudeSweepRadians: number, capped: boolean): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TopoConeDetail {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TopoConeDetail
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        centerAX(): number;
        /**
         * @returns number
         */
        centerAY(): number;
        /**
         * @returns number
         */
        centerAZ(): number;
        /**
         * @returns number
         */
        centerBX(): number;
        /**
         * @returns number
         */
        centerBY(): number;
        /**
         * @returns number
         */
        centerBZ(): number;
        /**
         * @returns number
         */
        vector0X(): number;
        /**
         * @returns number
         */
        vector0Y(): number;
        /**
         * @returns number
         */
        vector0Z(): number;
        /**
         * @returns number
         */
        vector90X(): number;
        /**
         * @returns number
         */
        vector90Y(): number;
        /**
         * @returns number
         */
        vector90Z(): number;
        /**
         * @returns number
         */
        radiusA(): number;
        /**
         * @returns number
         */
        radiusB(): number;
        /**
         * @returns boolean
         */
        capped(): boolean;
        /**
         * @param flatbuffers.Builder builder
         * @param number centerAX
         * @param number centerAY
         * @param number centerAZ
         * @param number centerBX
         * @param number centerBY
         * @param number centerBZ
         * @param number vector0X
         * @param number vector0Y
         * @param number vector0Z
         * @param number vector90X
         * @param number vector90Y
         * @param number vector90Z
         * @param number radiusA
         * @param number radiusB
         * @param boolean capped
         * @returns flatbuffers.Offset
         */
        static createTopoConeDetail(builder: flatbuffers.Builder, centerAX: number, centerAY: number, centerAZ: number, centerBX: number, centerBY: number, centerBZ: number, vector0X: number, vector0Y: number, vector0Z: number, vector90X: number, vector90Y: number, vector90Z: number, radiusA: number, radiusB: number, capped: boolean): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TopoTorusPipeDetail {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TopoTorusPipeDetail
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        centerX(): number;
        /**
         * @returns number
         */
        centerY(): number;
        /**
         * @returns number
         */
        centerZ(): number;
        /**
         * @returns number
         */
        vectorXX(): number;
        /**
         * @returns number
         */
        vectorXY(): number;
        /**
         * @returns number
         */
        vectorXZ(): number;
        /**
         * @returns number
         */
        vectorYX(): number;
        /**
         * @returns number
         */
        vectorYY(): number;
        /**
         * @returns number
         */
        vectorYZ(): number;
        /**
         * @returns number
         */
        majorRadius(): number;
        /**
         * @returns number
         */
        minorRadius(): number;
        /**
         * @returns number
         */
        sweepRadians(): number;
        /**
         * @returns boolean
         */
        capped(): boolean;
        /**
         * @param flatbuffers.Builder builder
         * @param number centerX
         * @param number centerY
         * @param number centerZ
         * @param number vectorXX
         * @param number vectorXY
         * @param number vectorXZ
         * @param number vectorYX
         * @param number vectorYY
         * @param number vectorYZ
         * @param number majorRadius
         * @param number minorRadius
         * @param number sweepRadians
         * @param boolean capped
         * @returns flatbuffers.Offset
         */
        static createTopoTorusPipeDetail(builder: flatbuffers.Builder, centerX: number, centerY: number, centerZ: number, vectorXX: number, vectorXY: number, vectorXZ: number, vectorYX: number, vectorYY: number, vectorYZ: number, majorRadius: number, minorRadius: number, sweepRadians: number, capped: boolean): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class LineSegment {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns LineSegment
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param LineSegment= obj
         * @returns LineSegment
         */
        static getRootAsLineSegment(bb: flatbuffers.ByteBuffer, obj?: LineSegment): LineSegment;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param LineSegment= obj
         * @returns LineSegment
         */
        static getSizePrefixedRootAsLineSegment(bb: flatbuffers.ByteBuffer, obj?: LineSegment): LineSegment;
        /**
         * @param DSegment3d= obj
         * @returns DSegment3d|null
         */
        segment(obj?: DSegment3d): DSegment3d | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startLineSegment(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset segmentOffset
         */
        static addSegment(builder: flatbuffers.Builder, segmentOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endLineSegment(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createLineSegment(builder: flatbuffers.Builder, segmentOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class LineString {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns LineString
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param LineString= obj
         * @returns LineString
         */
        static getRootAsLineString(bb: flatbuffers.ByteBuffer, obj?: LineString): LineString;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param LineString= obj
         * @returns LineString
         */
        static getSizePrefixedRootAsLineString(bb: flatbuffers.ByteBuffer, obj?: LineString): LineString;
        /**
         * @param number index
         * @returns number
         */
        points(index: number): number | null;
        /**
         * @returns number
         */
        pointsLength(): number;
        /**
         * @returns Float64Array
         */
        pointsArray(): Float64Array | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startLineString(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset pointsOffset
         */
        static addPoints(builder: flatbuffers.Builder, pointsOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createPointsVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startPointsVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endLineString(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createLineString(builder: flatbuffers.Builder, pointsOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class PointString {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns PointString
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param PointString= obj
         * @returns PointString
         */
        static getRootAsPointString(bb: flatbuffers.ByteBuffer, obj?: PointString): PointString;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param PointString= obj
         * @returns PointString
         */
        static getSizePrefixedRootAsPointString(bb: flatbuffers.ByteBuffer, obj?: PointString): PointString;
        /**
         * @param number index
         * @returns number
         */
        points(index: number): number | null;
        /**
         * @returns number
         */
        pointsLength(): number;
        /**
         * @returns Float64Array
         */
        pointsArray(): Float64Array | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startPointString(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset pointsOffset
         */
        static addPoints(builder: flatbuffers.Builder, pointsOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createPointsVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startPointsVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endPointString(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createPointString(builder: flatbuffers.Builder, pointsOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class EllipticArc {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns EllipticArc
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param EllipticArc= obj
         * @returns EllipticArc
         */
        static getRootAsEllipticArc(bb: flatbuffers.ByteBuffer, obj?: EllipticArc): EllipticArc;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param EllipticArc= obj
         * @returns EllipticArc
         */
        static getSizePrefixedRootAsEllipticArc(bb: flatbuffers.ByteBuffer, obj?: EllipticArc): EllipticArc;
        /**
         * @param DEllipse3d= obj
         * @returns DEllipse3d|null
         */
        arc(obj?: DEllipse3d): DEllipse3d | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startEllipticArc(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset arcOffset
         */
        static addArc(builder: flatbuffers.Builder, arcOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endEllipticArc(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createEllipticArc(builder: flatbuffers.Builder, arcOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class BsplineCurve {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns BsplineCurve
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param BsplineCurve= obj
         * @returns BsplineCurve
         */
        static getRootAsBsplineCurve(bb: flatbuffers.ByteBuffer, obj?: BsplineCurve): BsplineCurve;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param BsplineCurve= obj
         * @returns BsplineCurve
         */
        static getSizePrefixedRootAsBsplineCurve(bb: flatbuffers.ByteBuffer, obj?: BsplineCurve): BsplineCurve;
        /**
         * @returns number
         */
        order(): number;
        /**
         * @returns boolean
         */
        closed(): boolean;
        /**
         * @param number index
         * @returns number
         */
        poles(index: number): number | null;
        /**
         * @returns number
         */
        polesLength(): number;
        /**
         * @returns Float64Array
         */
        polesArray(): Float64Array | null;
        /**
         * @param number index
         * @returns number
         */
        weights(index: number): number | null;
        /**
         * @returns number
         */
        weightsLength(): number;
        /**
         * @returns Float64Array
         */
        weightsArray(): Float64Array | null;
        /**
         * @param number index
         * @returns number
         */
        knots(index: number): number | null;
        /**
         * @returns number
         */
        knotsLength(): number;
        /**
         * @returns Float64Array
         */
        knotsArray(): Float64Array | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startBsplineCurve(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number order
         */
        static addOrder(builder: flatbuffers.Builder, order: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param boolean closed
         */
        static addClosed(builder: flatbuffers.Builder, closed: boolean): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset polesOffset
         */
        static addPoles(builder: flatbuffers.Builder, polesOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createPolesVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startPolesVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset weightsOffset
         */
        static addWeights(builder: flatbuffers.Builder, weightsOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createWeightsVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startWeightsVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset knotsOffset
         */
        static addKnots(builder: flatbuffers.Builder, knotsOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createKnotsVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startKnotsVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endBsplineCurve(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createBsplineCurve(builder: flatbuffers.Builder, order: number, closed: boolean, polesOffset: flatbuffers.Offset, weightsOffset: flatbuffers.Offset, knotsOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class InterpolationCurve {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns InterpolationCurve
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param InterpolationCurve= obj
         * @returns InterpolationCurve
         */
        static getRootAsInterpolationCurve(bb: flatbuffers.ByteBuffer, obj?: InterpolationCurve): InterpolationCurve;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param InterpolationCurve= obj
         * @returns InterpolationCurve
         */
        static getSizePrefixedRootAsInterpolationCurve(bb: flatbuffers.ByteBuffer, obj?: InterpolationCurve): InterpolationCurve;
        /**
         * @returns number
         */
        order(): number;
        /**
         * @returns boolean
         */
        closed(): boolean;
        /**
         * @returns number
         */
        isChordLenKnots(): number;
        /**
         * @returns number
         */
        isColinearTangents(): number;
        /**
         * @returns number
         */
        isChordLenTangents(): number;
        /**
         * @returns number
         */
        isNaturalTangents(): number;
        /**
         * @param DPoint3d= obj
         * @returns DPoint3d|null
         */
        startTangent(obj?: DPoint3d): DPoint3d | null;
        /**
         * @param DVector3d= obj
         * @returns DVector3d|null
         */
        endTangent(obj?: DVector3d): DVector3d | null;
        /**
         * @param number index
         * @returns number
         */
        fitPoints(index: number): number | null;
        /**
         * @returns number
         */
        fitPointsLength(): number;
        /**
         * @returns Float64Array
         */
        fitPointsArray(): Float64Array | null;
        /**
         * @param number index
         * @returns number
         */
        knots(index: number): number | null;
        /**
         * @returns number
         */
        knotsLength(): number;
        /**
         * @returns Float64Array
         */
        knotsArray(): Float64Array | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startInterpolationCurve(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number order
         */
        static addOrder(builder: flatbuffers.Builder, order: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param boolean closed
         */
        static addClosed(builder: flatbuffers.Builder, closed: boolean): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number isChordLenKnots
         */
        static addIsChordLenKnots(builder: flatbuffers.Builder, isChordLenKnots: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number isColinearTangents
         */
        static addIsColinearTangents(builder: flatbuffers.Builder, isColinearTangents: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number isChordLenTangents
         */
        static addIsChordLenTangents(builder: flatbuffers.Builder, isChordLenTangents: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number isNaturalTangents
         */
        static addIsNaturalTangents(builder: flatbuffers.Builder, isNaturalTangents: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset startTangentOffset
         */
        static addStartTangent(builder: flatbuffers.Builder, startTangentOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset endTangentOffset
         */
        static addEndTangent(builder: flatbuffers.Builder, endTangentOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset fitPointsOffset
         */
        static addFitPoints(builder: flatbuffers.Builder, fitPointsOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createFitPointsVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startFitPointsVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset knotsOffset
         */
        static addKnots(builder: flatbuffers.Builder, knotsOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createKnotsVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startKnotsVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endInterpolationCurve(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createInterpolationCurve(builder: flatbuffers.Builder, order: number, closed: boolean, isChordLenKnots: number, isColinearTangents: number, isChordLenTangents: number, isNaturalTangents: number, startTangentOffset: flatbuffers.Offset, endTangentOffset: flatbuffers.Offset, fitPointsOffset: flatbuffers.Offset, knotsOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class AkimaCurve {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns AkimaCurve
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param AkimaCurve= obj
         * @returns AkimaCurve
         */
        static getRootAsAkimaCurve(bb: flatbuffers.ByteBuffer, obj?: AkimaCurve): AkimaCurve;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param AkimaCurve= obj
         * @returns AkimaCurve
         */
        static getSizePrefixedRootAsAkimaCurve(bb: flatbuffers.ByteBuffer, obj?: AkimaCurve): AkimaCurve;
        /**
         * @param number index
         * @returns number
         */
        points(index: number): number | null;
        /**
         * @returns number
         */
        pointsLength(): number;
        /**
         * @returns Float64Array
         */
        pointsArray(): Float64Array | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startAkimaCurve(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset pointsOffset
         */
        static addPoints(builder: flatbuffers.Builder, pointsOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createPointsVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startPointsVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endAkimaCurve(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createAkimaCurve(builder: flatbuffers.Builder, pointsOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class CatenaryCurve {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns CatenaryCurve
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param CatenaryCurve= obj
         * @returns CatenaryCurve
         */
        static getRootAsCatenaryCurve(bb: flatbuffers.ByteBuffer, obj?: CatenaryCurve): CatenaryCurve;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param CatenaryCurve= obj
         * @returns CatenaryCurve
         */
        static getSizePrefixedRootAsCatenaryCurve(bb: flatbuffers.ByteBuffer, obj?: CatenaryCurve): CatenaryCurve;
        /**
         * @returns number
         */
        a(): number;
        /**
         * @param DPoint3d= obj
         * @returns DPoint3d|null
         */
        origin(obj?: DPoint3d): DPoint3d | null;
        /**
         * @param DVector3d= obj
         * @returns DVector3d|null
         */
        vectorU(obj?: DVector3d): DVector3d | null;
        /**
         * @param DVector3d= obj
         * @returns DVector3d|null
         */
        vectorV(obj?: DVector3d): DVector3d | null;
        /**
         * @returns number
         */
        x0(): number;
        /**
         * @returns number
         */
        x1(): number;
        /**
         * @param flatbuffers.Builder builder
         */
        static startCatenaryCurve(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number a
         */
        static addA(builder: flatbuffers.Builder, a: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset originOffset
         */
        static addOrigin(builder: flatbuffers.Builder, originOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset vectorUOffset
         */
        static addVectorU(builder: flatbuffers.Builder, vectorUOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset vectorVOffset
         */
        static addVectorV(builder: flatbuffers.Builder, vectorVOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number x0
         */
        static addX0(builder: flatbuffers.Builder, x0: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number x1
         */
        static addX1(builder: flatbuffers.Builder, x1: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endCatenaryCurve(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createCatenaryCurve(builder: flatbuffers.Builder, a: number, originOffset: flatbuffers.Offset, vectorUOffset: flatbuffers.Offset, vectorVOffset: flatbuffers.Offset, x0: number, x1: number): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class PartialCurve {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns PartialCurve
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param PartialCurve= obj
         * @returns PartialCurve
         */
        static getRootAsPartialCurve(bb: flatbuffers.ByteBuffer, obj?: PartialCurve): PartialCurve;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param PartialCurve= obj
         * @returns PartialCurve
         */
        static getSizePrefixedRootAsPartialCurve(bb: flatbuffers.ByteBuffer, obj?: PartialCurve): PartialCurve;
        /**
         * @returns number
         */
        fraction0(): number;
        /**
         * @returns number
         */
        fraction1(): number;
        /**
         * @param VariantGeometry= obj
         * @returns VariantGeometry|null
         */
        target(obj?: VariantGeometry): VariantGeometry | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startPartialCurve(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number fraction0
         */
        static addFraction0(builder: flatbuffers.Builder, fraction0: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number fraction1
         */
        static addFraction1(builder: flatbuffers.Builder, fraction1: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset targetOffset
         */
        static addTarget(builder: flatbuffers.Builder, targetOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endPartialCurve(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createPartialCurve(builder: flatbuffers.Builder, fraction0: number, fraction1: number, targetOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class CurvePrimitiveId {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns CurvePrimitiveId
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param CurvePrimitiveId= obj
         * @returns CurvePrimitiveId
         */
        static getRootAsCurvePrimitiveId(bb: flatbuffers.ByteBuffer, obj?: CurvePrimitiveId): CurvePrimitiveId;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param CurvePrimitiveId= obj
         * @returns CurvePrimitiveId
         */
        static getSizePrefixedRootAsCurvePrimitiveId(bb: flatbuffers.ByteBuffer, obj?: CurvePrimitiveId): CurvePrimitiveId;
        /**
         * @returns number
         */
        type(): number;
        /**
         * @returns number
         */
        geomIndex(): number;
        /**
         * @returns number
         */
        partIndex(): number;
        /**
         * @param number index
         * @returns number
         */
        bytes(index: number): number | null;
        /**
         * @returns number
         */
        bytesLength(): number;
        /**
         * @returns Uint8Array
         */
        bytesArray(): Uint8Array | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startCurvePrimitiveId(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number type
         */
        static addType(builder: flatbuffers.Builder, type: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number geomIndex
         */
        static addGeomIndex(builder: flatbuffers.Builder, geomIndex: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number partIndex
         */
        static addPartIndex(builder: flatbuffers.Builder, partIndex: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset bytesOffset
         */
        static addBytes(builder: flatbuffers.Builder, bytesOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createBytesVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startBytesVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endCurvePrimitiveId(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createCurvePrimitiveId(builder: flatbuffers.Builder, type: number, geomIndex: number, partIndex: number, bytesOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class CurveVector {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns CurveVector
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param CurveVector= obj
         * @returns CurveVector
         */
        static getRootAsCurveVector(bb: flatbuffers.ByteBuffer, obj?: CurveVector): CurveVector;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param CurveVector= obj
         * @returns CurveVector
         */
        static getSizePrefixedRootAsCurveVector(bb: flatbuffers.ByteBuffer, obj?: CurveVector): CurveVector;
        /**
         * @returns number
         */
        type(): number;
        /**
         * @param number index
         * @param VariantGeometry= obj
         * @returns VariantGeometry
         */
        curves(index: number, obj?: VariantGeometry): VariantGeometry | null;
        /**
         * @returns number
         */
        curvesLength(): number;
        /**
         * @param flatbuffers.Builder builder
         */
        static startCurveVector(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number type
         */
        static addType(builder: flatbuffers.Builder, type: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset curvesOffset
         */
        static addCurves(builder: flatbuffers.Builder, curvesOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<flatbuffers.Offset> data
         * @returns flatbuffers.Offset
         */
        static createCurvesVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startCurvesVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endCurveVector(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createCurveVector(builder: flatbuffers.Builder, type: number, curvesOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class VectorOfVariantGeometry {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns VectorOfVariantGeometry
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param VectorOfVariantGeometry= obj
         * @returns VectorOfVariantGeometry
         */
        static getRootAsVectorOfVariantGeometry(bb: flatbuffers.ByteBuffer, obj?: VectorOfVariantGeometry): VectorOfVariantGeometry;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param VectorOfVariantGeometry= obj
         * @returns VectorOfVariantGeometry
         */
        static getSizePrefixedRootAsVectorOfVariantGeometry(bb: flatbuffers.ByteBuffer, obj?: VectorOfVariantGeometry): VectorOfVariantGeometry;
        /**
         * @param number index
         * @param VariantGeometry= obj
         * @returns VariantGeometry
         */
        members(index: number, obj?: VariantGeometry): VariantGeometry | null;
        /**
         * @returns number
         */
        membersLength(): number;
        /**
         * @param flatbuffers.Builder builder
         */
        static startVectorOfVariantGeometry(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset membersOffset
         */
        static addMembers(builder: flatbuffers.Builder, membersOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<flatbuffers.Offset> data
         * @returns flatbuffers.Offset
         */
        static createMembersVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startMembersVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endVectorOfVariantGeometry(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createVectorOfVariantGeometry(builder: flatbuffers.Builder, membersOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class BsplineSurface {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns BsplineSurface
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param BsplineSurface= obj
         * @returns BsplineSurface
         */
        static getRootAsBsplineSurface(bb: flatbuffers.ByteBuffer, obj?: BsplineSurface): BsplineSurface;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param BsplineSurface= obj
         * @returns BsplineSurface
         */
        static getSizePrefixedRootAsBsplineSurface(bb: flatbuffers.ByteBuffer, obj?: BsplineSurface): BsplineSurface;
        /**
         * @param number index
         * @returns number
         */
        poles(index: number): number | null;
        /**
         * @returns number
         */
        polesLength(): number;
        /**
         * @returns Float64Array
         */
        polesArray(): Float64Array | null;
        /**
         * @param number index
         * @returns number
         */
        weights(index: number): number | null;
        /**
         * @returns number
         */
        weightsLength(): number;
        /**
         * @returns Float64Array
         */
        weightsArray(): Float64Array | null;
        /**
         * @param number index
         * @returns number
         */
        knotsU(index: number): number | null;
        /**
         * @returns number
         */
        knotsULength(): number;
        /**
         * @returns Float64Array
         */
        knotsUArray(): Float64Array | null;
        /**
         * @param number index
         * @returns number
         */
        knotsV(index: number): number | null;
        /**
         * @returns number
         */
        knotsVLength(): number;
        /**
         * @returns Float64Array
         */
        knotsVArray(): Float64Array | null;
        /**
         * @returns number
         */
        numPolesU(): number;
        /**
         * @returns number
         */
        numPolesV(): number;
        /**
         * @returns number
         */
        orderU(): number;
        /**
         * @returns number
         */
        orderV(): number;
        /**
         * @returns number
         */
        numRulesU(): number;
        /**
         * @returns number
         */
        numRulesV(): number;
        /**
         * @returns number
         */
        holeOrigin(): number;
        /**
         * @param CurveVector= obj
         * @returns CurveVector|null
         */
        boundaries(obj?: CurveVector): CurveVector | null;
        /**
         * @returns boolean
         */
        closedU(): boolean;
        /**
         * @returns boolean
         */
        closedV(): boolean;
        /**
         * @param flatbuffers.Builder builder
         */
        static startBsplineSurface(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset polesOffset
         */
        static addPoles(builder: flatbuffers.Builder, polesOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createPolesVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startPolesVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset weightsOffset
         */
        static addWeights(builder: flatbuffers.Builder, weightsOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createWeightsVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startWeightsVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset knotsUOffset
         */
        static addKnotsU(builder: flatbuffers.Builder, knotsUOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createKnotsUVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startKnotsUVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset knotsVOffset
         */
        static addKnotsV(builder: flatbuffers.Builder, knotsVOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createKnotsVVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startKnotsVVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number numPolesU
         */
        static addNumPolesU(builder: flatbuffers.Builder, numPolesU: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number numPolesV
         */
        static addNumPolesV(builder: flatbuffers.Builder, numPolesV: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number orderU
         */
        static addOrderU(builder: flatbuffers.Builder, orderU: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number orderV
         */
        static addOrderV(builder: flatbuffers.Builder, orderV: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number numRulesU
         */
        static addNumRulesU(builder: flatbuffers.Builder, numRulesU: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number numRulesV
         */
        static addNumRulesV(builder: flatbuffers.Builder, numRulesV: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number holeOrigin
         */
        static addHoleOrigin(builder: flatbuffers.Builder, holeOrigin: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset boundariesOffset
         */
        static addBoundaries(builder: flatbuffers.Builder, boundariesOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param boolean closedU
         */
        static addClosedU(builder: flatbuffers.Builder, closedU: boolean): void;
        /**
         * @param flatbuffers.Builder builder
         * @param boolean closedV
         */
        static addClosedV(builder: flatbuffers.Builder, closedV: boolean): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endBsplineSurface(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createBsplineSurface(builder: flatbuffers.Builder, polesOffset: flatbuffers.Offset, weightsOffset: flatbuffers.Offset, knotsUOffset: flatbuffers.Offset, knotsVOffset: flatbuffers.Offset, numPolesU: number, numPolesV: number, orderU: number, orderV: number, numRulesU: number, numRulesV: number, holeOrigin: number, boundariesOffset: flatbuffers.Offset, closedU: boolean, closedV: boolean): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TopoBox {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TopoBox
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoBox= obj
         * @returns TopoBox
         */
        static getRootAsTopoBox(bb: flatbuffers.ByteBuffer, obj?: TopoBox): TopoBox;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoBox= obj
         * @returns TopoBox
         */
        static getSizePrefixedRootAsTopoBox(bb: flatbuffers.ByteBuffer, obj?: TopoBox): TopoBox;
        /**
         * @param TopoBoxDetail= obj
         * @returns TopoBoxDetail|null
         */
        detail(obj?: TopoBoxDetail): TopoBoxDetail | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startTopoBox(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset detailOffset
         */
        static addDetail(builder: flatbuffers.Builder, detailOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endTopoBox(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createTopoBox(builder: flatbuffers.Builder, detailOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TopoSphere {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TopoSphere
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoSphere= obj
         * @returns TopoSphere
         */
        static getRootAsTopoSphere(bb: flatbuffers.ByteBuffer, obj?: TopoSphere): TopoSphere;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoSphere= obj
         * @returns TopoSphere
         */
        static getSizePrefixedRootAsTopoSphere(bb: flatbuffers.ByteBuffer, obj?: TopoSphere): TopoSphere;
        /**
         * @param TopoSphereDetail= obj
         * @returns TopoSphereDetail|null
         */
        detail(obj?: TopoSphereDetail): TopoSphereDetail | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startTopoSphere(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset detailOffset
         */
        static addDetail(builder: flatbuffers.Builder, detailOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endTopoSphere(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createTopoSphere(builder: flatbuffers.Builder, detailOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TopoCone {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TopoCone
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoCone= obj
         * @returns TopoCone
         */
        static getRootAsTopoCone(bb: flatbuffers.ByteBuffer, obj?: TopoCone): TopoCone;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoCone= obj
         * @returns TopoCone
         */
        static getSizePrefixedRootAsTopoCone(bb: flatbuffers.ByteBuffer, obj?: TopoCone): TopoCone;
        /**
         * @param TopoConeDetail= obj
         * @returns TopoConeDetail|null
         */
        detail(obj?: TopoConeDetail): TopoConeDetail | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startTopoCone(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset detailOffset
         */
        static addDetail(builder: flatbuffers.Builder, detailOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endTopoCone(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createTopoCone(builder: flatbuffers.Builder, detailOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TopoTorusPipe {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TopoTorusPipe
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoTorusPipe= obj
         * @returns TopoTorusPipe
         */
        static getRootAsTopoTorusPipe(bb: flatbuffers.ByteBuffer, obj?: TopoTorusPipe): TopoTorusPipe;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoTorusPipe= obj
         * @returns TopoTorusPipe
         */
        static getSizePrefixedRootAsTopoTorusPipe(bb: flatbuffers.ByteBuffer, obj?: TopoTorusPipe): TopoTorusPipe;
        /**
         * @param TopoTorusPipeDetail= obj
         * @returns TopoTorusPipeDetail|null
         */
        detail(obj?: TopoTorusPipeDetail): TopoTorusPipeDetail | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startTopoTorusPipe(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset detailOffset
         */
        static addDetail(builder: flatbuffers.Builder, detailOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endTopoTorusPipe(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createTopoTorusPipe(builder: flatbuffers.Builder, detailOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TopoExtrusion {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TopoExtrusion
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoExtrusion= obj
         * @returns TopoExtrusion
         */
        static getRootAsTopoExtrusion(bb: flatbuffers.ByteBuffer, obj?: TopoExtrusion): TopoExtrusion;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoExtrusion= obj
         * @returns TopoExtrusion
         */
        static getSizePrefixedRootAsTopoExtrusion(bb: flatbuffers.ByteBuffer, obj?: TopoExtrusion): TopoExtrusion;
        /**
         * @param CurveVector= obj
         * @returns CurveVector|null
         */
        baseCurve(obj?: CurveVector): CurveVector | null;
        /**
         * @param DVector3d= obj
         * @returns DVector3d|null
         */
        extrusionVector(obj?: DVector3d): DVector3d | null;
        /**
         * @returns boolean
         */
        capped(): boolean;
        /**
         * @param flatbuffers.Builder builder
         */
        static startTopoExtrusion(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset baseCurveOffset
         */
        static addBaseCurve(builder: flatbuffers.Builder, baseCurveOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset extrusionVectorOffset
         */
        static addExtrusionVector(builder: flatbuffers.Builder, extrusionVectorOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param boolean capped
         */
        static addCapped(builder: flatbuffers.Builder, capped: boolean): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endTopoExtrusion(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createTopoExtrusion(builder: flatbuffers.Builder, baseCurveOffset: flatbuffers.Offset, extrusionVectorOffset: flatbuffers.Offset, capped: boolean): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TopoRotationalSweep {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TopoRotationalSweep
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoRotationalSweep= obj
         * @returns TopoRotationalSweep
         */
        static getRootAsTopoRotationalSweep(bb: flatbuffers.ByteBuffer, obj?: TopoRotationalSweep): TopoRotationalSweep;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoRotationalSweep= obj
         * @returns TopoRotationalSweep
         */
        static getSizePrefixedRootAsTopoRotationalSweep(bb: flatbuffers.ByteBuffer, obj?: TopoRotationalSweep): TopoRotationalSweep;
        /**
         * @param CurveVector= obj
         * @returns CurveVector|null
         */
        baseCurve(obj?: CurveVector): CurveVector | null;
        /**
         * @param DRay3d= obj
         * @returns DRay3d|null
         */
        axis(obj?: DRay3d): DRay3d | null;
        /**
         * @returns number
         */
        sweepRadians(): number;
        /**
         * @returns number
         */
        numVRules(): number;
        /**
         * @returns boolean
         */
        capped(): boolean;
        /**
         * @param flatbuffers.Builder builder
         */
        static startTopoRotationalSweep(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset baseCurveOffset
         */
        static addBaseCurve(builder: flatbuffers.Builder, baseCurveOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset axisOffset
         */
        static addAxis(builder: flatbuffers.Builder, axisOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number sweepRadians
         */
        static addSweepRadians(builder: flatbuffers.Builder, sweepRadians: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number numVRules
         */
        static addNumVRules(builder: flatbuffers.Builder, numVRules: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param boolean capped
         */
        static addCapped(builder: flatbuffers.Builder, capped: boolean): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endTopoRotationalSweep(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createTopoRotationalSweep(builder: flatbuffers.Builder, baseCurveOffset: flatbuffers.Offset, axisOffset: flatbuffers.Offset, sweepRadians: number, numVRules: number, capped: boolean): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TopoRuledSweep {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TopoRuledSweep
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoRuledSweep= obj
         * @returns TopoRuledSweep
         */
        static getRootAsTopoRuledSweep(bb: flatbuffers.ByteBuffer, obj?: TopoRuledSweep): TopoRuledSweep;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TopoRuledSweep= obj
         * @returns TopoRuledSweep
         */
        static getSizePrefixedRootAsTopoRuledSweep(bb: flatbuffers.ByteBuffer, obj?: TopoRuledSweep): TopoRuledSweep;
        /**
         * @param number index
         * @param CurveVector= obj
         * @returns CurveVector
         */
        curves(index: number, obj?: CurveVector): CurveVector | null;
        /**
         * @returns number
         */
        curvesLength(): number;
        /**
         * @returns boolean
         */
        capped(): boolean;
        /**
         * @param flatbuffers.Builder builder
         */
        static startTopoRuledSweep(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset curvesOffset
         */
        static addCurves(builder: flatbuffers.Builder, curvesOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<flatbuffers.Offset> data
         * @returns flatbuffers.Offset
         */
        static createCurvesVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startCurvesVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param boolean capped
         */
        static addCapped(builder: flatbuffers.Builder, capped: boolean): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endTopoRuledSweep(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createTopoRuledSweep(builder: flatbuffers.Builder, curvesOffset: flatbuffers.Offset, capped: boolean): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class PolyfaceAuxChannelData {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns PolyfaceAuxChannelData
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param PolyfaceAuxChannelData= obj
         * @returns PolyfaceAuxChannelData
         */
        static getRootAsPolyfaceAuxChannelData(bb: flatbuffers.ByteBuffer, obj?: PolyfaceAuxChannelData): PolyfaceAuxChannelData;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param PolyfaceAuxChannelData= obj
         * @returns PolyfaceAuxChannelData
         */
        static getSizePrefixedRootAsPolyfaceAuxChannelData(bb: flatbuffers.ByteBuffer, obj?: PolyfaceAuxChannelData): PolyfaceAuxChannelData;
        /**
         * @returns number
         */
        input(): number;
        /**
         * @param number index
         * @returns number
         */
        values(index: number): number | null;
        /**
         * @returns number
         */
        valuesLength(): number;
        /**
         * @returns Float64Array
         */
        valuesArray(): Float64Array | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startPolyfaceAuxChannelData(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number input
         */
        static addInput(builder: flatbuffers.Builder, input: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset valuesOffset
         */
        static addValues(builder: flatbuffers.Builder, valuesOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createValuesVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startValuesVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endPolyfaceAuxChannelData(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createPolyfaceAuxChannelData(builder: flatbuffers.Builder, input: number, valuesOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class PolyfaceAuxChannel {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns PolyfaceAuxChannel
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param PolyfaceAuxChannel= obj
         * @returns PolyfaceAuxChannel
         */
        static getRootAsPolyfaceAuxChannel(bb: flatbuffers.ByteBuffer, obj?: PolyfaceAuxChannel): PolyfaceAuxChannel;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param PolyfaceAuxChannel= obj
         * @returns PolyfaceAuxChannel
         */
        static getSizePrefixedRootAsPolyfaceAuxChannel(bb: flatbuffers.ByteBuffer, obj?: PolyfaceAuxChannel): PolyfaceAuxChannel;
        /**
         * @returns number
         */
        dataType(): number;
        /**
         * @param flatbuffers.Encoding= optionalEncoding
         * @returns string|Uint8Array|null
         */
        name(): string | null;
        name(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
        /**
         * @param flatbuffers.Encoding= optionalEncoding
         * @returns string|Uint8Array|null
         */
        inputName(): string | null;
        inputName(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
        /**
         * @param number index
         * @param PolyfaceAuxChannelData= obj
         * @returns PolyfaceAuxChannelData
         */
        data(index: number, obj?: PolyfaceAuxChannelData): PolyfaceAuxChannelData | null;
        /**
         * @returns number
         */
        dataLength(): number;
        /**
         * @param flatbuffers.Builder builder
         */
        static startPolyfaceAuxChannel(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number dataType
         */
        static addDataType(builder: flatbuffers.Builder, dataType: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset nameOffset
         */
        static addName(builder: flatbuffers.Builder, nameOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset inputNameOffset
         */
        static addInputName(builder: flatbuffers.Builder, inputNameOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset dataOffset
         */
        static addData(builder: flatbuffers.Builder, dataOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<flatbuffers.Offset> data
         * @returns flatbuffers.Offset
         */
        static createDataVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startDataVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endPolyfaceAuxChannel(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createPolyfaceAuxChannel(builder: flatbuffers.Builder, dataType: number, nameOffset: flatbuffers.Offset, inputNameOffset: flatbuffers.Offset, dataOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class PolyfaceAuxData {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns PolyfaceAuxData
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param PolyfaceAuxData= obj
         * @returns PolyfaceAuxData
         */
        static getRootAsPolyfaceAuxData(bb: flatbuffers.ByteBuffer, obj?: PolyfaceAuxData): PolyfaceAuxData;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param PolyfaceAuxData= obj
         * @returns PolyfaceAuxData
         */
        static getSizePrefixedRootAsPolyfaceAuxData(bb: flatbuffers.ByteBuffer, obj?: PolyfaceAuxData): PolyfaceAuxData;
        /**
         * @param number index
         * @returns number
         */
        indices(index: number): number | null;
        /**
         * @returns number
         */
        indicesLength(): number;
        /**
         * @returns Int32Array
         */
        indicesArray(): Int32Array | null;
        /**
         * @param number index
         * @param PolyfaceAuxChannel= obj
         * @returns PolyfaceAuxChannel
         */
        channels(index: number, obj?: PolyfaceAuxChannel): PolyfaceAuxChannel | null;
        /**
         * @returns number
         */
        channelsLength(): number;
        /**
         * @param flatbuffers.Builder builder
         */
        static startPolyfaceAuxData(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset indicesOffset
         */
        static addIndices(builder: flatbuffers.Builder, indicesOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createIndicesVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startIndicesVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset channelsOffset
         */
        static addChannels(builder: flatbuffers.Builder, channelsOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<flatbuffers.Offset> data
         * @returns flatbuffers.Offset
         */
        static createChannelsVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startChannelsVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endPolyfaceAuxData(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createPolyfaceAuxData(builder: flatbuffers.Builder, indicesOffset: flatbuffers.Offset, channelsOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TaggedNumericData {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TaggedNumericData
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TaggedNumericData= obj
         * @returns TaggedNumericData
         */
        static getRootAsTaggedNumericData(bb: flatbuffers.ByteBuffer, obj?: TaggedNumericData): TaggedNumericData;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TaggedNumericData= obj
         * @returns TaggedNumericData
         */
        static getSizePrefixedRootAsTaggedNumericData(bb: flatbuffers.ByteBuffer, obj?: TaggedNumericData): TaggedNumericData;
        /**
         * @returns number
         */
        tagA(): number;
        /**
         * @returns number
         */
        tagB(): number;
        /**
         * @param number index
         * @returns number
         */
        intData(index: number): number | null;
        /**
         * @returns number
         */
        intDataLength(): number;
        /**
         * @returns Int32Array
         */
        intDataArray(): Int32Array | null;
        /**
         * @param number index
         * @returns number
         */
        doubleData(index: number): number | null;
        /**
         * @returns number
         */
        doubleDataLength(): number;
        /**
         * @returns Float64Array
         */
        doubleDataArray(): Float64Array | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startTaggedNumericData(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number tagA
         */
        static addTagA(builder: flatbuffers.Builder, tagA: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number tagB
         */
        static addTagB(builder: flatbuffers.Builder, tagB: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset intDataOffset
         */
        static addIntData(builder: flatbuffers.Builder, intDataOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createIntDataVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startIntDataVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset doubleDataOffset
         */
        static addDoubleData(builder: flatbuffers.Builder, doubleDataOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createDoubleDataVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startDoubleDataVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endTaggedNumericData(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createTaggedNumericData(builder: flatbuffers.Builder, tagA: number, tagB: number, intDataOffset: flatbuffers.Offset, doubleDataOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class Polyface {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns Polyface
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param Polyface= obj
         * @returns Polyface
         */
        static getRootAsPolyface(bb: flatbuffers.ByteBuffer, obj?: Polyface): Polyface;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param Polyface= obj
         * @returns Polyface
         */
        static getSizePrefixedRootAsPolyface(bb: flatbuffers.ByteBuffer, obj?: Polyface): Polyface;
        /**
         * @param number index
         * @returns number
         */
        point(index: number): number | null;
        /**
         * @returns number
         */
        pointLength(): number;
        /**
         * @returns Float64Array
         */
        pointArray(): Float64Array | null;
        /**
         * @param number index
         * @returns number
         */
        param(index: number): number | null;
        /**
         * @returns number
         */
        paramLength(): number;
        /**
         * @returns Float64Array
         */
        paramArray(): Float64Array | null;
        /**
         * @param number index
         * @returns number
         */
        normal(index: number): number | null;
        /**
         * @returns number
         */
        normalLength(): number;
        /**
         * @returns Float64Array
         */
        normalArray(): Float64Array | null;
        /**
         * @param number index
         * @returns number
         */
        doubleColor(index: number): number | null;
        /**
         * @returns number
         */
        doubleColorLength(): number;
        /**
         * @returns Float64Array
         */
        doubleColorArray(): Float64Array | null;
        /**
         * @param number index
         * @returns number
         */
        intColor(index: number): number | null;
        /**
         * @returns number
         */
        intColorLength(): number;
        /**
         * @returns Uint32Array
         */
        intColorArray(): Uint32Array | null;
        /**
         * @param number index
         * @returns number
         */
        pointIndex(index: number): number | null;
        /**
         * @returns number
         */
        pointIndexLength(): number;
        /**
         * @returns Int32Array
         */
        pointIndexArray(): Int32Array | null;
        /**
         * @param number index
         * @returns number
         */
        paramIndex(index: number): number | null;
        /**
         * @returns number
         */
        paramIndexLength(): number;
        /**
         * @returns Int32Array
         */
        paramIndexArray(): Int32Array | null;
        /**
         * @param number index
         * @returns number
         */
        normalIndex(index: number): number | null;
        /**
         * @returns number
         */
        normalIndexLength(): number;
        /**
         * @returns Int32Array
         */
        normalIndexArray(): Int32Array | null;
        /**
         * @param number index
         * @returns number
         */
        colorIndex(index: number): number | null;
        /**
         * @returns number
         */
        colorIndexLength(): number;
        /**
         * @returns Int32Array
         */
        colorIndexArray(): Int32Array | null;
        /**
         * @param number index
         * @returns number
         */
        colorTable(index: number): number | null;
        /**
         * @returns number
         */
        colorTableLength(): number;
        /**
         * @returns Int32Array
         */
        colorTableArray(): Int32Array | null;
        /**
         * @returns number
         */
        numPerFace(): number;
        /**
         * @returns number
         */
        numPerRow(): number;
        /**
         * @returns number
         */
        meshStyle(): number;
        /**
         * @returns boolean
         */
        twoSided(): boolean;
        /**
         * @param number index
         * @returns number
         */
        faceIndex(index: number): number | null;
        /**
         * @returns number
         */
        faceIndexLength(): number;
        /**
         * @returns Int32Array
         */
        faceIndexArray(): Int32Array | null;
        /**
         * @param number index
         * @returns number
         */
        faceData(index: number): number | null;
        /**
         * @returns number
         */
        faceDataLength(): number;
        /**
         * @returns Float64Array
         */
        faceDataArray(): Float64Array | null;
        /**
         * @param PolyfaceAuxData= obj
         * @returns PolyfaceAuxData|null
         */
        auxData(obj?: PolyfaceAuxData): PolyfaceAuxData | null;
        /**
         * @returns number
         */
        expectedClosure(): number;
        /**
         * @param TaggedNumericData= obj
         * @returns TaggedNumericData|null
         */
        taggedNumericData(obj?: TaggedNumericData): TaggedNumericData | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startPolyface(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset pointOffset
         */
        static addPoint(builder: flatbuffers.Builder, pointOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createPointVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startPointVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset paramOffset
         */
        static addParam(builder: flatbuffers.Builder, paramOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createParamVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startParamVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset normalOffset
         */
        static addNormal(builder: flatbuffers.Builder, normalOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createNormalVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startNormalVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset doubleColorOffset
         */
        static addDoubleColor(builder: flatbuffers.Builder, doubleColorOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createDoubleColorVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startDoubleColorVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset intColorOffset
         */
        static addIntColor(builder: flatbuffers.Builder, intColorOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createIntColorVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startIntColorVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset pointIndexOffset
         */
        static addPointIndex(builder: flatbuffers.Builder, pointIndexOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createPointIndexVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startPointIndexVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset paramIndexOffset
         */
        static addParamIndex(builder: flatbuffers.Builder, paramIndexOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createParamIndexVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startParamIndexVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset normalIndexOffset
         */
        static addNormalIndex(builder: flatbuffers.Builder, normalIndexOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createNormalIndexVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startNormalIndexVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset colorIndexOffset
         */
        static addColorIndex(builder: flatbuffers.Builder, colorIndexOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createColorIndexVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startColorIndexVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset colorTableOffset
         */
        static addColorTable(builder: flatbuffers.Builder, colorTableOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createColorTableVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startColorTableVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number numPerFace
         */
        static addNumPerFace(builder: flatbuffers.Builder, numPerFace: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number numPerRow
         */
        static addNumPerRow(builder: flatbuffers.Builder, numPerRow: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number meshStyle
         */
        static addMeshStyle(builder: flatbuffers.Builder, meshStyle: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param boolean twoSided
         */
        static addTwoSided(builder: flatbuffers.Builder, twoSided: boolean): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset faceIndexOffset
         */
        static addFaceIndex(builder: flatbuffers.Builder, faceIndexOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createFaceIndexVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startFaceIndexVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset faceDataOffset
         */
        static addFaceData(builder: flatbuffers.Builder, faceDataOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createFaceDataVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startFaceDataVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset auxDataOffset
         */
        static addAuxData(builder: flatbuffers.Builder, auxDataOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param number expectedClosure
         */
        static addExpectedClosure(builder: flatbuffers.Builder, expectedClosure: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset taggedNumericDataOffset
         */
        static addTaggedNumericData(builder: flatbuffers.Builder, taggedNumericDataOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endPolyface(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createPolyface(builder: flatbuffers.Builder, pointOffset: flatbuffers.Offset, paramOffset: flatbuffers.Offset, normalOffset: flatbuffers.Offset, doubleColorOffset: flatbuffers.Offset, intColorOffset: flatbuffers.Offset, pointIndexOffset: flatbuffers.Offset, paramIndexOffset: flatbuffers.Offset, normalIndexOffset: flatbuffers.Offset, colorIndexOffset: flatbuffers.Offset, colorTableOffset: flatbuffers.Offset, numPerFace: number, numPerRow: number, meshStyle: number, twoSided: boolean, faceIndexOffset: flatbuffers.Offset, faceDataOffset: flatbuffers.Offset, auxDataOffset: flatbuffers.Offset, expectedClosure: number, taggedNumericDataOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TransitionSpiralDetail {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TransitionSpiralDetail
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param DTransform3d= obj
         * @returns DTransform3d|null
         */
        transform(obj?: DTransform3d): DTransform3d | null;
        /**
         * @returns number
         */
        fractionA(): number;
        /**
         * @returns number
         */
        fractionB(): number;
        /**
         * @returns number
         */
        bearing0Radians(): number;
        /**
         * @returns number
         */
        bearing1Radians(): number;
        /**
         * @returns number
         */
        curvature0(): number;
        /**
         * @returns number
         */
        curvature1(): number;
        /**
         * @returns number
         */
        spiralType(): number;
        /**
         * @returns number
         */
        constructionHint(): number;
        /**
         * @param flatbuffers.Builder builder
         * @param number transform_axx
         * @param number transform_axy
         * @param number transform_axz
         * @param number transform_axw
         * @param number transform_ayx
         * @param number transform_ayy
         * @param number transform_ayz
         * @param number transform_ayw
         * @param number transform_azx
         * @param number transform_azy
         * @param number transform_azz
         * @param number transform_azw
         * @param number fractionA
         * @param number fractionB
         * @param number bearing0Radians
         * @param number bearing1Radians
         * @param number curvature0
         * @param number curvature1
         * @param number spiralType
         * @param number constructionHint
         * @returns flatbuffers.Offset
         */
        static createTransitionSpiralDetail(builder: flatbuffers.Builder, transform_axx: number, transform_axy: number, transform_axz: number, transform_axw: number, transform_ayx: number, transform_ayy: number, transform_ayz: number, transform_ayw: number, transform_azx: number, transform_azy: number, transform_azz: number, transform_azw: number, fractionA: number, fractionB: number, bearing0Radians: number, bearing1Radians: number, curvature0: number, curvature1: number, spiralType: number, constructionHint: number): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class DirectSpiralDetail {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns DirectSpiralDetail
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @returns number
         */
        nominalLength(): number;
        /**
         * @returns number
         */
        trueLength(): number;
        /**
         * @returns number
         */
        doubleTag0(): number;
        /**
         * @returns number
         */
        doubleTag1(): number;
        /**
         * @returns number
         */
        intTag0(): number;
        /**
         * @returns number
         */
        intTag1(): number;
        /**
         * @param flatbuffers.Builder builder
         * @param number nominalLength
         * @param number trueLength
         * @param number doubleTag0
         * @param number doubleTag1
         * @param number intTag0
         * @param number intTag1
         * @returns flatbuffers.Offset
         */
        static createDirectSpiralDetail(builder: flatbuffers.Builder, nominalLength: number, trueLength: number, doubleTag0: number, doubleTag1: number, intTag0: number, intTag1: number): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class TransitionSpiral {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns TransitionSpiral
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TransitionSpiral= obj
         * @returns TransitionSpiral
         */
        static getRootAsTransitionSpiral(bb: flatbuffers.ByteBuffer, obj?: TransitionSpiral): TransitionSpiral;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param TransitionSpiral= obj
         * @returns TransitionSpiral
         */
        static getSizePrefixedRootAsTransitionSpiral(bb: flatbuffers.ByteBuffer, obj?: TransitionSpiral): TransitionSpiral;
        /**
         * @param TransitionSpiralDetail= obj
         * @returns TransitionSpiralDetail|null
         */
        detail(obj?: TransitionSpiralDetail): TransitionSpiralDetail | null;
        /**
         * @param number index
         * @returns number
         */
        extraData(index: number): number | null;
        /**
         * @returns number
         */
        extraDataLength(): number;
        /**
         * @returns Float64Array
         */
        extraDataArray(): Float64Array | null;
        /**
         * @param DirectSpiralDetail= obj
         * @returns DirectSpiralDetail|null
         */
        directDetail(obj?: DirectSpiralDetail): DirectSpiralDetail | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startTransitionSpiral(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset detailOffset
         */
        static addDetail(builder: flatbuffers.Builder, detailOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset extraDataOffset
         */
        static addExtraData(builder: flatbuffers.Builder, extraDataOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param Array.<number> data
         * @returns flatbuffers.Offset
         */
        static createExtraDataVector(builder: flatbuffers.Builder, data: number[] | Uint8Array): flatbuffers.Offset;
        /**
         * @param flatbuffers.Builder builder
         * @param number numElems
         */
        static startExtraDataVector(builder: flatbuffers.Builder, numElems: number): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset directDetailOffset
         */
        static addDirectDetail(builder: flatbuffers.Builder, directDetailOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endTransitionSpiral(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createTransitionSpiral(builder: flatbuffers.Builder, detailOffset: flatbuffers.Offset, extraDataOffset: flatbuffers.Offset, directDetailOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
    /**
     * @constructor
     */
    class VariantGeometry {
        bb: flatbuffers.ByteBuffer | null;
        bb_pos: number;
        /**
         * @param number i
         * @param flatbuffers.ByteBuffer bb
         * @returns VariantGeometry
         */
        __init(i: number, bb: flatbuffers.ByteBuffer): this;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param VariantGeometry= obj
         * @returns VariantGeometry
         */
        static getRootAsVariantGeometry(bb: flatbuffers.ByteBuffer, obj?: VariantGeometry): VariantGeometry;
        /**
         * @param flatbuffers.ByteBuffer bb
         * @param VariantGeometry= obj
         * @returns VariantGeometry
         */
        static getSizePrefixedRootAsVariantGeometry(bb: flatbuffers.ByteBuffer, obj?: VariantGeometry): VariantGeometry;
        /**
         * @returns VariantGeometryUnion
         */
        geometryType(): VariantGeometryUnion;
        /**
         * @param flatbuffers.Table obj
         * @returns ?flatbuffers.Table
         */
        geometry<T extends flatbuffers.Table>(obj: T): T | null;
        /**
         * @param CurvePrimitiveId= obj
         * @returns CurvePrimitiveId|null
         */
        tag(obj?: CurvePrimitiveId): CurvePrimitiveId | null;
        /**
         * @param flatbuffers.Builder builder
         */
        static startVariantGeometry(builder: flatbuffers.Builder): void;
        /**
         * @param flatbuffers.Builder builder
         * @param VariantGeometryUnion geometryType
         */
        static addGeometryType(builder: flatbuffers.Builder, geometryType: VariantGeometryUnion): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset geometryOffset
         */
        static addGeometry(builder: flatbuffers.Builder, geometryOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @param flatbuffers.Offset tagOffset
         */
        static addTag(builder: flatbuffers.Builder, tagOffset: flatbuffers.Offset): void;
        /**
         * @param flatbuffers.Builder builder
         * @returns flatbuffers.Offset
         */
        static endVariantGeometry(builder: flatbuffers.Builder): flatbuffers.Offset;
        static createVariantGeometry(builder: flatbuffers.Builder, geometryType: VariantGeometryUnion, geometryOffset: flatbuffers.Offset, tagOffset: flatbuffers.Offset): flatbuffers.Offset;
    }
}
