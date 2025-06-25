import { Group, Matrix4, Raycaster, Intersection } from "three";
import { TilesRenderer } from "./TilesRenderer";

const tempMat = new Matrix4();

export class TilesGroup extends Group {
    public tilesRenderer: TilesRenderer;

    constructor(tilesRenderer: TilesRenderer) {
        super();
        this.name = "TilesRenderer.TilesGroup";
        this.tilesRenderer = tilesRenderer;
    }

    raycast(raycaster: Raycaster, intersects: Intersection[]): void {
        if (this.tilesRenderer.optimizeRaycast) {
            this.tilesRenderer.raycast(raycaster, intersects);
        } else {
            super.raycast(raycaster, intersects);
        }
    }

    updateMatrixWorld(force?: boolean): void {
        if (this.matrixAutoUpdate) {
            this.updateMatrix();
        }

        if (this.matrixWorldNeedsUpdate || force) {
            if (this.parent === null) {
                tempMat.copy(this.matrix);
            } else {
                tempMat.multiplyMatrices(this.parent.matrixWorld, this.matrix);
            }

            this.matrixWorldNeedsUpdate = false;

            const elA = tempMat.elements;
            const elB = this.matrixWorld.elements;
            let isDifferent = false;

            for (let i = 0; i < 16; i++) {
                const itemA = elA[i];
                const itemB = elB[i];
                const diff = Math.abs(itemA - itemB);

                if (diff > Number.EPSILON) {
                    isDifferent = true;
                    break;
                }
            }

            if (isDifferent) {
                this.matrixWorld.copy(tempMat);

                const children = this.children;
                for (let i = 0, l = children.length; i < l; i++) {
                    children[i].updateMatrixWorld();
                }
            }
        }
    }
}
