/* Copyright (C) 2025 flywave.gl contributors */

import { FlatArray } from "@flywave/flywave-utils";
import { Vector2 } from "three";

import { type GeomEdge, getPointOrientation, isEdgeIntersecting, isQuadConvex } from "./Utils";

export function cdt({
    positions,
    indices
}: {
    positions: FlatArray<number>;
    indices: FlatArray<number>;
}): { positions: FlatArray<number>; indices: FlatArray<number> } {
    const cdt = new CDT(positions, indices);
    const array = new Array(cdt.triangles.length * 3).fill(0);
    cdt.triangles.forEach((t, i) => {
        const j = 3 * i;
        array[j] = t[0];
        array[j + 1] = t[1];
        array[j + 2] = t[2];
    });
    return {
        positions,
        indices: FlatArray.create<number>({ array, itemSize: 3 })
    };
}

// -------------------------------------------------------------------------------------------------

class CDT {
    private min_coord = new Vector2(0, 0);
    private max_coord = new Vector2(1, 1);
    private vert: Vector2[] = [];
    private scaled_vert: Vector2[] = [];
    private con_edge: Edge[] = [];
    private vert_to_tri: number[][] = [];
    private bin: BinIndex[] = [];
    private tri: Triangle[] = [];
    private adj: Array<[number, number, number]> = [];
    private screenL = 1;

    constructor(vertices: FlatArray<number>, edges: FlatArray<number>) {
        this.setVertices(vertices);
        this.setEdges(edges);
        this.scaled_vert = [];
        this.vert_to_tri = [];
        this.bin = [];
        this.tri = [];
        this.adj = [];
        this.triangulate();
    }

    get triangles() {
        return this.tri;
    }

    // -----------------------------------------------------------------------

    private triangulate() {
        const nVertex = this.vert.length;
        if (nVertex === 0) {
            printToLog("No input vertices to triangulate.");
            return;
        }

        let t0 = performance.now();

        //Compute Delaunay triangulation
        this.delaunay();
        const t_delaunay = performance.now() - t0;
        // printToLog("Delaunay triangulation in " + t_delaunay.toFixed(2) + " ms.")

        //Constrain edges if required
        if (this.con_edge.length > 0) {
            t0 = performance.now();
            this.constrainEdges();
            const t_constrain = performance.now() - t0;

            // printToLog("Constrained edges in " + t_constrain.toFixed(2) + " ms.")
            printToLog("Computed cdt in " + (t_delaunay + t_constrain).toFixed(2) + " ms.");
        } else {
            printToLog("cdt in " + t_delaunay.toFixed(2) + " ms.");
        }
    }

    private setVertices(vertices: FlatArray<number>) {
        if (vertices.itemSize !== 2 && vertices.itemSize !== 3) {
            throw new Error(
                "vertices must be defined with itemSize = 2 or 3 (coordinates in 2D or 3D)"
            );
        }

        this.vert = [];
        this.min_coord = new Vector2(Number.MAX_VALUE, Number.MAX_VALUE);
        this.max_coord = new Vector2(-Number.MAX_VALUE, -Number.MAX_VALUE);

        vertices.forEach(p => {
            const coords = new Vector2(Number(p[0]), Number(p[1]));
            this.vert.push(coords);
            this.min_coord.x = Math.min(this.min_coord.x, coords.x);
            this.min_coord.y = Math.min(this.min_coord.y, coords.y);
            this.max_coord.x = Math.max(this.max_coord.x, coords.x);
            this.max_coord.y = Math.max(this.max_coord.y, coords.y);
        });

        this.screenL = Math.max(
            this.max_coord.x - this.min_coord.x,
            this.max_coord.y - this.min_coord.y
        );
    }

