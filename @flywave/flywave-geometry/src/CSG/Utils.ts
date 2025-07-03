import * as THREE from "three";

import { createPolygon, flipPolygon, Polygon } from "./Polygon";

export const transform = (
    polygons: readonly Polygon[],
    matrix: THREE.Matrix4
): readonly Polygon[] => {
    return polygons.map(polygon => {
        const transformedVectors = polygon.vectors.map(vector => {
            const vec = vector.clone();
            vec.applyMatrix4(matrix);
            return vec;
        });
        return createPolygon(transformedVectors);
    });
};

export const simpleExtrude = (polygon: Polygon, height: number): readonly Polygon[] => {
    const top = flipPolygon(polygon);

    // Create translation matrix for bottom face
    const translationMatrix = new THREE.Matrix4().makeTranslation(0, 0, height);
    const [bottom] = transform([polygon], translationMatrix);

    // Create walls
    const walls = top.vectors.reduce((acc, _, idx) => {
        const nextIdx = (idx + 1) % top.vectors.length; // Cyclical next
        return [
            ...acc,
            createPolygon([
                bottom.vectors[bottom.vectors.length - 1 - idx], // Reverse order for bottom face
                bottom.vectors[bottom.vectors.length - 1 - nextIdx],
                top.vectors[nextIdx],
                top.vectors[idx]
            ])
        ];
    }, [] as Polygon[]);

    return [top, ...walls, bottom];
};
