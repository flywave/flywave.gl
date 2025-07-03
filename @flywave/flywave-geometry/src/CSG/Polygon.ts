import { flipPlane, fromVectors, Plane, PlaneEpsilon } from "@flywave/flywave-geoutils";
import * as THREE from "three";

export interface Polygon {
    readonly vectors: readonly THREE.Vector3[];
    readonly plane: Plane;
}

export const createPolygon = (vectors: readonly THREE.Vector3[]): Polygon => ({
    vectors,
    plane: fromVectors(vectors)
});

export const flipPolygon = (polygon: Polygon): Polygon => ({
    vectors: [...polygon.vectors].reverse(),
    plane: flipPlane(polygon.plane)
});

const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

export const splitType = (
    plane: Plane,
    polygon: Polygon
): { readonly types: readonly number[]; readonly polygonType: number } =>
    polygon.vectors.reduce(
        (acc, vector) => {
            const t = plane.normal.dot(vector) - plane.w;
            const type = t < -PlaneEpsilon ? BACK : t > PlaneEpsilon ? FRONT : COPLANAR;
            return {
                polygonType: acc.polygonType | type,
                types: [...acc.types, type]
            };
        },
        {
            types: [] as number[],
            polygonType: 0
        }
    );

const splitCoplanar = (plane: Plane, polygon: Polygon): ReadonlyArray<readonly Polygon[]> => {
    const d = plane.normal.dot(polygon.plane.normal);
    return d > 0 ? [[polygon], [], [], []] : [[], [polygon], [], []];
};

const splitSpanning = (
    plane: Plane,
    polygon: Polygon,
    types: readonly number[]
): ReadonlyArray<readonly Polygon[]> => {
    const { f, b } = polygon.vectors.reduce(
        (acc, vector, idx) => {
            const nextIdx = (idx + 1) % polygon.vectors.length; // Cyclical next
            const nextVector = polygon.vectors[nextIdx];
            const span = (types[idx] | types[nextIdx]) === SPANNING;

            const newF = types[idx] !== BACK ? [...acc.f, vector] : acc.f;
            const newB = types[idx] !== FRONT ? [...acc.b, vector] : acc.b;

            if (span) {
                const direction = new THREE.Vector3().subVectors(nextVector, vector);
                const t = (plane.w - plane.normal.dot(vector)) / plane.normal.dot(direction);
                const v = new THREE.Vector3().lerpVectors(vector, nextVector, t);
                return { f: [...newF, v], b: [...newB, v] };
            }
            return { f: newF, b: newB };
        },
        { f: [] as THREE.Vector3[], b: [] as THREE.Vector3[] }
    );
    return [
        [],
        [],
        f.length >= 3 ? [createPolygon(f)] : [],
        b.length >= 3 ? [createPolygon(b)] : []
    ];
};

export const splitPolygonByPlane = (
    plane: Plane,
    polygon: Polygon
): ReadonlyArray<readonly Polygon[]> => {
    const { types, polygonType } = splitType(plane, polygon);
    return polygonType === COPLANAR
        ? splitCoplanar(plane, polygon)
        : polygonType === FRONT
        ? [[], [], [polygon], []]
        : polygonType === BACK
        ? [[], [], [], [polygon]]
        : splitSpanning(plane, polygon, types);
};

/**
 * Convert a Polygon to a THREE.BufferGeometry
 */
export const polygonToGeometry = (polygon: Polygon): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();

    // Create vertices array
    const vertices = polygon.vectors.flatMap(v => [v.x, v.y, v.z]);

    // Create indices for triangulation (simple fan triangulation)
    const indices = [];
    for (let i = 1; i < polygon.vectors.length - 1; i++) {
        indices.push(0, i, i + 1);
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
};

/**
 * Convert a THREE.BufferGeometry to an array of Polygons
 */
export const geometryToPolygons = (geometry: THREE.BufferGeometry): Polygon[] => {
    const polygons: Polygon[] = [];
    const positionAttribute = geometry.getAttribute("position");
    const indexAttribute = geometry.index;

    if (indexAttribute) {
        // Indexed geometry
        for (let i = 0; i < indexAttribute.count; i += 3) {
            const vectors = [
                new THREE.Vector3().fromBufferAttribute(positionAttribute, indexAttribute.getX(i)),
                new THREE.Vector3().fromBufferAttribute(
                    positionAttribute,
                    indexAttribute.getX(i + 1)
                ),
                new THREE.Vector3().fromBufferAttribute(
                    positionAttribute,
                    indexAttribute.getX(i + 2)
                )
            ];
            polygons.push(createPolygon(vectors));
        }
    } else {
        // Non-indexed geometry
        for (let i = 0; i < positionAttribute.count; i += 3) {
            const vectors = [
                new THREE.Vector3().fromBufferAttribute(positionAttribute, i),
                new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 1),
                new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 2)
            ];
            polygons.push(createPolygon(vectors));
        }
    }

    return polygons;
};

/**
 * Convert a Polygon to a THREE.Mesh with optional material
 */
export const polygonToMesh = (polygon: Polygon, material?: THREE.Material): THREE.Mesh => {
    const geometry = polygonToGeometry(polygon);
    return new THREE.Mesh(
        geometry,
        material || new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
    );
};

/**
 * Convert a THREE.Mesh to an array of Polygons
 */
export const meshToPolygons = (mesh: THREE.Mesh): Polygon[] => {
    if (!mesh.geometry) return [];
    return geometryToPolygons(mesh.geometry);
};