    private setEdges(edges: FlatArray<number>) {
        if (edges.itemSize !== 2) {
            throw new Error(
                "edges must be defined with itemSize = 2 (two vertex ids making the constrained edges)"
            );
        }

        const nVertex = this.vert.length;
        this.con_edge = [];

        edges.forEach((edge: number[], i: number) => {
            if (edge[0] < 0 || edge[0] >= nVertex || edge[1] < 0 || edge[1] >= nVertex) {
                throw new Error(
                    `Vertex indices of edge ${i} (${edge}) need to be non-negative and less than the number of input vertices (${nVertex}).`
                );
            }

            if (edge[0] === edge[1]) {
                throw new Error(`Edge ${i} is degenerate!`);
            }

            const _edge = [edge[0], edge[1]] as Edge;

            if (!this.isEdgeValid(_edge)) {
                throw new Error(`Edge ${i} already exists or intersects with an existing edge!`);
            }

            this.con_edge.push(_edge);
        });
    }

    private isEdgeValid(newEdge: Edge) {
        const edgeList = this.con_edge;
        const vertices = this.vert;

        const new_edge_verts = [vertices[newEdge[0]], vertices[newEdge[1]]] as GeomEdge;

        for (let i = 0; i < edgeList.length; i++) {
            //Not valid if edge already exists
            if (
                (edgeList[i][0] === newEdge[0] && edgeList[i][1] === newEdge[1]) ||
                (edgeList[i][0] === newEdge[1] && edgeList[i][1] === newEdge[0])
            ) {
                return false;
            }

            const hasCommonNode =
                edgeList[i][0] === newEdge[0] ||
                edgeList[i][0] === newEdge[1] ||
                edgeList[i][1] === newEdge[0] ||
                edgeList[i][1] === newEdge[1];
            const edge_verts = [vertices[edgeList[i][0]], vertices[edgeList[i][1]]] as GeomEdge;

            if (!hasCommonNode && isEdgeIntersecting(edge_verts, new_edge_verts)) {
                return false;
            }
        }

        return true;
    }

    private binSorter(a: BinIndex, b: BinIndex) {
        if (a.bin === b.bin) {
            return 0;
        } else {
            return a.bin < b.bin ? -1 : 1;
        }
    }

    private setupDelaunay() {
        const nVertex = this.vert.length;
        const nBinsX = Math.round(Math.pow(nVertex, 0.25));

        //Compute scaled vertex coordinates and assign each vertex to a bin
        const scaledverts = [];
        const bin_index: BinIndex[] = [];
        for (let i = 0; i < nVertex; i++) {
            const scaled_x = (this.vert[i].x - this.min_coord.x) / this.screenL;
            const scaled_y = (this.vert[i].y - this.min_coord.y) / this.screenL;
            scaledverts.push(new Vector2(scaled_x, scaled_y));

            const ind_i = Math.round((nBinsX - 1) * scaled_x);
            const ind_j = Math.round((nBinsX - 1) * scaled_y);

            let bin_id = 0;
            if (ind_j % 2 === 0) {
                bin_id = ind_j * nBinsX + ind_i;
            } else {
                bin_id = (ind_j + 1) * nBinsX - ind_i - 1;
            }
            bin_index.push({ ind: i, bin: bin_id });
        }

        //cAdd super-triangle vertices (far away)
        const D = boundingL;
        scaledverts.push(new Vector2(-D + 0.5, -D / Math.sqrt(3) + 0.5));
        scaledverts.push(new Vector2(D + 0.5, -D / Math.sqrt(3) + 0.5));
        scaledverts.push(new Vector2(0.5, (2 * D) / Math.sqrt(3) + 0.5));

        for (let i = nVertex; i < nVertex + 3; i++) {
            this.vert.push(
                new Vector2(
                    this.screenL * scaledverts[i].x + this.min_coord.x,
                    this.screenL * scaledverts[i].y + this.min_coord.y
                )
            );
        }

        //Sort the vertices in ascending bin order
        bin_index.sort(this.binSorter);

        this.scaled_vert = scaledverts;
        this.bin = bin_index;

        //Super-triangle connectivity
        this.tri = [[nVertex, nVertex + 1, nVertex + 2]];
        this.adj = [[-1, -1, -1]];
        this.vert_to_tri = [];
    }

