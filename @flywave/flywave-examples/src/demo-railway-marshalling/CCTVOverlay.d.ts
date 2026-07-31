export class CCTVOverlay {
    constructor(name: any);
    m_worldPos: THREE.Vector3;
    m_visible: boolean;
    m_popoverVisible: boolean;
    m_div: HTMLDivElement;
    m_popover: Element;
    m_video: HTMLVideoElement;
    init(dataSource: any, modelUrl: any, position: any, euler: any): Promise<void>;
    update(camera: any): void;
    togglePopover(): void;
    openPopover(): void;
    closePopover(): void;
    dispose(): void;
}
import * as THREE from "three/webgpu";
