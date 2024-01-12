import * as THREE from "three";
import { GeoCoordinates, GeoBox } from "@flywave/flywave-geoutils";
import { warnOnce, clamp } from "../../../util/util.js";
import { number as interpolate } from "../../height-map/util/interpolate";
import { Vector2 } from "three";

class HeightMapShader extends THREE.RawShaderMaterial {
    constructor() {
        super({
            uniforms: {
                minMaxAltitude: { value: new Vector2(0, 0) }
            },
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
export function getOffScreenCanvas() {
    let offScreenCanvas = document.createElement("canvas");
    // document.body.appendChild(offScreenCanvas);
    offScreenCanvas.width = WIDTH;
    offScreenCanvas.height = HEIGHT;
    let offScreenCanvasContext = offScreenCanvas.transferControlToOffscreen();
    offScreenCanvasContext.id = THREE.MathUtils.generateUUID();
    return offScreenCanvasContext;
}

class OffScreenCanvasManagerRender {
    renderers = {};

    addOffScreenCanvas(offScreenCanvasId, offScreenCanvas) {
        var renderer = new THREE.WebGLRenderer({ antialias: true, canvas: offScreenCanvas });
        renderer.setSize(WIDTH, HEIGHT, false);
        this.renderers[offScreenCanvasId] = renderer;
    }

    getRenderer(offScreenCanvasId) {
        return this.renderers[offScreenCanvasId];
    }
}

var offScreenCanvasManagerRender = new OffScreenCanvasManagerRender();

export { offScreenCanvasManagerRender };

export function initlizeCanvas(canvas) {
    if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
        renderer.setSize(WIDTH, HEIGHT, false);
    }
}

export default function renderHeightMap(offScreenCanvasId, extents, positions, indeic) {
    let renderer = offScreenCanvasManagerRender.getRenderer(offScreenCanvasId);

    var shader = new HeightMapShader();
    var geometry = new THREE.BufferGeometry();

    var webglRenderTarget = new THREE.WebGLRenderTarget(WIDTH, HEIGHT);
    const [minLongitude, minLatitude, minAltitude, maxLongitude, maxLatitude, maxAltitude] =
        extents;
    let geobox = GeoBox.fromCoordinates(
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

    let _positions = new Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
        _positions[i] = positions[i] - geobox.center.longitude;
        _positions[i + 1] = positions[i + 1] - geobox.center.latitude;
        _positions[i + 2] = positions[i + 2];
    }
    //buildGeometry
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(_positions), 3));
    indeic && geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indeic), 1));
    var buffer = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

    //build camera
    let w = geobox.longitudeSpan,
        h = geobox.latitudeSpan;
    var camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.001, 10000);
    camera.position.z = maxAltitude * 2;

    let scene = new THREE.Scene();
    let m = new THREE.Mesh(geometry, shader);
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

var _vec1 = new THREE.Vector4();
var _vec2 = new THREE.Vector4(
    1.0 / (256.0 * 256.0 * 256.0),
    1.0 / (256.0 * 256.0),
    1.0 / 256.0,
    1.0
);

export class HeightMap {
    constructor(buffer, minimumHeight, maximumHeight) {
        this.buffer = buffer;
        this.minimumHeight = minimumHeight;
        this.maximumHeight = maximumHeight;
    }

    getByScale(x, y) {
        x = x * WIDTH;
        y = y * HEIGHT;
        let i = Math.floor(x);
        let j = Math.floor(y);
        return interpolate(
            interpolate(this.get(i, j), this.get(i, j + 1), y - j),
            interpolate(this.get(i + 1, j), this.get(i + 1, j + 1), y - j),
            x - i
        );
    }

    get(x, y, clampToEdge) {
        const pixels = this.buffer;
        if (!pixels) return 0;
        if (clampToEdge) {
            x = clamp(x, -1, WIDTH);
            y = clamp(y, -1, HEIGHT);
        }
        const index = this._idx(x, y) * 4;
        return this.unpack(pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]);
    }

    _idx(x, y) {
        if (x < -1 || x >= WIDTH + 1 || y < -1 || y >= HEIGHT + 1)
            throw "out of range source coordinates for DEM data";
        return (y + 1) * HEIGHT + (x + 1);
    }

    unpack(r, g, b, a) {
        var v =
            this.minimumHeight +
            _vec1.set(r / 255, g / 255, b / 255, a / 255).dot(_vec2) *
                (this.maximumHeight - this.minimumHeight);
        return v;
    }
}
