import type { FeatureCollection } from "@flywave/flywave.gl";
import * as THREE from "three";
import { RailwayDataSource } from "./RailwayDataSource";

export interface TrackEdge {
    id: string;
    trackRef: string;
    name?: string;
    service: string;
    coordinates: number[][];
    projectedPath: THREE.Vector3[];
    length: number;
    fromNode: string;
    toNode: string;
    occupied: boolean;
    reserved: boolean;
}

export interface TrackNode {
    id: string;
    coordinate: number[];
}

const NODE_MERGE_DISTANCE = 0.0005;

const SELECTED_TRACKS = [
    "I-I",
    "I-II",
    "I-3",
    "I-4",
    "II-I",
    "II-II",
    "II-3",
    "II-4",
    "II-5",
    "II-6",
    "机待线",
    "货1",
    "货2",
    "货3",
    "货4",
    "货5",
    "粮专线",
    "安全线1",
    "安全线2",
    "安全线3"
];

export class TrackNetwork {
    private m_edges: Map<string, TrackEdge> = new Map();
    private m_nodes: Map<string, TrackNode> = new Map();
    private m_adjacency: Map<string, string[]> = new Map();

    buildFromGeoJSON(geojson: FeatureCollection, dataSource: RailwayDataSource): void {
        this.m_edges.clear();
        this.m_nodes.clear();
        this.m_adjacency.clear();

        const nodeCoordMap: Map<string, string> = new Map();

        for (const feature of geojson.features) {
            if (feature.geometry.type !== "LineString") continue;
            const coords = feature.geometry.coordinates as number[][];
            const props = feature.properties || {};
            const trackRef = props["railway:track_ref"] || "";
            const serviceName = props["service"] || "";
            const name = props["name"] || undefined;

            if (
                !SELECTED_TRACKS.includes(trackRef) &&
                serviceName !== "crossover" &&
                serviceName !== "yard" &&
                serviceName !== "siding"
            ) {
                const isMainLine = name && (name.includes("蓝烟") || name.includes("青荣"));
                if (!isMainLine) continue;
            }

            if (coords.length < 2) continue;

            const fromCoord = coords[0];
            const toCoord = coords[coords.length - 1];

            const fromNodeId = this.getOrMergeNode(fromCoord, nodeCoordMap);
            const toNodeId = this.getOrMergeNode(toCoord, nodeCoordMap);

            const projectedPath = coords.map(c => dataSource.projectToWorld(c[1], c[0], c[2] || 0));
            let length = 0;
            for (let i = 1; i < projectedPath.length; i++) {
                length += projectedPath[i].distanceTo(projectedPath[i - 1]);
            }

            const edgeId = feature.id ? String(feature.id) : `edge_${this.m_edges.size}`;
            const edge: TrackEdge = {
                id: edgeId,
                trackRef,
                name,
                service: serviceName,
                coordinates: coords,
                projectedPath,
                length,
                fromNode: fromNodeId,
                toNode: toNodeId,
                occupied: false,
                reserved: false
            };

            this.m_edges.set(edgeId, edge);
            this.addEdgeToAdjacency(fromNodeId, edgeId);
            this.addEdgeToAdjacency(toNodeId, edgeId);
        }
    }

    private getOrMergeNode(coord: number[], nodeCoordMap: Map<string, string>): string {
        const key = `${coord[0].toFixed(5)}_${coord[1].toFixed(5)}`;

        for (const [existingKey, nodeId] of nodeCoordMap) {
            const parts = existingKey.split("_");
            const dLon = Math.abs(coord[0] - parseFloat(parts[0]));
            const dLat = Math.abs(coord[1] - parseFloat(parts[1]));
            if (dLon < NODE_MERGE_DISTANCE && dLat < NODE_MERGE_DISTANCE) {
                return nodeId;
            }
        }

        const nodeId = `node_${this.m_nodes.size}`;
        this.m_nodes.set(nodeId, { id: nodeId, coordinate: coord });
        nodeCoordMap.set(key, nodeId);
        return nodeId;
    }

    private addEdgeToAdjacency(nodeId: string, edgeId: string): void {
        if (!this.m_adjacency.has(nodeId)) {
            this.m_adjacency.set(nodeId, []);
        }
        this.m_adjacency.get(nodeId)!.push(edgeId);
    }

    findPath(fromTrackRef: string, toTrackRef: string): TrackEdge[] {
        const startEdge = this.findEdgeByTrackRef(fromTrackRef);
        const endEdge = this.findEdgeByTrackRef(toTrackRef);
        if (!startEdge || !endEdge) return [];

        const startNodes = [startEdge.fromNode, startEdge.toNode];
        const endNodes = new Set([endEdge.fromNode, endEdge.toNode]);

        let bestPath: TrackEdge[] | null = null;

        for (const startNode of startNodes) {
            const path = this.bfs(startNode, endNodes);
            if (path && (!bestPath || path.length < bestPath.length)) {
                bestPath = path;
            }
        }

        return bestPath || [];
    }