    // Function for computing the unconstrained Delaunay triangulation
    private delaunay() {
        // Sort input vertices and setup super-triangle
        this.setupDelaunay();

        const verts = this.scaled_vert;
        const bins = this.bin;
        const triangles = this.tri;
        const adjacency = this.adj;

        const N = verts.length - 3; // vertices includes super-triangle nodes

        let ind_tri = 0; // points to the super-triangle
        let nhops_total = 0;

        for (let i = 0; i < N; i++) {
            const new_i = bins[i].ind;

            const res = this.findEnclosingTriangle(verts[new_i], ind_tri);
            ind_tri = res[0];
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            nhops_total += res[1];

            if (ind_tri === -1) {
                throw new Error("Could not find a triangle containing the new vertex!");
            }

            const cur_tri = triangles[ind_tri]; //vertex indices of triangle containing new point
            const new_tri0 = [cur_tri[0], cur_tri[1], new_i] as Triangle;
            const new_tri1 = [new_i, cur_tri[1], cur_tri[2]] as Triangle;
            const new_tri2 = [cur_tri[0], new_i, cur_tri[2]] as Triangle;

            //Replace the triangle containing the point with new_tri0, and
            //fix its adjacency
            triangles[ind_tri] = new_tri0;

            const N_tri = triangles.length;
            const cur_tri_adj = adjacency[ind_tri]; //neighbors of cur_tri
            adjacency[ind_tri] = [N_tri, N_tri + 1, cur_tri_adj[2]];

            //Add the other two new triangles to the list
            triangles.push(new_tri1); //triangle index N_tri
            triangles.push(new_tri2); //triangle index (N_tri+1)

            adjacency.push([cur_tri_adj[0], N_tri + 1, ind_tri]); //adj for triangle N_tri
            adjacency.push([N_tri, cur_tri_adj[1], ind_tri]); //adj for triangle (N_tri+1)

            //stack of triangles which need to be checked for Delaunay condition
            //each element contains: [index of tri to check, adjncy index to goto triangle that contains new point]
            const stack: Array<[number, number]> = [];

            if (cur_tri_adj[2] >= 0) {
                //if triangle cur_tri's neighbor exists
                //Find the index for cur_tri in the adjacency of the neighbor
                const neigh_adj_ind = adjacency[cur_tri_adj[2]].indexOf(ind_tri);

                //No need to update adjacency, but push the neighbor on to the stack
                stack.push([cur_tri_adj[2], neigh_adj_ind]);
            }

            if (cur_tri_adj[0] >= 0) {
                //if triangle N_tri's neighbor exists
                //Find the index for cur_tri in the adjacency of the neighbor
                const neigh_adj_ind = adjacency[cur_tri_adj[0]].indexOf(ind_tri);
                adjacency[cur_tri_adj[0]][neigh_adj_ind] = N_tri;
                stack.push([cur_tri_adj[0], neigh_adj_ind]);
            }

            if (cur_tri_adj[1] >= 0) {
                //if triangle (N_tri+1)'s neighbor exists
                //Find the index for cur_tri in the adjacency of the neighbor
                const neigh_adj_ind = adjacency[cur_tri_adj[1]].indexOf(ind_tri);
                adjacency[cur_tri_adj[1]][neigh_adj_ind] = N_tri + 1;
                stack.push([cur_tri_adj[1], neigh_adj_ind]);
            }

            this.restoreDelaunay(new_i, stack);
        } // loop over vertices

        this.removeBoundaryTriangles();

        // printToLog(`Created ${triangles.length} triangles.`)
    }

