import { Color, ShaderMaterial, Vector3, Texture, Matrix4, BufferGeometry, Camera, Group, Scene, WebGLRenderer } from 'three';
import { Object3D } from 'three/src/Three.Core';
interface WaterMaterialOptions {
    alpha?: number;
    speed?: number;
    sunDirection?: Vector3;
    sunColor?: number | string | Color;
    waterColor?: number | string | Color;
    distortionScale?: number;
    fog?: boolean;
    normalMap?: Texture | string;
}
declare class WaterMaterial extends ShaderMaterial {
    private _time;
    private _speed;
    private _lastUpdateTime;
    constructor(options?: WaterMaterialOptions);
    private updateTime;
    onBeforeRender(renderer: WebGLRenderer, scene: Scene, camera: Camera, geometry: BufferGeometry, object: Object3D, group: Group): void;
    setMirrorSampler(texture: Texture): void;
    setCameraPosition(position: Vector3): void;
    setTextureMatrix(matrix: Matrix4): void;
    get time(): number;
    set time(value: number);
    get speed(): number;
    set speed(value: number);
    get alpha(): number;
    set alpha(value: number);
    get distortionScale(): number;
    set distortionScale(value: number);
    get sunDirection(): Vector3;
    set sunDirection(value: Vector3);
    get sunColor(): Color;
    set sunColor(value: Color);
    get waterColor(): Color;
    set waterColor(value: Color);
    dispose(): void;
}
export { WaterMaterial, WaterMaterialOptions };