    private bfs(startNode: string, targetNodes: Set<string>): TrackEdge[] | null {
        const queue: { node: string; path: TrackEdge[] }[] = [{ node: startNode, path: [] }];
        const visited = new Set<string>();
        visited.add(startNode);

        while (queue.length > 0) {
            const { node, path } = queue.shift()!;

            if (targetNodes.has(node) && path.length > 0) {
                return path;
            }

            const edgeIds = this.m_adjacency.get(node) || [];
            for (const edgeId of edgeIds) {
                const edge = this.m_edges.get(edgeId);
                if (!edge) continue;

                const nextNode = edge.fromNode === node ? edge.toNode : edge.fromNode;
                if (visited.has(nextNode)) continue;

                visited.add(nextNode);
                queue.push({ node: nextNode, path: [...path, edge] });
            }
        }

        return null;
    }

    findEdgeByTrackRef(ref: string): TrackEdge | undefined {
        for (const edge of this.m_edges.values()) {
            if (edge.trackRef === ref) return edge;
        }
        return undefined;
    }

    getPointAtDistance(
        edge: TrackEdge,
        distance: number
    ): { position: THREE.Vector3; tangent: THREE.Vector3 } | null {
        const path = edge.projectedPath;
        let accumulated = 0;

        for (let i = 0; i < path.length - 1; i++) {
            const segmentLength = path[i].distanceTo(path[i + 1]);
            if (accumulated + segmentLength >= distance) {
                const t = segmentLength > 0 ? (distance - accumulated) / segmentLength : 0;
                const position = new THREE.Vector3().lerpVectors(path[i], path[i + 1], t);
                const tangent = new THREE.Vector3().subVectors(path[i + 1], path[i]).normalize();
                return { position, tangent };
            }
            accumulated += segmentLength;
        }

        if (path.length >= 2) {
            const tangent = new THREE.Vector3()
                .subVectors(path[path.length - 1], path[path.length - 2])
                .normalize();
            return { position: path[path.length - 1].clone(), tangent };
        }
        return null;
    }

    buildPathFromEdges(
        edges: TrackEdge[],
        fromTrackRef: string,
        toTrackRef: string
    ): { positions: THREE.Vector3[]; tangents: THREE.Vector3[]; totalLength: number } {
        if (edges.length === 0) return { positions: [], tangents: [], totalLength: 0 };

        const positions: THREE.Vector3[] = [];

        for (let i = 0; i < edges.length; i++) {
            const path = edges[i].projectedPath;
            let ordered: THREE.Vector3[];

            if (i === 0) {
                ordered = [...path];
            } else {
                const prevLast = positions[positions.length - 1];
                const dFirst = prevLast.distanceTo(path[0]);
                const dLast = prevLast.distanceTo(path[path.length - 1]);
                ordered = dLast < dFirst ? [...path].reverse() : [...path];
            }

            const startIdx = i === 0 ? 0 : 1;
            for (let j = startIdx; j < ordered.length; j++) {
                positions.push(ordered[j].clone());
            }
        }

        const tangents: THREE.Vector3[] = [];
        for (let i = 0; i < positions.length - 1; i++) {
            tangents.push(
                new THREE.Vector3().subVectors(positions[i + 1], positions[i]).normalize()
            );
        }
        if (positions.length > 0) {
            tangents.push(
                tangents.length > 0
                    ? tangents[tangents.length - 1].clone()
                    : new THREE.Vector3(1, 0, 0)
            );
        }

        let totalLength = 0;
        for (let i = 1; i < positions.length; i++) {
            totalLength += positions[i].distanceTo(positions[i - 1]);
        }

        return { positions, tangents, totalLength };
    }

    reserveEdge(edgeId: string): boolean {
        const edge = this.m_edges.get(edgeId);
        if (!edge || edge.occupied || edge.reserved) return false;
        edge.reserved = true;
        return true;
    }

    occupyEdge(edgeId: string): void {
        const edge = this.m_edges.get(edgeId);
        if (edge) {
            edge.occupied = true;
            edge.reserved = false;
        }
    }

    releaseEdge(edgeId: string): void {
        const edge = this.m_edges.get(edgeId);
        if (edge) {
            edge.occupied = false;
            edge.reserved = false;
        }
    }

    get edges(): TrackEdge[] {
        return Array.from(this.m_edges.values());
    }

    get nodes(): TrackNode[] {
        return Array.from(this.m_nodes.values());
    }

    getEdge(id: string): TrackEdge | undefined {
        return this.m_edges.get(id);
    }
}