    //Uses edge orientations - based on Peter Brown's Technical Report 1997
    private findEnclosingTriangle(target_vertex: Vector2, ind_tri_cur: number) {
        const vertices = this.scaled_vert;
        const triangles = this.tri;
        const adjacency = this.adj;
        const max_hops = Math.max(10, adjacency.length);

        let nhops = 0;
        const found_tri = false;
        const path = [];

        // eslint-disable-next-line no-unmodified-loop-condition
        while (!found_tri && nhops < max_hops) {
            if (ind_tri_cur === -1) {
                //target is outside triangulation
                return [ind_tri_cur, nhops];
            }

            const tri_cur = triangles[ind_tri_cur];

            //Orientation of target wrt each edge of triangle (positive if on left of edge)
            const orients = [
                getPointOrientation([vertices[tri_cur[1]], vertices[tri_cur[2]]], target_vertex),
                getPointOrientation([vertices[tri_cur[2]], vertices[tri_cur[0]]], target_vertex),
                getPointOrientation([vertices[tri_cur[0]], vertices[tri_cur[1]]], target_vertex)
            ];

            if (orients[0] >= 0 && orients[1] >= 0 && orients[2] >= 0) {
                //target is to left of all edges, so inside tri
                return [ind_tri_cur, nhops];
            }

            let base_ind = -1;
            for (let iedge = 0; iedge < 3; iedge++) {
                if (orients[iedge] >= 0) {
                    base_ind = iedge;
                    break;
                }
            }
            const base_p1_ind = (base_ind + 1) % 3;
            const base_p2_ind = (base_ind + 2) % 3;

            if (orients[base_p1_ind] >= 0 && orients[base_p2_ind] < 0) {
                ind_tri_cur = adjacency[ind_tri_cur][base_p2_ind]; //should move to the triangle opposite base_p2_ind
                path[nhops] = vertices[tri_cur[base_ind]]
                    .add(vertices[tri_cur[base_p1_ind]])
                    .multiplyScalar(0.5);
            } else if (orients[base_p1_ind] < 0 && orients[base_p2_ind] >= 0) {
                ind_tri_cur = adjacency[ind_tri_cur][base_p1_ind]; //should move to the triangle opposite base_p1_ind
                path[nhops] = vertices[tri_cur[base_p2_ind]]
                    .add(vertices[tri_cur[base_ind]])
                    .multiplyScalar(0.5);
            } else {
                const vec0 = vertices[tri_cur[base_p1_ind]].sub(vertices[tri_cur[base_ind]]); //vector from base_ind to base_p1_ind
                const vec1 = target_vertex.sub(vertices[tri_cur[base_ind]]); //vector from base_ind to target_vertex
                if (vec0.dot(vec1) > 0) {
                    ind_tri_cur = adjacency[ind_tri_cur][base_p2_ind]; //should move to the triangle opposite base_p2_ind
                    path[nhops] = vertices[tri_cur[base_ind]]
                        .add(vertices[tri_cur[base_p1_ind]])
                        .multiplyScalar(0.5);
                } else {
                    ind_tri_cur = adjacency[ind_tri_cur][base_p1_ind]; //should move to the triangle opposite base_p1_ind
                    path[nhops] = vertices[tri_cur[base_p2_ind]]
                        .add(vertices[tri_cur[base_ind]])
                        .multiplyScalar(0.5);
                }
            }

            nhops++;
        }

        if (!found_tri) {
            printToLog(
                "Failed to locate triangle containing vertex (" +
                    target_vertex.x.toFixed(4) +
                    ", " +
                    target_vertex.y.toFixed(4) +
                    "). " +
                    "Input vertices may be too close to each other."
            );
        }

        return [ind_tri_cur, nhops - 1];
    }

    private restoreDelaunay(ind_vert: number, stack: Array<[number, number]>) {
        const vertices = this.scaled_vert;
        const triangles = this.tri;
        const adjacency = this.adj;
        const v_new = vertices[ind_vert];

        while (stack.length > 0) {
            const ind_tri_pair = stack.pop(); //[index of tri to check, adjncy index to goto triangle that contains new point]
            if (ind_tri_pair === undefined) {
                throw new Error("Someting wernt wrong");
            }
            const ind_tri = ind_tri_pair[0] as number;

            const ind_tri_vert = triangles[ind_tri]; //vertex indices of the triangle
            const v_tri = [];
            for (let i = 0; i < 3; i++) v_tri[i] = vertices[ind_tri_vert[i]];

            if (!this.isDelaunay2(v_tri, v_new)) {
                //v_new lies inside the circumcircle of the triangle, so need to swap diagonals

                const outernode_tri = ind_tri_pair[1]; // [0,1,2] node-index of vertex that's not part of the common edge
                const ind_tri_neigh = adjacency[ind_tri][outernode_tri];

                // eslint-disable-next-line @typescript-eslint/no-throw-literal
                if (ind_tri_neigh < 0) throw "negative index";

                //Swap the diagonal between the adjacent triangles
                this.swapDiagonal(ind_tri, ind_tri_neigh);

                //Add the triangles opposite the new vertex to the stack
                const new_node_ind_tri = triangles[ind_tri].indexOf(ind_vert);
                const ind_tri_outerp2 = adjacency[ind_tri][new_node_ind_tri];
                if (ind_tri_outerp2 >= 0) {
                    const neigh_node = adjacency[ind_tri_outerp2].indexOf(ind_tri);
                    stack.push([ind_tri_outerp2, neigh_node]);
                }

                const new_node_ind_tri_neigh = triangles[ind_tri_neigh].indexOf(ind_vert);
                const ind_tri_neigh_outer = adjacency[ind_tri_neigh][new_node_ind_tri_neigh];
                if (ind_tri_neigh_outer >= 0) {
                    const neigh_node = adjacency[ind_tri_neigh_outer].indexOf(ind_tri_neigh);
                    stack.push([ind_tri_neigh_outer, neigh_node]);
                }
            } //is not Delaunay
        }
    }

