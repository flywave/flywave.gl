export class TrackNetwork {
    m_edges: Map<any, any>;
    m_nodes: Map<any, any>;
    m_adjacency: Map<any, any>;
    buildFromGeoJSON(geojson: any, dataSource: any): void;
    getOrMergeNode(coord: any, nodeCoordMap: any): any;
    addEdgeToAdjacency(nodeId: any, edgeId: any): void;
    findPath(fromTrackRef: any, toTrackRef: any): any[];
    bfs(startNode: any, targetNodes: any): any[];
    findEdgeByTrackRef(ref: any): any;
    getPointAtDistance(edge: any, distance: any): {
        position: any;
        tangent: THREE.Vector3;
    };
    buildPathFromEdges(edges: any, fromTrackRef: any, toTrackRef: any): {
        positions: any[];
        tangents: THREE.Vector3[];
        totalLength: number;
    };
    reserveEdge(edgeId: any): boolean;
    occupyEdge(edgeId: any): void;
    releaseEdge(edgeId: any): void;
    get edges(): any[];
    get nodes(): any[];
    getEdge(id: any): any;
}
import * as THREE from "three/webgpu";
