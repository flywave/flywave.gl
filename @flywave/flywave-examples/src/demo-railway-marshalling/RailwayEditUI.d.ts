export class RailwayEditUI {
    constructor(mapView: any, mapControls: any, geojson: any);
    m_visible: boolean;
    m_draw: any;
    m_panel: HTMLDivElement;
    m_textarea: Element;
    exportWithOriginalProps(): {
        type: string;
        features: any;
    };
    updateModeIndicator(label: any): void;
    buildHTML(): string;
}