    //Swaps the diagonal of adjacent triangles A and B
    private swapDiagonal(ind_triA: number, ind_triB: number) {
        const triangles = this.tri;
        const adjacency = this.adj;
        const vert2tri = this.vert_to_tri;

        //Find the node index of the outer vertex in each triangle
        const outernode_triA = adjacency[ind_triA].indexOf(ind_triB);
        const outernode_triB = adjacency[ind_triB].indexOf(ind_triA);

        //Indices of nodes after the outernode (i.e. nodes of the common edge)
        const outernode_triA_p1 = (outernode_triA + 1) % 3;
        const outernode_triA_p2 = (outernode_triA + 2) % 3;

        const outernode_triB_p1 = (outernode_triB + 1) % 3;
        const outernode_triB_p2 = (outernode_triB + 2) % 3;

        //Update triangle nodes
        triangles[ind_triA][outernode_triA_p2] = triangles[ind_triB][outernode_triB];
        triangles[ind_triB][outernode_triB_p2] = triangles[ind_triA][outernode_triA];

        //Update adjacencies for triangle opposite outernode
        adjacency[ind_triA][outernode_triA] = adjacency[ind_triB][outernode_triB_p1];
        adjacency[ind_triB][outernode_triB] = adjacency[ind_triA][outernode_triA_p1];

        //Update adjacency of neighbor opposite triangle A's (outernode+1) node
        const ind_triA_neigh_outerp1 = adjacency[ind_triA][outernode_triA_p1];
        if (ind_triA_neigh_outerp1 >= 0) {
            const neigh_node = adjacency[ind_triA_neigh_outerp1].indexOf(ind_triA);
            adjacency[ind_triA_neigh_outerp1][neigh_node] = ind_triB;
        }

        //Update adjacency of neighbor opposite triangle B's (outernode+1) node
        const ind_triB_neigh_outerp1 = adjacency[ind_triB][outernode_triB_p1];
        if (ind_triB_neigh_outerp1 >= 0) {
            const neigh_node = adjacency[ind_triB_neigh_outerp1].indexOf(ind_triB);
            adjacency[ind_triB_neigh_outerp1][neigh_node] = ind_triA;
        }

        //Update adjacencies for triangles opposite the (outernode+1) node
        adjacency[ind_triA][outernode_triA_p1] = ind_triB;
        adjacency[ind_triB][outernode_triB_p1] = ind_triA;

        //Update vertex to triangle connectivity, if data structure exists
        if (vert2tri.length > 0) {
            //The original outernodes will now be part of both triangles
            vert2tri[triangles[ind_triA][outernode_triA]].push(ind_triB);
            vert2tri[triangles[ind_triB][outernode_triB]].push(ind_triA);

            //Remove triangle B from the triangle set of outernode_triA_p1
            let local_ind = vert2tri[triangles[ind_triA][outernode_triA_p1]].indexOf(ind_triB);
            vert2tri[triangles[ind_triA][outernode_triA_p1]].splice(local_ind, 1);

            //Remove triangle A from the triangle set of outernode_triB_p1
            local_ind = vert2tri[triangles[ind_triB][outernode_triB_p1]].indexOf(ind_triA);
            vert2tri[triangles[ind_triB][outernode_triB_p1]].splice(local_ind, 1);
        }
    }

