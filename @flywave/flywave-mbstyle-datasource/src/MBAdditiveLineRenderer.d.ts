import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';
import type { MBStyleDataSource } from './MBStyleDataSource';
export interface AdditiveRibbon {
    mesh: THREE.Mesh;
    technique: any;
}
export declare const additiveRibbons: AdditiveRibbon[];
export declare class MBAdditiveLineRenderer {
    private m_mapView;
    private m_dataSource;
    private m_rt;
    private m_rtW;
    private m_rtH;
    private m_rtHalfFloat;
    private m_scene;
    private m_compScene;
    private m_camera;
    private m_compMat;
    private m_tmpMeshes;
    private m_cloneSet;
    private m_autoDensity;
    private m_framesSinceReadback;
    constructor(m_mapView: MapView, m_dataSource: MBStyleDataSource);
    run(): void;
    dispose(): void;
    private groupRibbons;
    private getAccumMaterial;
    private ensureRenderTarget;
    private ensureCompositeMesh;
    private readbackMeanDensity;
    private static parseColor;
}
//# sourceMappingURL=MBAdditiveLineRenderer.d.ts.map