import * as THREE from "three";
import { Feature, GeoCoordinates } from "@flywave/flywave.gl";
import * as turf from "@turf/turf";
import type { Polygon as TurfPolygon, Position } from "@turf/turf";

interface Projection {
    projectPoint(coord: GeoCoordinates, target?: THREE.Vector3): THREE.Vector3;
}

export class PolygonMesh extends THREE.Mesh {
    private feature: Feature;
    private projection: Projection;

    constructor(feature: Feature, projection: Projection, material: THREE.Material) {
        const geometry = new THREE.BufferGeometry();
        super(geometry, material);

        this.feature = feature;
        this.projection = projection;

        this.updateGeometry();

        this.renderOrder= Number.MAX_SAFE_INTEGER;
    }

    updateFeature(feature: Feature): void {
        this.feature = feature;
        this.updateGeometry();
    }

    getFeature(): Feature {
        return this.feature;
    }
 
    private updateGeometry(): void {
        // Clean up old geometry
        if (this.geometry) {
            this.geometry.dispose();
        }

        const centroid = turf.centroid(this.feature as any);
        const { geometry: { coordinates } } = centroid;
        this.anchor = new GeoCoordinates(coordinates[1], coordinates[0], 0);

        const position = this.projection.projectPoint(this.anchor as GeoCoordinates, new THREE.Vector3());
        const { geometry: { coordinates: featureCoordinates } } = this.feature as { geometry: TurfPolygon };

        // Process polygon coordinates (may contain holes, we only take the outer ring)
        const outLine = featureCoordinates[0] as Position[];

        // Generate vertices
        const vertices: THREE.Vector3[] = outLine.map((coord: Position) => {
            const geoCoord = new GeoCoordinates(coord[1], coord[0], coord[2] || 0);
            return this.projection.projectPoint(geoCoord, new THREE.Vector3()).sub(position);
        });

        // Triangulation
        const indices = THREE.ShapeUtils.triangulateShape(vertices, []);
        const uindices = new Uint16Array(indices.length * 3);

        for (let i = 0, j = 0; i < indices.length; i++, j += 3) {
            uindices[j] = indices[i][0];
            uindices[j + 1] = indices[i][1];
            uindices[j + 2] = indices[i][2];
        }

        // Coordinate transformation
        const mat = new THREE.Object3D();
        mat.lookAt(position);
        mat.updateMatrixWorld();
        const invert = mat.matrixWorld.clone().invert();

        // Create vertex buffer
        const positionBuffer: number[] = [];
        const box = new THREE.Box3();

        for (let i = 0; i < vertices.length; i++) {
            const vertex = vertices[i].clone().applyMatrix4(invert);
            positionBuffer.push(vertex.x, vertex.y, vertex.z);
            box.expandByPoint(vertex);
        }

        // Create UV coordinates
        const uvBuffer: number[] = [];
        const size = box.getSize(new THREE.Vector3());

        for (let i = 0; i < vertices.length; i++) {
            const coord = vertices[i].clone().applyMatrix4(invert).sub(box.min);
            uvBuffer.push(coord.x / size.x, coord.y / size.y);
        }

        // Create new geometry
        const geometry = new THREE.BufferGeometry();

        const positionAttribute = new THREE.BufferAttribute(new Float32Array(positionBuffer), 3);
        const uvAttribute = new THREE.BufferAttribute(new Float32Array(uvBuffer), 2);
        const indexAttribute = new THREE.BufferAttribute(uindices, 1);

        geometry.setIndex(indexAttribute);
        geometry.setAttribute('position', positionAttribute);
        geometry.setAttribute('uv', uvAttribute);

        this.geometry = geometry;
        this.lookAt(position);

        // Save feature data
        this.userData = {
            feature: {
                ...this.feature,
                geometryType: "polygon" as const
            }
        };
    }

    dispose(): void {
        if (this.geometry) {
            this.geometry.dispose();
        }
        if (this.material) {
            if (Array.isArray(this.material)) {
                this.material.forEach(material => material.dispose());
            } else {
                this.material.dispose();
            }
        }
    }
}
 