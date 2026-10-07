/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";

import { type MeshParams } from "../common/render/primitives/mesh-params";
import { type Point3d, type Range3d } from "../core-geometry";
import { EdgeGeometry, PolylineEdgeGeometry, SilhouetteEdgeGeometry } from "./edge-geometry";
import { IndexedEdgeGeometry } from "./indexed-edge-geometry";
import { MeshData } from "./mesh-data";
import { type RenderGeometry } from "./render-geometry";
import { SurfaceGeometry } from "./surface-geometry";

export class MeshRenderGeometry implements RenderGeometry {
    public readonly renderGeometryType = "mesh" as const;
    public readonly isInstanceable: boolean;
    public readonly data: MeshData;
    public readonly surface?: SurfaceGeometry;
    public readonly segmentEdges?: EdgeGeometry;
    public readonly silhouetteEdges?: SilhouetteEdgeGeometry;
    public readonly polylineEdges?: PolylineEdgeGeometry;
    public readonly indexedEdges?: IndexedEdgeGeometry;
    public readonly range: Range3d;
    public readonly group: THREE.Group = new THREE.Group();
    private _isDisposed = false;

    private constructor(data: MeshData, params: MeshParams) {
        this.data = data;
        this.isInstanceable = data.viewIndependentOrigin === undefined;
        this.range = params.vertices.qparams.computeRange();

        // Create the surface geometry
        this.surface = SurfaceGeometry.create(data, params);
        if (this.surface) {
            const surfaceMesh = this.surface.createMesh(); // added parentheses
            if (surfaceMesh) this.group.add(surfaceMesh);
        }

        // Create the edge geometries
        const edges = params.edges;
        if (edges) {
            // Silhouette edges
            if (edges.silhouettes) {
                this.silhouetteEdges = SilhouetteEdgeGeometry.createSilhouettes(
                    data,
                    edges.silhouettes
                );
                const silhouetteMesh = this.silhouetteEdges.createMesh(); // added parentheses
                if (silhouetteMesh) this.group.add(silhouetteMesh);
            }

            // Segment edges
            if (edges.segments) {
                this.segmentEdges = EdgeGeometry.create(data, edges.segments);
                const segmentMesh = this.segmentEdges?.createMesh(); // added parentheses
                if (segmentMesh) this.group.add(segmentMesh);
            }

            // Polyline edges
            if (edges.polylines) {
                this.polylineEdges = PolylineEdgeGeometry.create(data, edges.polylines);
                const polylineMesh = this.polylineEdges?.createMesh(); // added parentheses
                if (polylineMesh) this.group.add(polylineMesh);
            }

            // Indexed edges
            if (edges.indexed) {
                this.indexedEdges = IndexedEdgeGeometry.create(edges.indexed);
                const indexedMesh = this.indexedEdges?.createMesh(); // added parentheses
                if (indexedMesh) this.group.add(indexedMesh);
            }
        }
    }

    /**
     * Creates a MeshRenderGeometry instance
     */
    public static create(
        params: MeshParams,
        viewIndependentOrigin?: Point3d
    ): MeshRenderGeometry | undefined {
        const data = MeshData.create(params, viewIndependentOrigin);
        return data ? new this(data, params) : undefined;
    }

    /**
     * Releases resources
     */
    public dispose() {
        if (this._isDisposed) return;

        // Dispose of all geometry resources
        this.data.dispose();
        this.surface?.dispose();
        this.segmentEdges?.dispose();
        this.silhouetteEdges?.dispose();
        this.polylineEdges?.dispose();
        this.indexedEdges?.dispose();

        // Dispose of the Three.js objects
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else if (child.material) {
                    child.material.dispose();
                }
            }
            this.group.remove(child);
        }

        this._isDisposed = true;
    }

    /**
     * Checks whether this instance has been disposed
     */
    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    /**
     * Computes the bounding range
     */
    public computeRange(out?: Range3d): Range3d {
        return this.range.clone(out);
    }

    /**
     * Gets the Three.js scene object
     */
    public get threeObject(): THREE.Object3D {
        return this.group;
    }

    /**
     * Sets visibility
     */
    public setVisible(visible: boolean) {
        this.group.visible = visible;
    }

    /**
     * Sets the position
     */
    public setPosition(position: Point3d) {
        this.group.position.set(position.x, position.y, position.z);
    }

    /**
     * Sets the rotation
     */
    public setRotation(rotation: { x: number; y: number; z: number }) {
        this.group.rotation.set(rotation.x, rotation.y, rotation.z);
    }

    /**
     * Sets the scale
     */
    public setScale(scale: number) {
        this.group.scale.set(scale, scale, scale);
    }
}
