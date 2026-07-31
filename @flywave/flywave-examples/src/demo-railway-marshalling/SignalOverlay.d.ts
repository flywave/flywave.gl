export class SignalOverlay {
    constructor(m_sim: any, dataSource: any, signalId: any);
    m_sim: any;
    m_worldPos: THREE.Vector3;
    m_visible: boolean;
    m_div: HTMLDivElement;
    show(): void;
    hide(): void;
    update(camera: any): void;
    dispose(): void;
}
import * as THREE from "three/webgpu";
