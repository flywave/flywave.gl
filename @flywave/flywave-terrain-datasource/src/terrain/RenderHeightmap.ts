import { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";
import { clamp, number as interpolate } from "@flywave/flywave-utils";
import * as THREE from "three";
import {
    BufferGeometry,
    Mesh,
    OrthographicCamera,
    RawShaderMaterial,
    Scene,
    Vector2,
    Vector4,
    WebGLRenderer,
    WebGLRenderTarget
} from "three";

interface HeightMapShaderUniforms {
    [uniform: string]: THREE.IUniform<any>;
}

class HeightMapShader extends RawShaderMaterial {
    constructor() {
        super({
            uniforms: {
                minMaxAltitude: { value: new Vector2(0, 0) }
            } as HeightMapShaderUniforms,
            side: THREE.DoubleSide,
            vertexShader: `
                precision highp float;
                precision highp int;
                attribute vec3 position; 
                varying float vheight;
                uniform mat4 projectionMatrix; 
                uniform mat4 modelViewMatrix; 

                void main() {  
                    gl_Position = projectionMatrix *modelViewMatrix* vec4(position.xyz, 1.0);
                    vheight = position.z;
                }
            `,
            fragmentShader: `
                precision highp float;
                precision highp int;
                varying float vheight;
                uniform vec2 minMaxAltitude;  

                vec4 packFloatToVec4i(float value) {
                    vec4 bitSh = vec4(256.0*256.0*256.0, 256.0*256.0, 256.0, 1.0);
                    vec4 bitMsk = vec4(0.0, 1.0/256.0, 1.0/256.0, 1.0/256.0);
                    vec4 res = fract(value * bitSh);
                    res -= res.xxyz * bitMsk;
                    return res;
                  } 
                void main() { 
                    gl_FragColor = packFloatToVec4i((vheight-minMaxAltitude.x)/(minMaxAltitude.y-minMaxAltitude.x)); 
                }
            `
        });
    }
}

const WIDTH = 512;
const HEIGHT = 512;

export function getOffScreenCanvas(): OffscreenCanvas {
    const offScreenCanvas = document.createElement("canvas");
    offScreenCanvas.width = WIDTH;
    offScreenCanvas.height = HEIGHT;
    const offScreenCanvasContext = offScreenCanvas.transferControlToOffscreen();
    (offScreenCanvasContext as any).id = THREE.MathUtils.generateUUID();
    return offScreenCanvasContext;
}

interface RenderersMap {
    [key: string]: WebGLRenderer;
}

class OffScreenCanvasManagerRender {
    private renderers: RenderersMap = {};

    addOffScreenCanvas(offScreenCanvasId: string, offScreenCanvas: OffscreenCanvas): void {
        const renderer = new WebGLRenderer({
            antialias: true,
            canvas: offScreenCanvas
        });
        renderer.setSize(WIDTH, HEIGHT, false);
        this.renderers[offScreenCanvasId] = renderer;
    }

    getRenderer(offScreenCanvasId: string): WebGLRenderer {
        return this.renderers[offScreenCanvasId];
    }
}

const offScreenCanvasManagerRender = new OffScreenCanvasManagerRender();
export { offScreenCanvasManagerRender };

let renderer: WebGLRenderer | null = null;

export function initlizeCanvas(canvas: HTMLCanvasElement): void {
    if (!renderer) {
        renderer = new WebGLRenderer({ antialias: true, canvas });
        renderer.setSize(WIDTH, HEIGHT, false);
    }
}

export default function renderHeightMap(
    offScreenCanvasId: string,
    extents: number[],
    positions: number[],
    indeic?: number[] | Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>
): Uint8ClampedArray {
    const renderer = offScreenCanvasManagerRender.getRenderer(offScreenCanvasId);
    const shader = new HeightMapShader();
    const geometry = new BufferGeometry();

    const webglRenderTarget = new WebGLRenderTarget(WIDTH, HEIGHT);
    const [minLongitude, minLatitude, minAltitude, maxLongitude, maxLatitude, maxAltitude] =
        extents;

    const geobox = GeoBox.fromCoordinates(
        new GeoCoordinates(
            (minLatitude * 180) / Math.PI,
            (minLongitude * 180) / Math.PI,
            minAltitude
        ),
        new GeoCoordinates(
            (maxLatitude * 180) / Math.PI,
            (maxLongitude * 180) / Math.PI,
            maxAltitude
        )
    );

    const _positions = new Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
        _positions[i] = positions[i] - geobox.center.longitude;
        _positions[i + 1] = positions[i + 1] - geobox.center.latitude;
        _positions[i + 2] = positions[i + 2];
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(_positions), 3));
    if (indeic) {
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indeic), 1));
    }

    const buffer = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    const w = geobox.longitudeSpan;
    const h = geobox.latitudeSpan;
    const camera = new OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.001, 10000);
    camera.position.z = maxAltitude * 2;

    const scene = new Scene();
    const m = new Mesh(geometry, shader);
    shader.uniforms.minMaxAltitude.value.set(minAltitude, maxAltitude);
    m.frustumCulled = false;
    scene.add(m);

    renderer.setRenderTarget(webglRenderTarget);
    renderer.clear();
    renderer.render(scene, camera);
    geometry.dispose();
    renderer.readRenderTargetPixels(webglRenderTarget, 0, 0, WIDTH, HEIGHT, buffer);

    return buffer;
}

const _vec1 = new Vector4();
const _vec2 = new Vector4(1.0 / (256.0 * 256.0 * 256.0), 1.0 / (256.0 * 256.0), 1.0 / 256.0, 1.0);

export class HeightMap {
    private readonly buffer: Uint8ClampedArray;
    private readonly minimumHeight: number;
    private readonly maximumHeight: number;

    constructor(buffer: Uint8ClampedArray, minimumHeight: number, maximumHeight: number) {
        this.buffer = buffer;
        this.minimumHeight = minimumHeight;
        this.maximumHeight = maximumHeight;
    }

    getByScale(x: number, y: number): number {
        x = x * WIDTH;
        y = y * HEIGHT;
        const i = Math.floor(x);
        const j = Math.floor(y);
        return interpolate(
            interpolate(this.get(i, j), this.get(i, j + 1), y - j),
            interpolate(this.get(i + 1, j), this.get(i + 1, j + 1), y - j),
            x - i
        );
    }

    get(x: number, y: number, clampToEdge: boolean = false): number {
        if (!this.buffer) return 0;
        if (clampToEdge) {
            x = clamp(x, -1, WIDTH);
            y = clamp(y, -1, HEIGHT);
        }
        const index = this._idx(x, y) * 4;
        return this.unpack(
            this.buffer[index],
            this.buffer[index + 1],
            this.buffer[index + 2],
            this.buffer[index + 3]
        );
    }

    private _idx(x: number, y: number): number {
        if (x < -1 || x >= WIDTH + 1 || y < -1 || y >= HEIGHT + 1) {
            throw new Error("out of range source coordinates for DEM data");
        }
        return (y + 1) * HEIGHT + (x + 1);
    }

    private unpack(r: number, g: number, b: number, a: number): number {
        return (
            this.minimumHeight +
            _vec1.set(r / 255, g / 255, b / 255, a / 255).dot(_vec2) *
                (this.maximumHeight - this.minimumHeight)
        );
    }
}
