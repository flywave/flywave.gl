import { AkimaCurve3d } from "../bspline/akima-curve3d";
import { type BezierCurve3d } from "../bspline/bezier-curve3d";
import { type BezierCurve3dH } from "../bspline/bezier-curve3d-homogeneous";
import { BSplineCurve3d } from "../bspline/bspline-curve";
import { BSplineCurve3dH } from "../bspline/bspline-curve3d-homogeneous";
import { BSplineSurface3d, BSplineSurface3dH } from "../bspline/bspline-surface";
import { type InterpolationCurve3dProps, InterpolationCurve3d } from "../bspline/interpolation-curve3d";
import { Arc3d } from "../curve/arc3d";
import { CoordinateXYZ } from "../curve/coordinate-xyz";
import { BagOfCurves, CurveCollection } from "../curve/curve-collection";
import { type AnyGeometryQuery } from "../curve/geometry-query";
import { LineSegment3d } from "../curve/line-segment3d";
import { LineString3d } from "../curve/line-string3d";
import { Loop } from "../curve/loop";
import { ParityRegion } from "../curve/parity-region";
import { Path } from "../curve/path";
import { PointString3d } from "../curve/point-string3d";
import { type TransitionSpiral3d } from "../curve/spiral/transition-spiral3d";
import { UnionRegion } from "../curve/union-region";
import { type AngleProps, type AngleSweepProps } from "../geometry";
import { GeometryHandler } from "../geometry3d/geometry-handler";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { type XYProps, type XYZProps } from "../geometry3d/xyz-props";
import { type YawPitchRollProps } from "../geometry3d/yaw-pitch-roll-angles";
import { PolyfaceAuxData } from "../polyface/aux-data";
import { IndexedPolyface } from "../polyface/polyface";
import { TaggedNumericData } from "../polyface/tagged-numeric-data";
import { Box } from "../solid/box";
import { Cone } from "../solid/cone";
import { LinearSweep } from "../solid/linear-sweep";
import { RotationalSweep } from "../solid/rotational-sweep";
import { RuledSweep } from "../solid/ruled-sweep";
import { Sphere } from "../solid/sphere";
import { TorusPipe } from "../solid/torus-pipe";
/**
 * `ImodelJson` namespace has classes for serializing and deserialization json objects
 * @public
 */
