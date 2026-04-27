import { type BSplineCurve3dBase, BSplineCurve3d } from "../bspline/bspline-curve";
import { BSplineCurve3dH } from "../bspline/bspline-curve3d-homogeneous";
import { BSplineSurface3d, BSplineSurface3dH } from "../bspline/bspline-surface";
import { ClipPlane } from "../clipping/clip-plane";
import { UnionOfConvexClipPlaneSets } from "../clipping/union-of-convex-clip-plane-sets";
import { Arc3d } from "../curve/arc3d";
import { CurveChainWithDistanceIndex } from "../curve/curve-chain-with-distance-index";
import { BagOfCurves } from "../curve/curve-collection";
import { type CurvePrimitive } from "../curve/curve-primitive";
import { type GeometryQuery } from "../curve/geometry-query";
import { LineSegment3d } from "../curve/line-segment3d";
import { LineString3d } from "../curve/line-string3d";
import { Loop } from "../curve/loop";
import { ParityRegion } from "../curve/parity-region";
import { Path } from "../curve/path";
import { PointString3d } from "../curve/point-string3d";
import { type TransitionSpiral3d } from "../curve/spiral/transition-spiral3d";
import { type StrokeOptions } from "../curve/stroke-options";
import { UnionRegion } from "../curve/union-region";
import { Angle } from "../geometry3d/angle";
import { AngleSweep } from "../geometry3d/angle-sweep";
import { GrowableFloat64Array } from "../geometry3d/growable-float64-array";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { Matrix3d } from "../geometry3d/matrix3d";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { Point2d, Vector2d } from "../geometry3d/point2d-vector2d";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { Range1d, Range2d, Range3d } from "../geometry3d/range";
import { Ray3d } from "../geometry3d/ray3d";
import { Segment1d } from "../geometry3d/segment1d";
import { Transform } from "../geometry3d/transform";
import { type XYAndZ } from "../geometry3d/xyz-props";
import { Map4d } from "../geometry4d/map4d";
import { Matrix4d } from "../geometry4d/matrix4d";
import { Point4d } from "../geometry4d/point4d";
import { type AuxChannelDataType } from "../polyface/aux-data";
import { IndexedPolyface } from "../polyface/polyface";
import { type PolyfaceData } from "../polyface/polyface-data";
import { Box } from "../solid/box";
import { Cone } from "../solid/cone";
import { LinearSweep } from "../solid/linear-sweep";
import { RotationalSweep } from "../solid/rotational-sweep";
import { RuledSweep } from "../solid/ruled-sweep";
import { type SolidPrimitive } from "../solid/solid-primitive";
import { Sphere } from "../solid/sphere";
import { TorusPipe } from "../solid/torus-pipe";
/**
 * Function to be called to obtain function value at (i,n), for
 * * n fixed over many calls
 *   * n may be assumed 1 or greater (so fraction = i/n is safe)
 * * i varies from 0 to n
 * @alpha
 */
export type SteppedIndexFunction = (i: number, n: number) => number;
/**
 * Static methods to create functions of type SteppedIndexFunction
 * * Convention: constant value is optional last argument, with default value 0
 * @alpha
 */
export declare class SteppedIndexFunctionFactory {
    /** Returns a callable function that returns a constant value. */
    static createConstant(value?: number): SteppedIndexFunction;
    /**
     * Return a function that steps linearly
     * *  f(i,n) = y0 + (i/n) * a
     */
    static createLinear(a: number, f0?: number): SteppedIndexFunction;
    /**
     * Return a function that steps with cosine of angles in sweep
     * *  f(i,n) = y0 + amplitude * cos(i/n)
     */
    static createCosine(amplitude: number, sweep?: AngleSweep, f0?: number): SteppedIndexFunction;
    /**
     * Return a function that steps with cosine of angles in sweep.
     * *  f(i,n) = y0 + amplitude * sin(i/n)
     */
    static createSine(amplitude: number, sweep?: AngleSweep, f0?: number): SteppedIndexFunction;
}
/**
 * `Sample` has static methods to create a variety of geometry samples useful in testing.
 * @alpha
 */