    private removeBoundaryTriangles() {
        const verts = this.scaled_vert;
        const triangles = this.tri;
        const adjacency = this.adj;
        const N = verts.length - 3;

        let del_count = 0;
        const indmap = [];
        for (let i = 0; i < triangles.length; i++) {
            const prev_del_count = del_count;
            for (let j = i; j < triangles.length; j++) {
                if (triangles[j][0] < N && triangles[j][1] < N && triangles[j][2] < N) {
                    indmap[i + del_count] = i;
                    break;
                } else {
                    indmap[i + del_count] = -1;
                    del_count++;
                }
            }

            const del_length = del_count - prev_del_count;
            if (del_length > 0) {
                triangles.splice(i, del_length);
                adjacency.splice(i, del_length);
            }
        }

        //Update adjacencies
        for (let i = 0; i < adjacency.length; i++) {
            for (let j = 0; j < 3; j++) {
                adjacency[i][j] = indmap[adjacency[i][j]];
            }
        }

        //Delete super-triangle nodes
        this.scaled_vert.splice(-3, 3);
        this.vert.splice(-3, 3);
    }

    private isDelaunay2(v_tri: Vector2[], p: Vector2) {
        const vecp0 = v_tri[0].sub(p);
        const vecp1 = v_tri[1].sub(p);
        const vecp2 = v_tri[2].sub(p);

        const p0_sq = vecp0.x * vecp0.x + vecp0.y * vecp0.y;
        const p1_sq = vecp1.x * vecp1.x + vecp1.y * vecp1.y;
        const p2_sq = vecp2.x * vecp2.x + vecp2.y * vecp2.y;

        const det =
            vecp0.x * (vecp1.y * p2_sq - p1_sq * vecp2.y) -
            vecp0.y * (vecp1.x * p2_sq - p1_sq * vecp2.x) +
            p0_sq * (vecp1.x * vecp2.y - vecp1.y * vecp2.x);

        if (det > 0) {
            //p is inside circumcircle of v_tri
            return false;
        } else return true;
    }

    private constrainEdges() {
        if (this.con_edge.length === 0) {
            return;
        }

        this.buildVertexConnectivity();

        const con_edges = this.con_edge;
        const triangles = this.tri;
        const verts = this.scaled_vert;
        const adjacency = this.adj;
        const vert2tri = this.vert_to_tri;

        const newEdgeList: Edge[] = [];

        for (let iedge = 0; iedge < con_edges.length; iedge++) {
            let intersections = this.getEdgeIntersections(iedge);

            let iter = 0;
            const maxIter = Math.max(intersections.length, 1);
            while (intersections.length > 0 && iter < maxIter) {
                this.fixEdgeIntersections(intersections, iedge, newEdgeList);
                intersections = this.getEdgeIntersections(iedge);
                iter++;
            }

            if (intersections.length > 0) {
                throw new Error(
                    "Could not add edge " +
                        iedge +
                        " to triangulation after " +
                        maxIter +
                        " iterations!"
                );
            }
        } //loop over constrained edges

        //Restore Delaunay
        while (true) {
            let num_diagonal_swaps = 0;
            for (let iedge = 0; iedge < newEdgeList.length; iedge++) {
                const new_edge_nodes = newEdgeList[iedge];

                //Check if the new edge is a constrained edge
                let is_con_edge = false;
                for (let jedge = 0; jedge < con_edges.length; jedge++) {
                    if (isSameEdge(new_edge_nodes, con_edges[jedge])) {
                        is_con_edge = true;
                        break;
                    }
                }

                if (is_con_edge) {
                    continue; //cannot change this edge if it's constrained
                }

                const tri_around_v0 = vert2tri[new_edge_nodes[0]];
                let tri_count = 0;
                const tri_ind_pair = [-1, -1]; //indices of the triangles on either side of this edge
                for (let itri = 0; itri < tri_around_v0.length; itri++) {
                    const cur_tri = triangles[tri_around_v0[itri]] as Triangle;
                    if (
                        cur_tri[0] === new_edge_nodes[1] ||
                        cur_tri[1] === new_edge_nodes[1] ||
                        cur_tri[2] === new_edge_nodes[1]
                    ) {
                        tri_ind_pair[tri_count] = tri_around_v0[itri];
                        tri_count++;

                        if (tri_count === 2) {
                            break; //found both neighboring triangles
                        }
                    }
                }

                if (tri_ind_pair[0] === -1) {
                    continue; //this edge no longer exists, so nothing to do.
                }

                const triA_verts = [
                    verts[triangles[tri_ind_pair[0]][0]],
                    verts[triangles[tri_ind_pair[0]][1]],
                    verts[triangles[tri_ind_pair[0]][2]]
                ];

                const outer_nodeB_ind = adjacency[tri_ind_pair[1]].indexOf(tri_ind_pair[0]);
                const triB_vert = verts[triangles[tri_ind_pair[1]][outer_nodeB_ind]];

                if (!this.isDelaunay2(triA_verts, triB_vert)) {
                    const outer_nodeA_ind = adjacency[tri_ind_pair[0]].indexOf(tri_ind_pair[1]);

                    //Swap the diagonal between the pair of triangles
                    this.swapDiagonal(tri_ind_pair[0], tri_ind_pair[1]);
                    num_diagonal_swaps++;

                    //Replace current new edge with the new diagonal
                    newEdgeList[iedge] = [
                        triangles[tri_ind_pair[0]][outer_nodeA_ind],
                        triangles[tri_ind_pair[1]][outer_nodeB_ind]
                    ];
                }
            } //loop over new edges

            if (num_diagonal_swaps === 0) {
                break; //no further swaps, we're done.
            }
        }
    }