export declare namespace IModelJson {
    /**
     * Property rules for json objects that can be deserialized to various Curve and Solid objects
     * @public
     */
    interface GeometryProps extends CurvePrimitiveProps, SolidPrimitiveProps, CurveCollectionProps {
        /** `{indexedMesh:...}` */
        indexedMesh?: IndexedMeshProps;
        /** `{point:...}` */
        point?: XYZProps;
        /** `{bsurf:...}` */
        bsurf?: BSplineSurfaceProps;
    }
    /**
     * Property rules for json objects that can be deserialized to various CurvePrimitives
     * * Only one of these is allowed in each instance.
     * @public
     */
    interface CurvePrimitiveProps {
        /** `{lineSegment:...}` */
        lineSegment?: [XYZProps, XYZProps];
        /** `{lineString:...}` */
        lineString?: XYZProps[];
        /** `{bcurve:...}` */
        bcurve?: BcurveProps;
        /** `{transitionSpiral:...}` */
        transitionSpiral?: TransitionSpiralProps;
        /** `{arc:...}` */
        arc?: ArcByVectorProps | [XYZProps, XYZProps, XYZProps];
        /** `{interpolationCurve:...}~ */
        interpolationCurve?: InterpolationCurve3dProps;
    }
    /**
     * Property rules for json objects that can be deserialized to single point
     * @public
     */
    interface PointProps {
        /** `{point:...}` */
        point?: XYZProps;
    }
    /**
     * Property rules for json objects that can be deserialized to a BsplineSurface
     * See `BCurveProps` for discussion of knot and pole counts.
     * @public
     */
    interface BSplineSurfaceProps {
        /** polynomial order (one more than degree) in the u parameter direction */
        orderU: number;
        /** polynomial order (one more than degree) in the v parameter direction */
        orderV: number;
        /** Square grid of control points (aka poles) in row major order (row is along the u direction) */
        points: [[[number]]];
        /** Array of knots for the u direction bspline */
        uKnots: [number];
        /** Array of knots for the v direction bspline */
        vKnots: [number];
        /** optional flag for periodic data in the u parameter direction */
        closedU?: boolean;
        /** optional flag for periodic data in the v parameter direction */
        closedV?: boolean;
    }
    /**
     * Interface for a collection of curves, eg. as used as a swept contour.
     * @public
     */
    interface CurveCollectionProps extends PlanarRegionProps {
        /** A sequence of curves joined head to tail: */
        path?: [CurvePrimitiveProps];
        /** A collection of curves with no required structure or connections: */
        bagofCurves?: [CurveCollectionProps];
    }
    /**
     * Interface for a collection of curves that bound a planar region
     * @public
     */
    interface PlanarRegionProps {
        /** `{loop:...}`
         * * A sequence of curves which connect head to tail, with the final connecting back to the first
         */
        loop?: [CurvePrimitiveProps];
        /** `{parityRegion:...}`
         * * A collection of loops, with composite inside/outside determined by parity rules.
         * * (The single outer boundary with one or more holes is a parityRegion)
         */
        parityRegion?: [{
            loop: [CurvePrimitiveProps];
        }];
        /** `{unionRegion:...}`
         * * A collection of loops and parityRegions
         */
        unionRegion?: [PlanarRegionProps];
    }
    /**
     * Interface for solid primitives: box, sphere, cylinder, cone, torusPipe, linear sweep, rotational sweep, ruled sweep.
     * @public
     */
    interface SolidPrimitiveProps {
        /** `{cylinder:...}` */
        cylinder?: CylinderProps;
        /** `{box:...}` */
        box?: BoxProps;
        /** `{sphere:............}` */
        sphere?: SphereProps;
        /** `{cone:............}` */
        cone?: ConeProps;
        /** `{torusPipe:............}` */
        torusPipe?: TorusPipeProps;
        /** `{linearSweep:.........}` */
        linearSweep?: LinearSweepProps;
        /** `{rotationalSweep:...}` */
        rotationalSweep?: RotationalSweepProps;
        /** `{ruledSweep:...}` */
        ruledSweep?: RuledSweepProps;
    }
    /**
     * * There are multiple ways to specify an orientation
     * * A "Best" among these is application specific.
     * * An object with AxesProps should only specify one of the variants.
     * * YawPitchRollAngles uses 3 angles.
     * * * Cases where only one of the 3 is nonzero are intuitive
     * * * Cases where more than one is nonzero have difficult interactions and order issues.
     * * xyVectors uses a vector along the x direction and a vector into positive xy plane
     *    along any direction not parallel to x.
     * * * In most cases, users supply a normalized x and the actual normalized y vector.
     * * zxVectors uses a z vector and another vector into the positive zx plane.
     * * * In most cases, users supply a normalized z and the actual normalized x vector.
     * @public
     */
    interface AxesProps {
        /**
         * See YawPitchAngles class for further information about using 3 rotations to specify orientation.
         * @public
         */
        yawPitchRollAngles?: YawPitchRollProps;
        /**
         * Cartesian coordinate directions defined by X direction then Y direction.
         * * The right side contains two vectors in an array.
         * * The first vector gives the x axis direction
         * * * This is normalized to unit length.
         * * The second vector gives the positive y direction in the xy plane.
         * * * This vector is adjusted to be unit length and perpendicular to the x direction.
         */
        xyVectors?: [XYZProps, XYZProps];
        /**
         * Cartesian coordinate directions defined by Z direction then X direction.
         * * The right side contains two vectors in an array.
         * * The first vector gives the z axis direction
         * * * This is normalized to unit length.
         * * The second vector gives the positive x direction in the zx plane.
         * * * This vector is adjusted to be unit length and perpendicular to the z direction.
         */
        zxVectors?: [XYZProps, XYZProps];
    }
    /**
     * Interface for Arc3d value defined by center, vectorX, vectorY and sweepStartEnd.
     * @public
     */
    interface ArcByVectorProps {
        /** Arc center point */
        center: XYZProps;
        /** Vector from center to 0-degree point (commonly called major axis vector) */
        vectorX: XYZProps;
        /** Vector from center to 90-degree point (common called minor axis vector) */
        vectorY: XYZProps;
        /** Start and end angles in parameterization `X=C+cos(theta) * vectorX + sin(theta) * vectorY` */
        sweepStartEnd: AngleSweepProps;
    }
    /**
     * Interface for Cone value defined by centers, radii, and (optional) vectors for circular section planes.
     * * VectorX and vectorY are optional.
     * * If either one is missing, both vectors are constructed perpendicular to the vector from start to end.
     * @public
     */
    interface ConeProps extends AxesProps {
        /** Point on axis at start section. */
        start: XYZProps;
        /** Point on axis at end section  */
        end: XYZProps;
        /** radius at `start` section */
        startRadius?: number;
        /** radius at `end` section */
        endRadius?: number;
        /** single radius to be applied as both start and end */
        radius?: number;
        /** optional x vector in start section.  Omit for circular sections perpendicular to axis. */
        vectorX?: XYZProps;
        /** optional y vector in start section.  Omit for circular sections perpendicular to axis. */
        vectorY?: XYZProps;
        /** flag for circular end caps. */
        capped?: boolean;
    }
    /**
     * Interface for cylinder defined by a radius and axis start and end centers.
     * @public
     */
    interface CylinderProps {
        /** axis point at start */
        start: XYZProps;
        /** axis point at end */
        end: XYZProps;
        /** cylinder radius */
        radius: number;
        /** flag for circular end caps. */
        capped?: boolean;
    }
    /**
     * Interface for a linear sweep of a base curve or region.
     * @public
     */
    interface LinearSweepProps {
        /** The swept curve or region.  Any curve collection */
        contour: CurveCollectionProps;
        /** The sweep vector  */
        vector: XYZProps;
        /** flag for circular end caps. */
        capped?: boolean;
    }
    /**
     * Interface for a rotational sweep of a base curve or region around an axis.
     * @public
     */
    interface RotationalSweepProps {
        /** The swept curve or region.  Any curve collection */
        contour: CurveCollectionProps;
        /** any point on the axis of rotation. */
        center: XYZProps;
        /** The axis of rotation  */
        axis: XYZProps;
        /** sweep angle */
        sweepAngle: AngleProps;
        /** flag for circular end caps. */
        capped?: boolean;
    }
    /**
     * Interface for a surface with ruled sweeps between corresponding curves on successive contours
     * @public
     */
    interface RuledSweepProps {
        /** The swept curve or region.  An array of curve collections.  */
        contour: [CurveCollectionProps];
        /** flag for circular end caps. */
        capped?: boolean;
    }
    /**
     * Interface for spiral
     * * Any 4 (but not 5) of the 5 values `[startBearing, endBearing, startRadius, endRadius, length]`
     *       may be defined.
     * * In radius data, zero radius indicates straight line (infinite radius)
     * * Note that the inherited AxesProps allows multiple ways to specify orientation of the placement..
     * @public
     */
    interface TransitionSpiralProps extends AxesProps {
        /** origin of the coordinate system. */
        origin: XYZProps;
        /** angle at departure from origin. */
        startBearing?: AngleProps;
        /** End bearing. */
        endBearing?: AngleProps;
        /** Radius at start  (0 for straight line) */
        startRadius?: number;
        /** Radius at end  (0 for straight line) */
        endRadius?: number;
        /** length along curve.
         */
        length?: number;
        /** Fractional part of active interval.
         * * There has been name confusion between native and typescript .... accept any variant ..
         * * native (July 2020) emits activeFractionInterval
         */
        activeFractionInterval?: number[];
        /** TransitionSpiral type.
         * * expected names are given in `IntegratedSpiralTypeName` and `DirectSpiralTypeName`
         */
        type?: string;
    }
    /**
     * Interface for bspline curve (aka bcurve)
     * @public
     */
    interface BcurveProps {
        /** control points */
        points: [XYZProps];
        /** knots. */
        knots: [number];
        /** order of polynomial
         * * The order is the number of basis functions that are in effect at any knot value.
         * * The order is the number of points that affect the curve at any knot value,
         *     i.e. the size of the "local support" set
         * * `order=2` is lines (degree 1)
         * * `order=3` is quadratic (degree 2)
         * * `order=4` is cubic (degree 3)
         * * The number of knots follows the convention "poles+order= knots".
         * * In this convention (for example), a clamped cubic with knots `[0,0,0,0, 1,2,3,4,4,4,4]`
         * has:
         * * * 4 (`order`) copies of the start and end knot (0 and 4) and
         * * * 3 interior knots
         * * Hence expect 7 poles.
         */
        order: number;
        /** optional flag for periodic data. */
        closed?: boolean;
    }
    /**
     * Interface for Box (or frustum with all rectangular sections parallel to primary xy section).
     * * Orientation may be given in any `AxesProps` way (`yawPitchRollAngles`, `xyVectors`, `zxVectors`).
     * * If `topX` or `topY` are omitted, each defaults to its `baseX` or `baseY` peer.
     * * If `topOrigin` is given, `height` is unused.
     * * If `topOrigin` is omitted and `height` is given, `topOrigin` is computed along the z axis at distance `height`.
     * * If both `topOrigin` and `height` are omitted, `height` defaults to `baseX`, and `topOrigin` is computed as above.
     * @public
     */
    interface BoxProps extends AxesProps {
        /** Origin of the box coordinate system  (required) */
        origin: XYZProps;
        /** A previous mismatch existed between native and TypeScript code: TypeScript used "origin" where native used "baseOrigin".
         * Now both native and TypeScript will output both and accept either, preferring "origin".
         * "baseOrigin" is undocumented in TypeScript; it's also "deprecated" so that the linter will warn to use the documented property instead.
         * @internal
         * @deprecated in 3.x. use origin
         */
        baseOrigin?: XYZProps;
        /** base x size (required) */
        baseX: number;
        /** base y size.
         * * if omitted, baseX is used.
         */
        baseY?: number;
        /** top origin.
         * * This is NOT required to be on the z axis.
         * * If omitted, it is computed along the z axis at distance `height`.
         */
        topOrigin?: XYZProps;
        /** optional height. This is only used if `topOrigin` is omitted.
         * * If omitted, `baseX` is used.
         */
        height?: number;
        /** x size on top section.
         * * If omitted, `baseX` is used.
         */
        topX?: number;
        /** y size on top section.
         * * If omitted, `baseY` is used.
         */
        topY?: number;
        /** optional capping flag. */
        capped?: boolean;
    }
    /**
     * Interface for Sphere (with optionally different radius to pole versus equator)
     * * Orientation may be given in any `AxesProp`s way (yawPitchRoll, xyVectors, zxVectors)
     * @public
     */
    interface SphereProps extends AxesProps {
        /** Center of the sphere coordinate system */
        center: XYZProps;
        /** primary radius */
        radius?: number;
        /** optional x radius */
        radiusX?: number;
        /** optional y radius */
        radiusY?: number;
        /** optional radius at poles.  */
        radiusZ?: number;
        /** optional sweep range for latitude.  Default latitude limits are [-90,90 ] degrees. */
        latitudeStartEnd?: AngleSweepProps;
        /** optional capping flag. If missing, implied false */
        capped?: boolean;
    }
    /**
     * Interface for TorusPipe data
     * * Orientation may be given in any `AxesProp`s way (yawPitchRoll, xyVectors, zxVectors)
     * * Both radii are required.
     * * axes are required
     * * Axis definition is
     * * xy plane contains the major circle
     * * x axis points from donut hole center to flow center at start of pipe.
     * * z axis points through the hole.
     * @public
     */
    interface TorusPipeProps extends AxesProps {
        /** Center of the full torus coordinate system. (donut hole center) */
        center: XYZProps;
        /** primary radius  (elbow radius) */
        majorRadius: number;
        /** pipe radius */
        minorRadius: number;
        /** sweep angle.
         * * if omitted, full 360 degree sweep.
         */
        sweepAngle?: AngleProps;
        /** optional capping flag. If missing, implied false */
        capped?: boolean;
    }
    /**
     * Interface for a ruled sweep.
     * @public
     */
    interface RuledSweepProps {
        /** Array of contours */
        contour: [CurveCollectionProps];
        /** optional capping flag. */
        capped?: boolean;
    }
    /**
     * Interface for extra data attached to an indexed mesh.
     * See `TaggedNumericData` for further information (e.g. value `tagA` and `tagB` values)
     * @public
     */
    interface TaggedNumericDataProps {
        /** integer tag identifying the meaning of this tag.  */
        tagA: number;
        /** Second integer tag.  */
        tagB: number;
        /** application specific integer data */
        intData?: number[];
        /** application specific doubles */
        doubleData?: number[];
    }
    /**
     * Interface for an indexed mesh.
     * * IMPORTANT: All indices are one-based.
     * * i.e. vertex index given as 11 appears at index 10 in the data array.
     * * This is to allow a negated index to mean "don't draw the following edge"
     * * Although negative indices are not allowed for normalIndex, colorIndex, or paramIndex, the "one based" style
     *     is used for them so that all indices within the indexedMesh json object are handled similarly.
     * * In all index arrays, a ZERO indicates "end of facet".
     * @public
     */
    interface IndexedMeshProps {
        /** vertex coordinates */
        point: [XYZProps];
        /** surface normals */
        normal?: [XYZProps];
        /** texture space (uv parameter) coordinates */
        param?: [XYProps];
        /** 32 bit color values */
        color?: [number];
        /** SIGNED ONE BASED ZERO TERMINATED array of point indices. */
        pointIndex: [number];
        /** ONE BASED ZERO TERMINATED array of param indices.  ZERO is terminator for single facet. */
        paramIndex?: [number];
        /** ONE BASED ZERO TERMINATED array of normal indices. ZERO is terminator for single facet. */
        normalIndex?: [number];
        /** ONE BASED ZERO TERMINATED array of color indices. ZERO is terminator for single facet. */
        colorIndex?: [number];
        /** optional array of tagged geometry (such as to request subdivision surface) */
        taggedNumericData?: TaggedNumericDataProps;
    }
    /** parser services for "iModelJson" schema
     * * 1: create a reader with `new ImodelJsonReader`
     * * 2: parse json fragment to strongly typed geometry: `const g = reader.parse (fragment)`
     * @public
     */
    class Reader {
        constructor();
        private static parseVector3dProperty;
        private static parsePoint3dProperty;
        private static parseSegment1dProperty;
        private static parseNumberProperty;
        /**
         * @internal
         */
        static parseTaggedNumericProps(json: any): TaggedNumericData | undefined;
        private static parseNumberArrayProperty;
        private static parseAngleProperty;
        /**
         * @param defaultFunction function to call if needed to produce a default value
         */
        private static parseAngleSweepProps;
        private static parseBooleanProperty;
        private static loadContourArray;
        private static parseYawPitchRollAnglesToMatrix3d;
        private static parseStringProperty;
        private static parseAxesFromVectors;
        /**
         * Look for orientation data and convert to Matrix3d.
         * * Search order is:
         * * * yawPitchRollAngles
         * * * xyVectors
         * * * zxVectors
         * @param json [in] json source data
         * @param createDefaultIdentity [in] If true and no orientation is present, return an identity matrix.  If false and no orientation is present, return undefined.
         */
        private static parseOrientation;
        private static parseArcByVectorProps;
        private static parseArcBy3Points;
        private static parseArcObject;
        /** Parse point content (right side) `[1,2,3]` to a CoordinateXYZ object. */
        static parseCoordinate(data?: any): CoordinateXYZ | undefined;
        /** Parse TransitionSpiral content (right side) to TransitionSpiral3d. */
        static parseTransitionSpiral(data?: TransitionSpiralProps): TransitionSpiral3d | undefined;
        /**
         * Special closed case if the input was forced to bezier . . . (e.g. arc)
         *       (b-1) 0 0 0  a . . . b 111 (a+1)
         *       with {order} clamp-like values .. no pole duplication needed, but throw out 2 knots at each end . ..
         * @param numPoles number of poles
         * @param knots knot vector
         * @param order curve order
         * @param newKnots array to receive new knots.
         * @returns true if this is a closed-but-clamped case and corrected knots are filled in.
         */
        private static getCorrectedKnotsForClosedClamped;
        /** Parse `bcurve` content (right side)to  BSplineCurve3d or BSplineCurve3dH object. */
        static parseBcurve(data?: any): BSplineCurve3d | BSplineCurve3dH | undefined;
        /** Parse `bcurve` content (right side)to  BSplineCurve3d or BSplineCurve3dH object. */
        static parseInterpolationCurve(data?: any): InterpolationCurve3d | undefined;
        /** Parse `bcurve` content (right side)to an Akima curve object. */
        static parseAkimaCurve3d(data?: any): AkimaCurve3d | undefined;
        /** Parse array of json objects to array of instances. */
        static parseArray(data?: any): any[] | undefined;
        private static addZeroBasedIndicesFromSignedOneBased;
        /** parse polyface aux data content to PolyfaceAuxData instance */
        static parsePolyfaceAuxData(data?: any, numPerFace?: number): PolyfaceAuxData | undefined;
        /** parse indexed mesh content to an IndexedPolyface instance */
        static parseIndexedMesh(data?: any): IndexedPolyface | undefined;
        /** parse contents of a curve collection to a CurveCollection instance */
        static parseCurveCollectionMembers(result: CurveCollection, data?: any): CurveCollection | undefined;
        /** Parse content of `bsurf` to BSplineSurface3d or BSplineSurface3dH */
        static parseBsurf(data?: any): BSplineSurface3d | BSplineSurface3dH | undefined;
        /** Parse `cone` contents to `Cone` instance  */
        static parseConeProps(json?: ConeProps): Cone | undefined;
        /** Parse `cylinder` content to `Cone` instance */
        static parseCylinderProps(json?: CylinderProps): Cone | undefined;
        /** Parse line segment (array of 2 points) properties to `LineSegment3d` instance */
        private static parseLineSegmentProps;
        /** Parse linear sweep content to `LinearSweep` instance. */
        static parseLinearSweep(json?: any): LinearSweep | undefined;
        /** Parse rotational sweep contents to `RotationalSweep` instance */
        static parseRotationalSweep(json?: RotationalSweepProps): RotationalSweep | undefined;
        /** Parse box contents to `Box` instance */
        static parseBox(json?: BoxProps): Box | undefined;
        /** Parse `SphereProps` to `Sphere` instance. */
        static parseSphere(json?: SphereProps): Sphere | undefined;
        /** Parse RuledSweepProps to RuledSweep instance. */
        static parseRuledSweep(json?: RuledSweepProps): RuledSweep | undefined;
        /** Parse TorusPipe props to TorusPipe instance. */
        static parseTorusPipe(json?: TorusPipeProps): TorusPipe | undefined;
        /** Parse an array object to array of Point3d instances. */
        static parsePointArray(json?: any[]): Point3d[];
        /** Deserialize `json` to `GeometryQuery` instances. */
        static parse(json?: any): AnyGeometryQuery | any[] | undefined;
    }
    /**
     * Class to deserialize json objects into GeometryQuery objects
     * @public
     */
    class Writer extends GeometryHandler {
        handleTaggedNumericData(data: TaggedNumericData): TaggedNumericDataProps;
        /** Convert strongly typed instance to tagged json */
        handleLineSegment3d(data: LineSegment3d): any;
        /** Convert strongly typed instance to tagged json */
        handleCoordinateXYZ(data: CoordinateXYZ): any;
        /** Convert strongly typed instance to tagged json */
        handleArc3d(data: Arc3d): any;
        /**
         * Insert orientation description to a data object.
         * @param matrix matrix with orientation
         * @param omitIfIdentity omit the axis data if the matrix is an identity.
         * @param data AxesProps object to be annotated.
         */
        private static insertOrientationFromMatrix;
        private static isIdentityXY;
        /**
         * Insert orientation description to a data object.
         * @param matrix matrix with orientation
         * @param omitIfIdentity omit the axis data if the matrix is an identity.
         * @param data AxesProps object to be annotated.
         */
        private static insertOrientationFromXYVectors;
        /**
         * Insert orientation description to a data object, with orientation defined by u and v direction
         * vectors.
         * @param vectorX u direction
         * @param vectorV v direction
         * @param omitIfIdentity omit the axis data if the vectorU and vectorV are global x and y vectors.
         * @param data AxesProps object to be annotated.
         */
        private static insertXYOrientation;
        /** Parse properties of a TransitionSpiral. */
        handleTransitionSpiral(data: TransitionSpiral3d): any;
        /** Convert strongly typed instance to tagged json */
        handleCone(data: Cone): any;
        /** Convert strongly typed instance to tagged json */
        handleSphere(data: Sphere): any;
        /** Convert strongly typed instance to tagged json */
        handleTorusPipe(data: TorusPipe): any;
        /** Convert strongly typed instance to tagged json */
        handleLineString3d(data: LineString3d): any;
        /** Convert strongly typed instance to tagged json */
        handlePointString3d(data: PointString3d): any;
        /** Convert strongly typed instance to tagged json */
        handlePath(data: Path): any;
        /** Convert strongly typed instance to tagged json */
        handleLoop(data: Loop): any;
        /** Convert strongly typed instance to tagged json */
        handleParityRegion(data: ParityRegion): any;
        /** Convert strongly typed instance to tagged json */
        handleUnionRegion(data: UnionRegion): any;
        /** Convert strongly typed instance to tagged json */
        handleBagOfCurves(data: BagOfCurves): any;
        private collectChildren;
        /** Convert strongly typed instance to tagged json */
        handleLinearSweep(data: LinearSweep): any;
        /** Convert strongly typed instance to tagged json */
        handleRuledSweep(data: RuledSweep): any;
        /** Convert strongly typed instance to tagged json */
        handleRotationalSweep(data: RotationalSweep): any;
        /** Convert strongly typed instance to tagged json */
        handleBox(box: Box): any;
        private handlePolyfaceAuxData;
        /** Convert strongly typed instance to tagged json */
        handleIndexedPolyface(pf: IndexedPolyface): any;
        /** Convert strongly typed instance to tagged json */
        handleBSplineCurve3d(curve: BSplineCurve3d): any;
        /** Convert strongly typed instance to tagged json */
        handleInterpolationCurve3d(curve: InterpolationCurve3d): any;
        /** Convert strongly typed instance to tagged json */
        handleAkimaCurve3d(curve: AkimaCurve3d): any;
        /** Convert strongly typed instance to tagged json */
        handleBezierCurve3d(curve: BezierCurve3d): any;
        /** Convert strongly typed instance to tagged json */
        handleBSplineCurve3dH(curve: BSplineCurve3dH): any;
        /** Convert strongly typed instance to tagged json */
        handleBSplineSurface3d(surface: BSplineSurface3d): any;
        /** Convert strongly typed instance to tagged json */
        handleBezierCurve3dH(curve: BezierCurve3dH): any;
        /** Convert strongly typed instance to tagged json */
        handleBSplineSurface3dH(surface: BSplineSurface3dH): any;
        /** Convert an array of strongly typed instances to an array of tagged json */
        emitArray(data: object[]): any;
        /** Convert GeometryQuery data (array or single instance) to instance to tagged json */
        emit(data: any): any;
        /** One-step static method to create a writer and emit a json object */
        static toIModelJson(data: any): any;
    }
}
