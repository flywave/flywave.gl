declare class ComprehensiveMapApp {
    private mapView;
    private canvas;
    private gui;
    private featuresDataSource;
    private animatedObjects;
    private clock;
    constructor();
    private initialize;
    private getMapCanvas;
    private initializeMapView;
    private initializeMapControls;
    private configureDEMTerrainSource;
    private createFeaturesDataSource;
    private addBackgroundDataSource;
    private createGlowingObject;
    private createPulsingGlow;
    private createRotatingGlowGroup;
    private createBuildingStructure;
    private createFloatingParticles;
    private addGlowingObjects;
    private addDataMarkers;
    private initializeGUI;
    private startAnimationLoop;
    dispose(): void;
}
declare const app: ComprehensiveMapApp;
export default app;
