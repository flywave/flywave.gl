import {
    DataSource,
    DataSourceOptions,
    MapView,
    TileKey,
    Tile,
    TilingScheme,
    quadTreeSubdivisionScheme,
    webMercatorProjection
} from "@flywave/flywave.gl";
import * as THREE from "three";

export interface ModelDisplayDataSourceOptions extends DataSourceOptions {}

export class ModelDisplayDataSource extends DataSource {
    private readonly m_tilingScheme: TilingScheme;
    private readonly m_sceneRoot: THREE.Group;
    private readonly m_objects: Map<string, THREE.Object3D> = new Map();

    constructor(options: ModelDisplayDataSourceOptions = {}) {
        super({ ...options, maxDataLevel: 0 });
        this.m_tilingScheme = new TilingScheme(quadTreeSubdivisionScheme, webMercatorProjection);
        this.m_sceneRoot = new THREE.Group();
    }

    onWillTouchTiled(): void {
        this.m_sceneRoot.position.copy(this.mapView.camera.position).negate();
    }

    addObject(id: string, object: THREE.Object3D): void {
        this.m_objects.set(id, object);
        this.m_sceneRoot.add(object);
    }

    removeObject(id: string): void {
        const obj = this.m_objects.get(id);
        if (obj) {
            this.m_sceneRoot.remove(obj);
            this.m_objects.delete(id);
        }
    }

    getObject(id: string): THREE.Object3D | undefined {
        return this.m_objects.get(id);
    }

    getTilingScheme(): TilingScheme {
        return this.m_tilingScheme;
    }

    getTile(tileKey: TileKey): Tile | undefined {
        return new ModelDisplayTile(tileKey, this);
    }

    async connect(): Promise<void> {}

    attach(mapView: MapView): void {
        super.attach(mapView);
        mapView.scene.add(this.m_sceneRoot);
    }

    detach(mapView: MapView): void {
        mapView.scene.remove(this.m_sceneRoot);
        super.detach(mapView);
    }

    updateSceneRoot(): void {
        this.m_sceneRoot.position.copy(this.mapView.camera.position).negate();
    }

    dispose(): void {
        this.m_objects.clear();
        super.dispose();
    }

    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
        this.m_sceneRoot.updateMatrixWorld();
        raycaster.intersectObject(this.m_sceneRoot, true, intersects);
    }

    get sceneRoot(): THREE.Group {
        return this.m_sceneRoot;
    }
}

class ModelDisplayTile extends Tile {
    constructor(tileKey: TileKey, private m_dataSource: ModelDisplayDataSource) {
        super(m_dataSource, tileKey);
    }

    raycast(rayCaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
        this.m_dataSource.raycast(rayCaster, intersects);
    }
}
