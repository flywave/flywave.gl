import * as THREE from "three";
import { GeoCoordinates, GeoBox } from "@flywave/flywave-geoutils";

class HeightMapShader extends THREE.RawShaderMaterial {
    constructor() {
        super({
            side: THREE.DoubleSide,
            vertexShader: `
                attribute vec3 position; 
                varying float vheight;
                uniform mat4 projectionMatrix; 
                uniform mat4 modelViewMatrix; 

                void main() {  
                    gl_Position = projectionMatrix *modelViewMatrix* vec4(vec3(position.xy,0.0), 1.0);
                    vheight = position.z;
                }
            `,
            fragmentShader: `
                precision highp float;
                precision highp int;
                varying float vheight;
                vec4 encodeElevation(float h) {    
                    float UNPACK_MAPBOX[4];
                    UNPACK_MAPBOX[0]=6553.6;
                    UNPACK_MAPBOX[1]=25.6;
                    UNPACK_MAPBOX[2]=0.1;
                    UNPACK_MAPBOX[3]=10000.0;
                    
                    float val = (h + UNPACK_MAPBOX[3]) / UNPACK_MAPBOX[2];
                    float r = floor(floor(val/256.0)/256.0)/256.0 - floor(floor(floor(val/256.0)/256.0)/256.0);
                    float g = (floor(val/256.0)/256.0 -floor(floor(val/256.0)/256.0));
                    float b = (val/256.0 - floor(val/256.0));
                    return vec4(r,g,b,1.0);
                }
                void main() { 
                    gl_FragColor = encodeElevation(vheight); 
                }
            `
        });
    }
}

const WIDTH = 256;
const HEIGHT = 256;
var renderer;
var webglRenderTarget = new THREE.WebGLRenderTarget(WIDTH, HEIGHT);
var shader = new HeightMapShader();
var geometry = new THREE.BufferGeometry();

export function getOffScreenCanvas() {
    let offScreenCanvas = document.createElement("canvas");
    document.body.appendChild(offScreenCanvas);
    offScreenCanvas.width = WIDTH;
    offScreenCanvas.height = HEIGHT;
    let offScreenCanvasContext = offScreenCanvas.transferControlToOffscreen();
    return offScreenCanvasContext;
}

export default function renderHeightMap(canvas, extents, positions, indeic) {
    if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
        renderer.setSize(WIDTH, HEIGHT, false);
    }

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

    for (let i = 0; i < positions.length; i += 3) {
        positions[i] -= geobox.center.longitude;
        positions[i + 1] -= geobox.center.latitude;
    }
    //buildGeometry
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indeic), 1));
    var buffer = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

    //build camera
    let w = geobox.longitudeSpan,
        h = geobox.latitudeSpan;
    var camera = new THREE.OrthographicCamera(w / 2, -w / 2, h / 2, -h / 2, 0.001, 10);
    camera.position.z = 1.5;
    camera.lookAt(new THREE.Vector3());

    let scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, shader));
    // renderer.setRenderTarget(webglRenderTarget);
    renderer.clear();
    renderer.render(scene, camera);
    geometry.dispose();
    // renderer.readRenderTargetPixels(webglRenderTarget, 0, 0, WIDTH, HEIGHT, buffer);

    return buffer;
}