export declare class Sample {
    /** Array with assorted Point2d samples */
    static readonly point2d: Point2d[];
    /** Array with assorted Point3d samples */
    static readonly point3d: Point3d[];
    /**
     * Return an array of Point3d, with x,y,z all stepping through a range of values.
     * x varies fastest, then y then z
     */
    static createPoint3dLattice(low: number, step: number, high: number): Point3d[];
    /**
     * Return an array of Point2d, with x,y all stepping through a range of values.
     * x varies fastest, then y
     */
    static createPoint2dLattice(low: number, step: number, high: number): Point2d[];
    /** Array with assorted Point4d samples */
    static readonly point4d: Point4d[];
    /** Array with assorted nonzero vector samples. */
    static createNonZeroVectors(): Vector3d[];
    /** Array with assorted nonzero Vector2d samples */
    static readonly vector2d: Vector2d[];
    /** Return an array with assorted Range3d samples */
    static createRange3ds(): Range3d[];
    /** Create 5 points of a (axis aligned) rectangle with corners (x0,y0) and (x0+ax, y0 + ay) */
    static createRectangleXY(x0: number, y0: number, ax: number, ay: number, z?: number): Point3d[];
    /** Create 5 points of a (axis aligned) rectangle with corners (cx-ax,cy-ay) and (cx+ax,cy+ay) */
    static createCenteredRectangleXY(cx: number, cy: number, ax: number, ay: number, z?: number): Point3d[];
    /**
     * Access the last point in the array. push another shifted by dx,dy,dz.
     * * No push if all are 0.
     * * If array is empty, push a leading 000
     */
    static pushMove(data: Point3d[], dx: number, dy: number, dz?: number): void;
    /** Return an array with numPoints on the unit circle (counting closure) */
    static createUnitCircle(numPoints: number): Point3d[];
    /**
     * Create points for an L shaped polygon
     * * lower left at x0,y0.
     * * ax,ay are larger side lengths (lower left to corners along x and y directions)
     * * bx,by are smaller side lengths (inner corner to points along x and y directions)
     */
    static createLShapedPolygon(x0: number, y0: number, ax: number, ay: number, bx: number, by: number, z?: number): Point3d[];
    /** Create assorted clip planes. */
    static createClipPlanes(): ClipPlane[];
    /**
     * * A first-quadrant unit square
     * * Two squares -- first and fourth quadrant unit squares
     * * Three squares -- first, second and fourth quadrant unit squares
     */
    static createClipPlaneSets(): UnionOfConvexClipPlaneSets[];
    /**
     * Create (unweighted) bspline curves.
     * order varies from 2 to 5
     */
    static createBsplineCurves(includeMultipleKnots?: boolean): BSplineCurve3d[];
    /**
     * Create weighted bspline curves.
     * order varies from 2 to 5
     */
    static createBspline3dHCurves(): BSplineCurve3dH[];
    /** Create various orders of non-rational B-spline curves with helical poles */
    static createBsplineCurveHelices(radius: number, height: number, numTurns: number, numSamplesPerTurn: number): BSplineCurve3d[];
    /** Create weighted bsplines for circular arcs. */
    static createBspline3dHArcs(): BSplineCurve3dH[];
    /**
     * Return array   [x,y,z,w] bspline control points for an arc in 90 degree bspline spans.
     * @param points array of [x,y,z,w]
     * @param center center of arc
     * @param axes matrix with 0 and 90 degree axes
     * @param radius0 radius multiplier for x direction.
     * @param radius90 radius multiplier for y direction.
     * @param applyWeightsToXYZ
     */
    static createBsplineArc90SectionToXYZWArrays(center: Point3d, axes: Matrix3d, radius0: number, radius90: number, applyWeightsToXYZ: boolean): number[][];
    /**
     * Create both unweighted and weighted bspline curves.
     * (This is the combined results from createBsplineCurves and createBspline3dHCurves)
     */
    static createMixedBsplineCurves(): BSplineCurve3dBase[];
    /** Create a plane from origin and normal coordinates -- default to 001 normal if needed. */
    static createPlane(x: number, y: number, z: number, u: number, v: number, w: number): Plane3dByOriginAndUnitNormal;
    /** Create ray from (x,y,z) and direction components.   (Normalize the direction) */
    static createRay(x: number, y: number, z: number, u: number, v: number, w: number): Ray3d;
    /** Assorted Plane3dBYOriginAndUnitNormal */
    static readonly plane3dByOriginAndUnitNormal: Plane3dByOriginAndUnitNormal[];
    /** Assorted Ray3d, not all unit direction vectors. */
    static readonly ray3d: Ray3d[];
    /** Assorted angles.  All principal directions, some others included. */
    static readonly angle: Angle[];
    /** Assorted angle sweeps */
    static readonly angleSweep: AngleSweep[];
    /** Assorted line segments */
    static readonly lineSegment3d: LineSegment3d[];
    /** Assorted lines strings */
    static createLineStrings(): LineString3d[];
    /** Assorted Range1d: single point, null, simple forward, simple reverse */
    static readonly range1d: Range1d[];
    /** Assorted range2d: single point, null, 2 point with various creation orders. */
    static readonly range2d: Range2d[];
    /** Assorted range2d: single point, null, 2 point with various creation orders. */
    static readonly range3d: Range3d[];
    /**
     * Assorted Matrix3d:
     * * identity
     * * rotation around x
     * * rotation around general vector
     * * uniform scale
     * * nonuniform scale (including negative scales!)
     */
    static createMatrix3dArray(): Matrix3d[];
    /** Assorted invertible transforms. */
    static createInvertibleTransforms(): Transform[];
    /**
     * Return an array of Matrix3d with various skew and scale.  This includes at least:
     * * identity
     * * 3 distinct diagonals.
     * * The distinct diagonal base with smaller value added to other 6 spots in succession.
     * * the distinct diagonals with all others also smaller non-zeros.
     */
    static createScaleSkewMatrix3d(): Matrix3d[];
    /**
     * Return an array of singular Matrix3d. This includes at least:
     * * all zeros
     * * one non-zero column
     * * two independent columns, third is zero
     * * two independent columns, third is sum of those
     * * two independent columns, third is copy of one
     */
    static createSingularMatrix3d(): Matrix3d[];
    /**
     * Return an array of rigid transforms. This includes (at least)
     *   * Identity
     *   * translation with identity matrix
     *   * rotation around origin and arbitrary vector
     *   * rotation around space point and arbitrary vector
     * * use given refDistance is crude distance of translation and distance to fixed point.
     */
    static createRigidTransforms(distanceScale?: number): Transform[];
    /** Return a single rigid transform with all terms nonzero. */
    static createMessyRigidTransform(fixedPoint?: Point3d): Transform;
    /**
     * Return various rigid matrices:
     * * identity
     * * small rotations around x, y, z
     * * small rotation around (1,2,3)
     */
    static createRigidAxes(): Matrix3d[];
    /**
     * Return various Matrix4d
     * * Simple promotion of each Sample.createInvertibleTransforms ()
     * * optional nasty [1,2,3,4...15] row order
     * @param includeIrregular if true, include [1,2,..15] row major
     */ static createMatrix4ds(includeIrregular?: boolean): Matrix4d[];
    /** Create full Map4d for each `Sample.createInvertibleTransforms()` */
    static createMap4ds(): Map4d[];
    /** Assorted simple `Path` objects. */
    static createSimplePaths(withGaps?: boolean): Path[];
    /**
     * Assorted `Path` with lines and arcs.
     * Specifically useful for offset tests.
     */
    static createLineArcPaths(): Path[];
    /** Assorted `PointString3d` objects. */
    static createSimplePointStrings(): PointString3d[];
    /** Assorted `Loop` objects */
    static createSimpleLoops(): Loop[];
    /**
     * Create a square wave along x direction
     * @param dx0 distance along x axis at y=0
     * @param dy vertical rise
     * @param dx1 distance along x axis at y=dy
     * @param numPhase number of phases of the jump.
     * @param dyReturn y value for return to origin.  If 0, the wave ends at y=0 after then final "down" with one extra horizontal dx0
     * If nonzero, rise to that y value, return to x=0, and return down to origin.
     */
    static createSquareWave(origin: Point3d, dx0: number, dy: number, dx1: number, numPhase: number, dyReturn: number): Point3d[];
    /**
     * Create multiple interpolated points between two points
     * @param point0 start point (at fraction0)
     * @param point1 end point (at fraction1)
     * @param numPoints total number of points.  This is force to at least 2.
     * @param result optional existing array to receive points.
     * @param index0 optional index of first point.  Default is 0.
     * @param index1 optional index of final point.  Default is numPoints
     */
    static createInterpolatedPoints(point0: Point3d, point1: Point3d, numPoints: number, result?: Point3d[], index0?: number, index1?: number): Point3d[];
    /**
     * Append numPhase teeth.  Each tooth starts with dxLow dwell at initial y, then sloped rise, then dwell at top, then sloped fall
     * * If no points are present, start with 000.  (this happens in pushMove) Otherwise start from final point.
     * * return points array reference.
     * @param points point array to receive points
     * @param dxLow starting step along x direction
     * @param riseX width of rising and falling parts
     * @param riseY height of rise
     * @param dxHigh width at top
     * @param numPhase number of phases.
     */
    static appendSawTooth(points: Point3d[], dxLow: number, riseX: number, riseY: number, dxHigh: number, numPhase: number): Point3d[];
    /** Append sawtooth with x distances successively scaled by xFactor */
    static appendVariableSawTooth(points: Point3d[], dxLow: number, riseX: number, riseY: number, dxHigh: number, numPhase: number, xFactor: number): Point3d[];
    /**
     * Create a pair of sawtooth patterns, one (nominally) outbound and up, the other inbound and down.
     * * return phase count adjusted to end at start x
     * * enter return dx values as lengths -- sign will be negated in construction.
     * @param origin start of entire path.
     * @param dxLow low outbound dwell
     * @param riseX x part of outbound rise and fall
     * @param riseY y part of outbound rise and fall
     * @param dxHigh high outbound dwell
     * @param numPhaseOutbound number of phases outbound.  Final phase followed by dxLow dwell.
     * @param dyFinal rise after final dwell.
     * @param dxLowReturn dwell at return high
     * @param riseXReturn rise x part of return
     * @param riseYReturn rise y part of return
     * @param dxHighReturn  dwell at return high
     */
    static createBidirectionalSawtooth(origin: Point3d, dxLow: number, riseX: number, riseY: number, dxHigh: number, numPhaseOutbound: number, dyFinal: number, dxLowReturn: number, riseXReturn: number, riseYReturn: number, dxHighReturn: number): Point3d[];
    /**
     * Append to a linestring, taking steps along given vector directions
     * If the linestring is empty, a 000 point is added.
     * @param linestring LineString3d to receive points.
     * @param numPhase number of phases of the sawtooth
     * @param vectors any number of vector steps.
     */
    static appendPhases(linestring: LineString3d, numPhase: number, ...vectors: Vector3d[]): void;
    /**
     * Assorted regions with arc boundaries
     * * full circle
     * * with varying sweep:
     *    * partial arc with single chord closure
     *    * partial arc with 2-edge closure via center
     */
    static createArcRegions(): Loop[];
    /**
     * Assorted loops in xy plane:
     * * unit square
     * * rectangle
     * * L shape
     */
    static createSimpleXYPointLoops(): Point3d[][];
    /** Assorted `ParityRegion` objects */
    static createSimpleParityRegions(includeBCurves?: boolean): ParityRegion[];
    /** Union region. */
    static createSimpleUnions(): UnionRegion[];
    /** Assorted unstructured curve sets. */
    static createBagOfCurves(): BagOfCurves[];
    /**
     * Assorted smooth curve primitives:
     * * line segments
     * * arcs
     */
    static createSmoothCurvePrimitives(size?: number): CurvePrimitive[];
    /** Assorted small polyface grids, possibly expanded by gridMultiplier */
    static createSimpleIndexedPolyfaces(gridMultiplier: number): IndexedPolyface[];
    /**
     * Build a mesh that is a (possibly skewed) grid in a plane.
     * @param origin "lower left" coordinate
     * @param vectorX step in "X" direction
     * @param vectorY step in "Y" direction
     * @param numXVertices number of vertices in X direction
     * @param numYVertices number of vertices in y direction
     * @param createParams true to create parameters, with parameter value `(i,j)` for point at (0 based) vertex in x,y directions
     * @param createNormals true to create a (single) normal indexed from all facets
     * @param createColors true to create a single color on each quad.  (shared between its triangles)
     * @note edgeVisible is false only on the diagonals
     */
    static createTriangularUnitGridPolyface(origin: Point3d, vectorX: Vector3d, vectorY: Vector3d, numXVertices: number, numYVertices: number, createParams?: boolean, createNormals?: boolean, createColors?: boolean, triangulate?: boolean): IndexedPolyface;
    /** Create an xy grid of points in single array with x varying fastest. */
    static createXYGrid(numU: number, numV: number, dX?: number, dY?: number): Point3d[];
    /** Create simple bspline surface on xy plane grid. */
    static createXYGridBsplineSurface(numU: number, numV: number, orderU: number, orderV: number): BSplineSurface3d | undefined;
    /**
     * Create a bspline surface whose poles area on circular paths.
     * * (BUT not weighted bspline, therefore although u and v isolines "go around" they are not true circles.)
     * @param radiusU major radius
     * @param radiusV minor radius
     * @param numU number of facets around major hoop
     * @param numV number of facets around minor hoop
     * @param orderU major hoop order
     * @param orderV minor hoop order
     */
    static createPseudoTorusBsplineSurface(radiusU: number, radiusV: number, numU: number, numV: number, orderU: number, orderV: number): BSplineSurface3d | undefined;
    /**
     * Create a Bspline surface for a cone.
     * @param centerA center at section A
     * @param centerB center at section B
     * @param radiusA radius at point A
     * @param radiusB radius at point B
     */
    static createConeBsplineSurface(centerA: Point3d, centerB: Point3d, radiusA: number, radiusB: number, numSection: number): BSplineSurface3dH | undefined;
    /** Create bspline surface on xy grid with weights. */
    static createWeightedXYGridBsplineSurface(numU: number, numV: number, orderU: number, orderV: number, weight00?: number, weight10?: number, weight01?: number, weight11?: number): BSplineSurface3dH | undefined;
    /** Assorted linear sweeps */
    static createSimpleLinearSweeps(): LinearSweep[];
    /**
     * Create an array of primitives with an arc centered at origin and a line segment closing back to the arc start.
     * This can be bundled into Path or Loop by caller.
     */
    static createCappedArcPrimitives(radius: number, startDegrees: number, endDegrees: number): CurvePrimitive[];
    /** Return a Path structure for a segment of arc, with closure segment */
    static createCappedArcPath(radius: number, startDegrees: number, endDegrees: number): Path;
    /** Return a Loop structure for a segment of arc, with closure segment */
    static createCappedArcLoop(radius: number, startDegrees: number, endDegrees: number): Loop;
    /** Create assorted rotational sweeps. */
    static createSimpleRotationalSweeps(): RotationalSweep[];
    /** Create assorted spheres */
    static createSpheres(includeEllipsoidal?: boolean): Sphere[];
    /** Create true (non-spherical) ellipsoids. */
    static createEllipsoids(): Sphere[];
    /** Create assorted cones. */
    static createCones(): Cone[];
    /** Return a TorusPipe with swept circle in xz plane rotating through an angle range around the Z axis. */
    static createPartialTorusAroundZ(majorRadius: number, majorSweep: Angle, minorRadius: number, minorStart: Angle, minorEnd: Angle): RotationalSweep;
    /** Create assorted Torus Pipes */
    static createTorusPipes(): TorusPipe[];
    /** Create assorted boxes. */
    static createBoxes(capped?: boolean): Box[];
    /** Create an array of points for a rectangle with corners (x0,y0,z) and (x1,y1,z) */
    static createRectangle(x0: number, y0: number, x1: number, y1: number, z?: number, closed?: boolean): Point3d[];
    /** Create an array of points for a rectangle with corners of a Range2d. */
    static createRectangleInRange2d(range: Range2d, z?: number, closed?: boolean): Point3d[];
    /** Create assorted ruled sweeps */
    static createRuledSweeps(includeParityRegion?: boolean, includeBagOfCurves?: boolean): RuledSweep[];
    /**
     * Uniformly spaced numbers
     * @param a0 first entry
     * @param delta step between entries
     * @param n number of entries
     */
    static createGrowableArrayCountedSteps(a0: number, delta: number, n: number): GrowableFloat64Array;
    /**
     * Create points on a unit circle
     * @param radius first entry
     * @param numEdge number of edges of chorded circle.  Angle step is 2PI/numEdge (whether or not closed)
     * @param closed true to include final point (i.e. return numEdge+1 points)
     */
    static createGrowableArrayCirclePoints(radius: number, numEdge: number, closed?: boolean, centerX?: number, centerY?: number, data?: GrowableXYZArray): GrowableXYZArray;
    private static pushIfDistinct;
    private static appendToFractalEval;
    /**
     * For each edge of points, construct a transform (with scale, rotate, and translate) that spreads the patter out along the edge.
     * Repeat recursively for each edge
     * @returns Returns an array of recursively generated fractal points
     * @param poles level-0 (coarse) polygon whose edges are to be replaced by recursive fractals
     * @param pattern pattern to map to each edge of poles (and to edges of the recursion)
     * @param numRecursion  number of recursions
     * @param perpendicularFactor factor to apply to perpendicular sizing.
     */
    static createRecursiveFractalPolygon(poles: Point3d[], pattern: Point2d[], numRecursion: number, perpendicularFactor: number): Point3d[];
    /**
     * Primary shape is a "triangle" with lower edge pushed in so it becomes a mild nonconvex quad.
     * Fractal effects are gentle.
     */
    static nonConvexQuadSimpleFractal(numRecursion: number, perpendicularFactor: number): Point3d[];
    /** Create a diamond with convex fractal */
    static createFractalDiamondConvexPattern(numRecursion: number, perpendicularFactor: number): Point3d[];
    /** Create l on a square, with pattern shift to both directions. */
    static createFractalSquareReversingPattern(numRecursion: number, perpendicularFactor: number): Point3d[];
    /** Create a fractal on a non-convex base and reversing pattern */
    static createFractalHatReversingPattern(numRecursion: number, perpendicularFactor: number): Point3d[];
    /** Create a fractal on a primary L shape with a reversing pattern */
    static createFractalLReversingPattern(numRecursion: number, perpendicularFactor: number): Point3d[];
    /** Fractal with fewer concavity changes.... */
    static createFractalLMildConcavePatter(numRecursion: number, perpendicularFactor: number): Point3d[];
    /** Append interpolated points from the array tail to the target. */
    static appendSplits(points: Point3d[], target: Point3d, numSplit: number, includeTarget: boolean): void;
    /**
     * Triangle with 3 given vertices, and indicated extra points on each each.
     * @param numSplitAB number of extra points on edge AB
     * @param numSplitBC number of extra points on edge BC
     * @param numSplitCA number of extra points on edge CA
     * @param wrap true to replicate vertexA at end
     * @param xyzA vertexA
     * @param xyzB vertexB
     * @param xyzC vertexC
     */
    static createTriangleWithSplitEdges(numSplitAB: number, numSplitBC: number, numSplitCA: number, wrap?: boolean, xyzA?: Point3d, xyzB?: Point3d, xyzC?: Point3d): Point3d[];
    /** Create a box (xyz) from half-lengths and center. */
    static createCenteredBoxEdges(ax?: number, ay?: number, az?: number, cx?: number, cy?: number, cz?: number, geometry?: GeometryQuery[]): GeometryQuery[];
    /**
     * Assorted transition spirals
     * * (All combinations of bearing radius bearing radius length subsets.)
     */
    static createSimpleTransitionSpirals(): TransitionSpiral3d[];
    /**
     * Create a Bezier curve with significant twist effects
     * * r and theta are circle in xy plane at steps in thetaStepper
     * * z varies with sin(phi) at steps in phiStepper.
     */
    static createTwistingBezier(order: number, x0: number, y0: number, r: number, thetaStepper: AngleSweep, phiStepper: AngleSweep, weightInterval?: Segment1d): CurvePrimitive | undefined;
    /**
     * Create various curve chains with distance indexing.
     * * LineSegment
     * * CircularArc
     * * LineString
     * * order 3 bspline
     * * order 4 bspline
     * * alternating lines and arcs
     * * arc spline with corners
     * * arc spline with smooth joins
     * * interpolation curve 2 pts
     * * interpolation curve 3 pts
     * * interpolation curve >3 pts
     * * integrated spiral (bloss)
     * * direct spiral (half-cosine)
     */
    static createCurveChainWithDistanceIndex(): CurveChainWithDistanceIndex[];
    /**
     * Create a square wave path.
     * @param numTooth number of teeth.
     * @param dxA x size of "A" part
     * @param dxB x size of "B" part
     * @param yA y for A part
     * @param yB y for B part
     * @param structure 1 for line segments, 2 for one linestring per tooth, 0 for single linestring
     */
    static createSquareWavePath(numTooth: number, dxA: number, dxB: number, yA: number, yB: number, structure: number): Path;
    /**
     * Create various elliptic arcs
     * * circle with vector0, vector90 aligned with x,y
     * * circle with axes rotated
     * *
     * @param radiusRatio = vector90.magnitude / vector0.magnitude
     */
    static createArcs(radiusRatio?: number, sweep?: AngleSweep): Arc3d[];
    /**
     * Create many arcs, optionally including skews
     * * @param skewFactor array of skew factors.  for each skew factor, all base arcs are replicated with vector90 shifted by the factor times vector0
     */
    static createManyArcs(skewFactors?: number[]): Arc3d[];
    /**
     * Create edges of a range box.
     * * Line strings on low and high z
     * * single lines on each low z to high z edge.
     * * @param range (possibly null) range
     */
    static createRangeEdges(range: Range3d): BagOfCurves | undefined;
    /** Create swept "solids" that can be capped.
     * * At least one of each solid type.
     * * each is within 10 of the origin all directions.
     * @param capped true to include caps
     * @param rotationAngle angle of rotation for the angular sweep. The default is 90 degrees.
     *      Beware that the rotation sweep created with the default or any positive angle produces a mesh with inward normals.
     */
    static createClosedSolidSampler(capped: boolean, rotationAngle?: Angle): SolidPrimitive[];
    /**
     * Create points:
     * *  `numRadialEdges` radially from origin to polar point (r,sweep.start)
     * * `numArcEdges` along arc from (r,sweep.start) to (r,sweep.end)
     * * `numRadialEdges` returning to origin.
     * * optionally include closure point at origin.
     * @param x0 center x
     * @param y0 center y
     * @param radius radius of circle.
     * @param sweep start and end angles of sweep.
     * @param numRadialEdges number of edges from center to arc
     * @param numArcEdges number of edges along arc
     * @param addClosure true to repeat center as closure point
     */
    static createCutPie(x0: number, y0: number, radius: number, sweep: AngleSweep, numRadialEdges: number, numArcEdges: number, addClosure?: boolean): Point3d[];
    /**
     * * Let ay = 4
     * * Base polygon has vertices (0,0), (ax,0), (2*ax,0), (2* ax,ay), (ax,ay), (0,ay), (0,0).
     * * Shift the x coordinates of vertices 1,4 by indicated amounts (0-based numbering)
     * * Shift the y coordinates for points 1,2,3,4 by indicated amounts (in 0-based numbering)
     * * This is useful for testing non-y-monotonic face situations.
     * * Return as points.
     * @param dy1
     * @param dy2
     * @param dy3
     * @param dy4
     */
    static createVerticalStaggerPolygon(dy1: number, dy2: number, dy3: number, dy4: number, ax: number, ay: number, dx1: number, dx4: number): Point3d[];
    /** @deprecated in 4.x. Use createVerticalStaggerPolygon instead. */
    static creatVerticalStaggerPolygon(dy1: number, dy2: number, dy3: number, dy4: number, ax: number, ay: number, dx1: number, dx4: number): Point3d[];
    /**
     * Make line segments for each pair of adjacent points.
     * @param points array of points
     * @param forceClosure if true, inspect coordinates to determine if a closure edge is needed.
     */
    static convertPointsToSegments(points: Point3d[], forceClosure?: boolean): LineSegment3d[];
    /**
     * Create a regular polygon
     * @param angle0 angle from x axis to first point.
     * @param numPoint number of points
     * @param close true to add closure edge.
     */
    static createRegularPolygon(cx: number, cy: number, cz: number, angle0: Angle, r: number, numPoint: number, close: boolean): Point3d[];
    /**
     * Create a star by alternating radii (with equal angular steps)
     * @param r0 first point radius
     * @param r1 second point radius (if undefined, this is skipped and the result is points on a circle.)
     * @param numPoint number of points
     * @param close true to add closure edge.
     */
    static createStar(cx: number, cy: number, cz: number, r0: number, r1: number | undefined, numPoint: number, close: boolean, theta0?: Angle): Point3d[];
    /**
     * Create an outer star A
     * Place multiple inner stars B with centers on circle C
     * @param rA0 radius to star tips on starA
     * @param rA1 radius to star tips on starA
     * @param numAPoint number of points on starA
     * @param rB0 radius to star B tips
     * @param rB1 radius to star B  tips
     * @param numBPoint
     * @param rC radius for inner star centers
     * @param numC number of inner stars
     */
    static createStarsInStars(rA0: number, rA1: number, numAPoint: number, rB0: number, rB1: number, numBPoint: number, rC: number, numC: number, close: boolean): Point3d[][];
    private static appendGeometry;
    /** Create a simple example of each GeometryQuery type .... */
    static createAllGeometryQueryTypes(): GeometryQuery[];
    /**
     * Create points on a sine wave
     * Point i is origin + (i * xStep, a *sin(theta0 + i * dTheta), b * sin(beta0 + i * dBeta))
     * * Default b is zero, so it is a simple sine wave
     * * If the dTheta and dBeta are equal, it is a sine wave in a tilted plane.
     * * If dTheta and dBeta are different it is a non-planar curve
     */
    static createPointSineWave(origin: XYAndZ | undefined, numInterval?: number, xStep?: number, a?: number, thetaSweep?: AngleSweep, b?: number, betaSweep?: AngleSweep): Point3d[];
    /**
     * Create points with x,y,z independent functions of i and numInterval,
     * Point3d.create (fx(i,numInterval), fy(i,numInterval), fz(i, numInterval));
     */
    static createPointsByIndexFunctions(numInterval: number, fx: SteppedIndexFunction, fy: SteppedIndexFunction, fz?: SteppedIndexFunction): Point3d[];
    /**
     * Add an AuxData  (with multiple AuxChannelData) using data evaluated by a function of input and xyz.
     * @param data existing polyface data object to receive the additional AuxChannel
     * @param channelIndex
     * @param name name of channel
     * @param inputName name of input
     * @param input0 input value for channel 0
     * @param inputStep step between inputs (channels)
     * @param numInput number of channels (inputs)
     * @param dataType
     * @param scalarFunction function to return the scalar value at (input, point)
     */
    static addAuxDataScalarChannel(data: PolyfaceData, channelIndex: number, name: string | undefined, inputName: string | undefined, input0: number, inputStep: number, numInput: number, dataType: AuxChannelDataType, scalarFunction: (input: number, xyz: Point3d) => number): void;
    /**
     * Create a mesh between concentric arcs
     * @param edgesPerQuadrant edges per 90 degrees
     * @param center arc center
     * @param r0 first radius
     * @param r1 second radius
     * @param theta0 start angle
     * @param theta1 end angle.
     * @returns
     */
    static createMeshInAnnulus(edgesPerQuadrant: number, center: Point3d, r0: number, r1: number, theta0: Angle, theta1: Angle): IndexedPolyface | undefined;
    /** Create strokes on an arc at radius r0, then returning at radius r1. */
    static createAnnulusPolyline(edgesPerQuadrant: number, center: Point3d, r0: number, r1: number, theta0: Angle, theta1: Angle, addClosure: boolean): Point3d[];
    /**
     * Return an array of points on a circular arc.
     * @param edgesPerQuadrant number of edges per 90 degrees
     * @param center arc center
     * @param r0 arc radius
     * @param theta0 start angle
     * @param theta1 end angle
     * @param addClosure true to add a closure stroke
     * @returns
     */
    static createArcStrokes(edgesPerQuadrant: number, center: Point3d, r0: number, theta0: Angle, theta1: Angle, addClosure?: boolean, z?: number): Point3d[];
    /**
     * Create a mesh with
     *   * xy facets are 1x1 quads starting at origin
     *   * acceptFunction is called to accept or reject each quad's lower left xy coordinates
     * @param xzPoints array of points in the xz plane.  Expected to have increasing x and all integer coordinates.
     * @param ySweep distance to sweep in y direction
     * @param acceptFunction (x0: number, y0: number)=> boolean
     */
    static sweepXZLineStringToMeshWithHoles(xzPoints: number[][], ySweep: number, acceptFunction: (x0: number, y0: number) => boolean): IndexedPolyface;
    /**
     *  Successively move in directions in the steps array, creating numStroke total strokes.
     * * In typical use there are two entries in the steps vector, giving the effect of stair steps if they are perpendicular.
     * * if start is a single point, create a new point array with start as its first entry.
     * * if start is an array, add to it.
     * * if start is an empty array, push 000 as starting point.
     * @param start start point or prior array of points whose last is start point.
     * @param steps array of vectors giving step vectors.
     * @param numStroke number of steps to take.
     */
    static createZigZag(start: Point3d | Point3d[], steps: Vector3d[], numStroke: number): Point3d[];
    /**
     * Create a mesh surface from samples of a smooth function over [0,1]x[0,1].
     * @param size grid size; the number of intervals on each side of the unit square domain.
     */
    static createMeshFromSmoothSurface(size: number, options?: StrokeOptions): IndexedPolyface | undefined;
}
