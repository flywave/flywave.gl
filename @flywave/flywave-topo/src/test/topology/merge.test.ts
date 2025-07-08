import { expect } from "chai";
import { GeometryQuery } from "../../curve/geometry-query";
import { LineString3d } from "../../curve/line-string3d";
import { Angle } from "../../geometry3d/angle";
import { Matrix3d } from "../../geometry3d/matrix3d";
import { Point3d } from "../../geometry3d/point3d-vector3d";
import { Transform } from "../../geometry3d/transform";
import { PolyfaceBuilder } from "../../polyface/polyface-builder";
import { Sample } from "../../serialization/geometry-samples";
import { HalfEdge, HalfEdgeGraph } from "../../topology/graph";
import { HalfEdgeGraphSearch } from "../../topology/half-edge-graph-search";
import { HalfEdgePriorityQueueWithPartnerArray } from "../../topology/half-edge-priority-queue";
import { HalfEdgeGraphMerge } from "../../topology/merging";
import { Triangulator } from "../../topology/triangulation";
import { Checker } from "../checker";
import { GeometryCoreTestIO } from "../geometry-core-test-io";
import { prettyPrint } from "../test-functions";
import { GraphChecker } from "./graph.test";

describe("GraphMerge", () => {

  it("HalfEdgePriorityQueueWithPartnerArray", () => {
    const ck = new Checker();
    const edges = new HalfEdgePriorityQueueWithPartnerArray();
    const graph = new HalfEdgeGraph();
    const a = 0.31;
    const n = 20;
    for (let i = 0; i < n; i++) {
      const y0 = a * i;
      const e = graph.addEdgeXY(i, y0, i + 0.5, y0 + 1);
      edges.priorityQueue.push(e);
    }
    ck.testExactNumber(n, edges.priorityQueue.length);
    ck.testExactNumber(0, edges.activeEdges.length);

    for (let k = 1; k < 4; k++) {
      edges.popQueueToArray();
      ck.testExactNumber(n - k, edges.priorityQueue.length);
      ck.testExactNumber(k, edges.activeEdges.length);
    }
    // shuffle the array ...
    edges.popArrayToArrayIndex(1);
    let q;
    while ((q = edges.popQueueToArray()) !== undefined) {
      for (const p of edges.activeEdges) {
        if (p !== q)
          ck.testTrue(p.y < q.y, "low y moved to active edges first");
      }
      edges.removeArrayMembersWithY1Below(q.faceSuccessor.y);

    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("MergeQuadQuad", () => {
    const ck = new Checker();
    const dy = 20.0;
    let y0 = 0.0;
    let x0 = 0.0;
    const allGeometry: GeometryQuery[] = [];
    const loop0 = Sample.createRectangleXY(0, 0, 4, 5);
    const loop1 = Sample.createRectangleXY(1, 2, 6, 12);

    for (const degrees of [10, 0, 1.2, 55]) {
      const graph = new HalfEdgeGraph();
      const transform = Transform.createFixedPointAndMatrix(Point3d.create(0, 0, 0), Matrix3d.createRotationAroundAxisIndex(2, Angle.createDegrees(degrees)));
      Triangulator.createFaceLoopFromCoordinates(graph, loop0, true, false);
      Triangulator.createFaceLoopFromCoordinates(graph, loop1, true, false);
      graph.transformInPlace(transform);
      const splits = HalfEdgeGraphMerge.splitIntersectingEdges(graph);
      //
      GeometryCoreTestIO.consoleLog(`SPLITS = ${prettyPrint(splits)}`);
      // There are 8 edges.  2 pairs intersect, each generating 2 individual splits, creating 4 more.  (Each split counts as )
      ck.testExactNumber(4, splits.numSplit, "splits");
      ck.testExactNumber(12, splits.numUpEdge, "up edge");
      // ck.testExactNumber(8, splits.numPopOut, "pop out");
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, [LineString3d.create(loop0), LineString3d.create(loop1)], x0, y0 += dy, 0);
      GraphChecker.captureAnnotatedGraph(allGeometry, graph, x0, y0 += dy);

      HalfEdgeGraphMerge.clusterAndMergeXYTheta(graph);
      GraphChecker.captureAnnotatedGraph(allGeometry, graph, x0, y0 += dy);

      GeometryCoreTestIO.captureGeometry(allGeometry, PolyfaceBuilder.graphToPolyface(graph, undefined, (node) => HalfEdge.testFacePositiveAreaXY(node)), x0, y0 += dy, 0);

      Triangulator.triangulateAllPositiveAreaFaces(graph);
      GeometryCoreTestIO.captureGeometry(allGeometry, PolyfaceBuilder.graphToPolyface(graph, undefined, (node) => HalfEdge.testFacePositiveAreaXY(node)), x0, y0 += dy, 0);

      const summary1 = HalfEdgeGraphSearch.collectFaceAreaSummary(graph, true);
      ck.testExactNumber(summary1.numNegative, summary1.negativeItemArray!.length, " negative face counts");
      ck.testExactNumber(summary1.numPositive, summary1.positiveItemArray!.length, " positive face counts");
      ck.testExactNumber(summary1.numZero, summary1.zeroItemArray!.length, " zero face counts");
      GeometryCoreTestIO.saveGeometry(allGeometry, "Graph", "MergeQuadQuad");
      x0 += dy;
      y0 = 0.0;
    }
    expect(ck.getNumErrors()).equals(0);
  });
});
