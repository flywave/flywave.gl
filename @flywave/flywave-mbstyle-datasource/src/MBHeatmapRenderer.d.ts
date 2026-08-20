import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';
import { MBStyleDataSource } from './MBStyleDataSource';
interface HeatmapKernel {
    x: number;
    y: number;
    z: number;
    weight: number;
    radius: number;
    technique: number;
    radiusExpr?: any;
    properties?: Record<string, any>;
}
interface HeatmapLayerGroup {
    layerId: string;
    renderOrder: number;
    intensity: number;
    opacity: number;
    rampKey: string;
    ramp: THREE.Texture;
    raw: HeatmapKernel[];
    px: number[];
    bx: number[];
    by: number[];
    s: number[];
    py: number[];
    half: number[];
    radiusPx: number[];
    weight: number[];
}
export declare class MBHeatmapRenderer {
    private m_mapView;
    private m_dataSource;
    private m_rt;
    private m_rtW;
    private m_rtH;
    private readonly m_rtScale;
    private m_rtHalfFloat;
    private m_scene;
    private m_camera;
    private m_kernelGeo;
    private m_kernelMat;
    private m_kernelMesh;
    private m_compScene;
    private m_compMat;
    private m_compMesh;
    private m_rampCache;
    private m_kernelAllocated;
    private m_tileKernels;
    private m_v3;
    constructor(m_mapView: MapView, m_dataSource: MBStyleDataSource);
    run(): void;
    dispose(): void;
    static buildGroups(tileKernels: Array<{
        kernels: HeatmapKernel[];
        techniques: any[];
    }>, getRamp: (stops: any) => {
        texture: THREE.Texture;
        key: string;
    }): Map<string, HeatmapLayerGroup>;
    private ensureRenderTarget;
    private ensureKernelGeometry;
    private updateKernelGeometry;
    private ensureCompositeMesh;
}
export {};
//# sourceMappingURL=MBHeatmapRenderer.d.ts.map