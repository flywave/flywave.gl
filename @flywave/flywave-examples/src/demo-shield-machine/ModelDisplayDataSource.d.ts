export class ModelDisplayDataSource {
    constructor(options?: {});
    m_objects: Map<any, any>;
    enablePicking: boolean;
    m_tilingScheme: any;
    m_sceneRoot: THREE.Group<THREE.Object3DEventMap>;
    onWillTouchTiled(): void;
    addObject(id: any, object: any): void;
    removeObject(id: any): void;
    getObject(id: any): any;
    getTilingScheme(): any;
    getTile(tileKey: any): ModelDisplayTile;
    connect(): Promise<void>;
    attach(mapView: any): void;
    detach(mapView: any): void;
    updateSceneRoot(): void;
    dispose(): void;
    raycast(raycaster: any, intersects: any): void;
    get sceneRoot(): THREE.Group<THREE.Object3DEventMap>;
}
import * as THREE from "three/webgpu";
declare class ModelDisplayTile {
    constructor(tileKey: any, m_dataSource: any);
    m_dataSource: any;
    raycast(rayCaster: any, intersects: any): void;
}
export {};
