import { OrientedBox3 } from "@flywave/flywave-geoutils";
import * as THREE from "three";

/**
 * A Three.js Object3D that visualizes an OrientedBox3 in the scene.
 */
export class OrientedBox3Visualizer extends THREE.Object3D {
    private readonly boxMesh: THREE.Mesh;
    private readonly edges: THREE.LineSegments;
    private readonly boxGeometry: THREE.BoxGeometry;
    private readonly boxMaterial: THREE.MeshBasicMaterial;
    private readonly edgeMaterial: THREE.LineBasicMaterial;

    updateMatrixWorld(force: boolean = false) {
        if (this.matrixAutoUpdate) this.updateMatrix();

        if (this.matrixWorldNeedsUpdate || force) {
            if (this.parent === null) {
                this.matrixWorld.copy(this.matrix);
            } else {
                // 只继承父级的位置，忽略旋转和缩放
                const parentPosition = new THREE.Vector3();
                this.parent.getWorldPosition(parentPosition);

                // 创建只包含位置的矩阵
                const positionMatrix = new THREE.Matrix4().makeTranslation(
                    parentPosition.x,
                    parentPosition.y,
                    parentPosition.z
                );

                // 应用本地变换
                this.matrixWorld.multiplyMatrices(positionMatrix, this.matrix);
            }

            this.matrixWorldNeedsUpdate = false;
            force = true;
        }

        // 更新子对象
        for (let i = 0, l = this.children.length; i < l; i++) {
            this.children[i].updateMatrixWorld(force);
        }
    }

    /**
     * Creates a visualizer for an OrientedBox3.
     * @param orientedBox The OrientedBox3 to visualize (optional, can be set later)
     * @param color The color of the box (default: 0xffff00)
     * @param opacity The opacity of the box (default: 0.5)
     */
    constructor(
        orientedBox?: OrientedBox3,
        color: THREE.ColorRepresentation = 0xffff00,
        opacity: number = 0.5
    ) {
        super();

        // Create materials
        this.boxMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide
        });

        this.edgeMaterial = new THREE.LineBasicMaterial({
            color: color,
            linewidth: 2
        });

        // Create geometry (will be scaled/rotated/positioned later)
        this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);

        // Create mesh
        this.boxMesh = new THREE.Mesh(this.boxGeometry, this.boxMaterial);

        // Create edges
        const edgesGeometry = new THREE.EdgesGeometry(this.boxGeometry);
        this.edges = new THREE.LineSegments(edgesGeometry, this.edgeMaterial);

        // Add both to this object
        this.add(this.boxMesh);
        this.add(this.edges);

        // Initialize with box if provided
        if (orientedBox) {
            this.update(orientedBox);
        }
    }

    /**
     * Updates the visualizer to match the given OrientedBox3.
     * @param orientedBox The OrientedBox3 to visualize
     */
    update(orientedBox: OrientedBox3): void {
        // Set position
        this.position.copy(orientedBox.position);

        // Set rotation (using the orientation matrix)
        const rotationMatrix = new THREE.Matrix4();
        orientedBox.getRotationMatrix(rotationMatrix);
        this.setRotationFromMatrix(rotationMatrix);

        // Set scale (extents are half-sizes, so multiply by 2)
        const size = orientedBox.getSize();
        this.scale.set(size.x, size.y, size.z);

        // Update the edges geometry if needed
        this.boxGeometry.computeBoundingBox();
        this.boxGeometry.computeBoundingSphere();

        // Dispose old edges geometry and create new one
        this.edges.geometry.dispose();
        const newEdgesGeometry = new THREE.EdgesGeometry(this.boxGeometry);
        this.edges.geometry = newEdgesGeometry;
    }

    /**
     * Sets the color of both the box and its edges.
     * @param color The new color
     */
    setColor(color: THREE.ColorRepresentation): void {
        this.boxMaterial.color.set(color);
        this.edgeMaterial.color.set(color);
    }

    /**
     * Sets the opacity of the box (edges remain fully opaque).
     * @param opacity The new opacity (0-1)
     */
    setOpacity(opacity: number): void {
        this.boxMaterial.opacity = opacity;
    }

    /**
     * Disposes of the visualizer's resources.
     */
    dispose(): void {
        this.boxGeometry.dispose();
        this.boxMaterial.dispose();
        this.edges.geometry.dispose();
        this.edgeMaterial.dispose();
    }
}