    private buildVertexConnectivity() {
        const triangles = this.tri;
        this.vert_to_tri = [];
        const vConnectivity = this.vert_to_tri;

        for (let itri = 0; itri < triangles.length; itri++) {
            for (let node = 0; node < 3; node++) {
                if (vConnectivity[triangles[itri][node]] === undefined) {
                    vConnectivity[triangles[itri][node]] = [itri];
                } else vConnectivity[triangles[itri][node]].push(itri);
            }
        }
    }

    private getEdgeIntersections(iedge: number) {
        const triangles = this.tri;
        const verts = this.scaled_vert;
        const adjacency = this.adj;
        const con_edges = this.con_edge;
        const vert2tri = this.vert_to_tri;

        const edge_v0_ind = con_edges[iedge][0];
        const edge_v1_ind = con_edges[iedge][1];
        const edge_coords = [verts[edge_v0_ind], verts[edge_v1_ind]] as GeomEdge;

        const tri_around_v0 = vert2tri[edge_v0_ind] as number[];

        let edge_in_triangulation = false;

        //stores the index of tri that intersects current edge,
        //and the edge-index of intersecting edge in triangle
        const intersections: Array<[number, number]> = [];

        for (let itri = 0; itri < tri_around_v0.length; itri++) {
            const cur_tri = triangles[tri_around_v0[itri]];
            const v0_node = cur_tri.indexOf(edge_v0_ind);
            const v0p1_node = (v0_node + 1) % 3;
            const v0p2_node = (v0_node + 2) % 3;

            if (edge_v1_ind === cur_tri[v0p1_node]) {
                //constrained edge is an edge of the current tri (node v0_node to v0_node+1)
                edge_in_triangulation = true;
                break;
            } else if (edge_v1_ind === cur_tri[v0p2_node]) {
                //constrained edge is an edge of the current tri (node v0_node to v0_node+2)
                edge_in_triangulation = true;
                break;
            }

            const opposite_edge_coords = [
                verts[cur_tri[v0p1_node]],
                verts[cur_tri[v0p2_node]]
            ] as GeomEdge;
            if (isEdgeIntersecting(edge_coords, opposite_edge_coords)) {
                intersections.push([tri_around_v0[itri], v0_node]);
                break;
            }
        }

        if (!edge_in_triangulation) {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            if (intersections.length === 0) throw "Cannot have no intersections!";

            while (true) {
                const prev_intersection = intersections[intersections.length - 1]; //[tri ind][node ind for edge]
                const tri_ind = adjacency[prev_intersection[0]][prev_intersection[1]];

                if (
                    triangles[tri_ind][0] === edge_v1_ind ||
                    triangles[tri_ind][1] === edge_v1_ind ||
                    triangles[tri_ind][2] === edge_v1_ind
                ) {
                    break; //found the end node of the edge
                }

                //Find the index of the edge from which we came into this triangle
                const prev_edge_ind = adjacency[tri_ind].indexOf(prev_intersection[0]);
                // eslint-disable-next-line @typescript-eslint/no-throw-literal
                if (prev_edge_ind === -1) throw "Could not find edge!";

                const cur_tri = triangles[tri_ind];

                //Loop over the other two edges in this triangle,
                //and check if they intersect the constrained edge
                for (let offset = 1; offset < 3; offset++) {
                    const v0_node = (prev_edge_ind + offset + 1) % 3;
                    const v1_node = (prev_edge_ind + offset + 2) % 3;
                    const cur_edge_coords = [
                        verts[cur_tri[v0_node]],
                        verts[cur_tri[v1_node]]
                    ] as GeomEdge;

                    if (isEdgeIntersecting(edge_coords, cur_edge_coords)) {
                        intersections.push([tri_ind, (prev_edge_ind + offset) % 3]);
                        break;
                    }
                }
            } //while intersections not found
        } //if edge not in triangulation

        return intersections;
    }

