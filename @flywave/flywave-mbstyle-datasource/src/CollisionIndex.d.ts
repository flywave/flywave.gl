export interface CollisionBox {
    x: number;
    y: number;
    w: number;
    h: number;
    featureId: string | number;
    allowOverlap: boolean;
    priority: number;
}
export declare class CollisionIndex {
    private m_grid;
    private m_allBoxes;
    reset(): void;
    insert(box: CollisionBox): void;
    canPlace(x: number, y: number, w: number, h: number, allowOverlap: boolean, priority: number): boolean;
    private intersects;
    private getCells;
    get placedCount(): number;
}
//# sourceMappingURL=CollisionIndex.d.ts.map