    // intersectionList: number [][]
    private fixEdgeIntersections(
        intersectionList: number[][],
        con_edge_ind: number,
        newEdgeList: Array<[number, number]>
    ) {
        const triangles = this.tri;
        const verts = this.scaled_vert;
        const adjacency = this.adj;
        const con_edges = this.con_edge;

        //Node indices and endpoint coords of current constrained edge
        const con_edge_nodes = con_edges[con_edge_ind];
        const cur_con_edge_coords = [
            verts[con_edge_nodes[0]],
            verts[con_edge_nodes[1]]
        ] as GeomEdge;

        const nIntersections = intersectionList.length;
        for (let i = 0; i < nIntersections; i++) {
            //Looping in reverse order is important since then the
            //indices in intersectionList remain unaffected by any diagonal swaps
            const tri0_ind = intersectionList[nIntersections - 1 - i][0];
            const tri0_node = intersectionList[nIntersections - 1 - i][1];

            const tri1_ind = adjacency[tri0_ind][tri0_node];
            const tri1_node = adjacency[tri1_ind].indexOf(tri0_ind);

            const quad_v0 = verts[triangles[tri0_ind][tri0_node]];
            const quad_v1 = verts[triangles[tri0_ind][(tri0_node + 1) % 3]];
            const quad_v2 = verts[triangles[tri1_ind][tri1_node]];
            const quad_v3 = verts[triangles[tri0_ind][(tri0_node + 2) % 3]];

            const isConvex = isQuadConvex(quad_v0, quad_v1, quad_v2, quad_v3);

            if (isConvex) {
                this.swapDiagonal(tri0_ind, tri1_ind);

                const newDiagonal_nodes = [
                    triangles[tri0_ind][tri0_node],
                    triangles[tri1_ind][tri1_node]
                ];

                const newDiagonal_coords = [quad_v0, quad_v2] as GeomEdge;
                const hasCommonNode =
                    newDiagonal_nodes[0] === con_edge_nodes[0] ||
                    newDiagonal_nodes[0] === con_edge_nodes[1] ||
                    newDiagonal_nodes[1] === con_edge_nodes[0] ||
                    newDiagonal_nodes[1] === con_edge_nodes[1];
                if (hasCommonNode || !isEdgeIntersecting(cur_con_edge_coords, newDiagonal_coords)) {
                    newEdgeList.push([newDiagonal_nodes[0], newDiagonal_nodes[1]]);
                }
            } //is convex
        } //loop over intersections
    }
}

function printToLog(msg: string) {
    // eslint-disable-next-line no-console
    console.log(msg);
}

function isSameEdge(edge0: Edge, edge1: Edge): boolean {
    return (
        (edge0[0] === edge1[0] && edge0[1] === edge1[1]) ||
        (edge0[1] === edge1[0] && edge0[0] === edge1[1])
    );
}

export type Edge = [number, number];
export type Triangle = [number, number, number];
interface BinIndex {
    ind: number;
    bin: number;
}

const boundingL = 1000.0;
