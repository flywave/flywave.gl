import * as THREE from 'three';
import { MBStyleDataSource } from './MBStyleDataSource';

interface MaterialPatchState {
    patched: boolean;
}

const rasterTextureCache = new Map<string, THREE.Texture>();
const rasterTextureLoader = new THREE.TextureLoader();

export class MBMaterialPatchManager {
    private m_patchedTiles = new WeakMap<object, MaterialPatchState>();
    private m_dataSource: MBStyleDataSource;

    constructor(dataSource: MBStyleDataSource) {
        this.m_dataSource = dataSource;
    }

    patchTileMaterials(): void {
        const ds = this.m_dataSource as any;
        const tileDataSources = ds.m_mapView?.m_tileDataSources as any[];
        if (!tileDataSources) return;

        for (const tds of tileDataSources) {
            if (tds !== this.m_dataSource) continue;
            const tiles = tds.m_tiles as Map<any, any> | undefined;
            if (!tiles) continue;

            for (const tile of tiles.values()) {
                if (!tile.objects || tile.objects.length === 0) continue;
                if (this.m_patchedTiles.has(tile)) continue;

                this.patchTile(tile);
                this.m_patchedTiles.set(tile, { patched: true });
            }
        }
    }

    private patchTile(tile: any): void {
        const decodedTile = tile.decodedTile;
        if (!decodedTile?.techniques) return;

        for (const obj of tile.objects) {
            const tech = obj.userData?.technique;
            if (!tech) continue;

            const material = (obj as any).material as THREE.Material;
            if (!material) continue;

            this.patchMaterial(material, tech);
            this.applyIconTextFit(obj, tech);
        }
    }

    private applyIconTextFit(obj: THREE.Object3D, technique: any): void {
        const textFit = technique._layout?.['icon-text-fit'] ?? technique['icon-text-fit'];
        if (!textFit || textFit === 'none') return;

        const textWidth = (technique._textWidth ?? 5) as number;
        const textHeight = (technique._textHeight ?? 1.2) as number;
        const textSize = (technique._layout?.['text-size'] ?? technique['text-size'] ?? 16) as number;
        const iconSize = (technique._layout?.['icon-size'] ?? technique['icon-size'] ?? 1) as number;
        const padding = technique['icon-text-fit-padding'] as number[] ?? [0, 0, 0, 0];

        const fitW = textWidth * textSize + padding[0] + padding[2];
        const fitH = textHeight * textSize + padding[1] + padding[3];

        if ((obj as any).isSprite) {
            if (textFit === 'width' || textFit === 'both') {
                (obj as any).scale.x = fitW * iconSize;
            }
            if (textFit === 'height' || textFit === 'both') {
                (obj as any).scale.y = fitH * iconSize;
            }
        }
    }

    private patchMaterial(material: THREE.Material, technique: any): void {
        if ((material as any).__mbPatched) return;
        (material as any).__mbPatched = true;

        const techName = technique.name;
        const paint = technique._paint ?? {};
        const layout = technique._layout ?? {};

        switch (techName) {
            case 'fill':
                if (technique._rasterTileUrl) {
                    this.patchRasterMaterial(material, technique);
                } else {
                    this.patchFillMaterial(material, paint);
                }
                break;
            case 'solid-line':
                this.patchLineMaterial(material, paint, layout);
                break;
            case 'circles':
                this.patchCircleMaterial(material, paint);
                break;
            case 'extruded-polygon':
                if (technique._layerId && paint['building-color']) {
                    this.patchBuildingMaterial(material, technique);
                } else {
                    this.patchExtrusionMaterial(material, paint, technique);
                }
                break;
        }
    }

    private patchRasterMaterial(material: THREE.Material, technique: any): void {
        const url = technique._rasterTileUrl as string;
        if (!url) return;

        const opacity = technique.opacity ?? 1;
        if ('opacity' in material) {
            (material as any).opacity = opacity;
            (material as any).transparent = opacity < 1;
        }

        const cached = rasterTextureCache.get(url);
        if (cached) {
            (material as any).map = cached;
            (material as any).color = new THREE.Color(0xffffff);
            material.needsUpdate = true;
            return;
        }

        rasterTextureLoader.load(url, (texture) => {
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            rasterTextureCache.set(url, texture);
            (material as any).map = texture;
            (material as any).color = new THREE.Color(0xffffff);
            material.needsUpdate = true;
        }, undefined, () => {});
    }

    private patchFillMaterial(material: THREE.Material, paint: any): void {
        const translate = paint['fill-translate'] ?? [0, 0];
        const outlineColor = paint['fill-outline-color'];

        if ((!translate || (translate[0] === 0 && translate[1] === 0)) && !outlineColor) return;

        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);

            if (translate && (translate[0] !== 0 || translate[1] !== 0)) {
                shader.uniforms.uMBTranslate = { value: new THREE.Vector2(translate[0], translate[1]) };
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    'uniform vec2 uMBTranslate;\nvoid main() {'
                );
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    'transformed.xy += uMBTranslate;\n#include <project_vertex>'
                );
            }

            if (outlineColor) {
                shader.uniforms.uMBOutlineColor = { value: new THREE.Color(outlineColor) };
                shader.uniforms.uMBOutlineWidth = { value: 1.0 };
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <colorspace_fragment>',
                    `#include <colorspace_fragment>
                     float mbEdge = fwidth(gl_FragCoord.z);
                     if (mbEdge > 0.5) {
                         gl_FragColor.rgb = mix(gl_FragColor.rgb, uMBOutlineColor, 0.8);
                     }`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    'uniform vec3 uMBOutlineColor;\nuniform float uMBOutlineWidth;\nvoid main() {'
                );
            }
        };
        material.needsUpdate = true;
    }

    private patchLineMaterial(material: THREE.Material, paint: any, layout: any): void {
        const cap = layout['line-cap'];
        const dashArray = paint['line-dasharray'] ?? layout['line-dasharray'];
        const gapWidth = paint['line-gap-width'];
        let modified = false;

        if (cap) {
            const capMap: Record<string, string> = {
                butt: 'None', round: 'Round', square: 'Square',
            };
            const capValue = capMap[cap];
            if (capValue && typeof (material as any).caps !== 'undefined') {
                (material as any).caps = capValue;
                modified = true;
            }
        }

        if (gapWidth && gapWidth > 0 && 'secondaryWidth' in material) {
            (material as any).secondaryWidth = gapWidth;
            modified = true;
        }

        if (dashArray && Array.isArray(dashArray) && dashArray.length > 2) {
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                let totalLen = 0;
                for (const v of dashArray) totalLen += v;
                shader.uniforms.uMBDashPattern = { value: new Float32Array(dashArray) };
                shader.uniforms.uMBDashCount = { value: dashArray.length };
                shader.uniforms.uMBDashTotal = { value: totalLen };
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `uniform float uMBDashPattern[${dashArray.length}];\nuniform float uMBDashCount;\nuniform float uMBDashTotal;\nvoid main() {`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    'gl_FragColor = vec4( diffuse, opacity );',
                    `float mbDashPos = fract(vCoords.x / uMBDashTotal * uMBDashCount);
                     float mbDashAccum = 0.0;
                     bool mbDashVisible = true;
                     for (int i = 0; i < ${Math.min(dashArray.length, 8)}; i++) {
                         if (float(i) >= uMBDashCount) break;
                         float segLen = uMBDashPattern[i] / uMBDashTotal;
                         if (mbDashPos < mbDashAccum + segLen) {
                             mbDashVisible = (mod(float(i), 2.0) < 0.5);
                             break;
                         }
                         mbDashAccum += segLen;
                     }
                     if (!mbDashVisible) discard;
                     gl_FragColor = vec4( diffuse, opacity );`
                );
            };
            material.needsUpdate = true;
            modified = true;
        }
    }

    private patchCircleMaterial(material: THREE.Material, paint: any): void {
        const translate = paint['circle-translate'] ?? [0, 0];
        const pitchScale = paint['circle-pitch-scale'];
        let modified = false;

        if (pitchScale === 'viewport' && 'sizeAttenuation' in material) {
            (material as any).sizeAttenuation = false;
            modified = true;
        } else if (pitchScale === 'map' && 'sizeAttenuation' in material) {
            (material as any).sizeAttenuation = true;
            modified = true;
        }

        if (translate && (translate[0] !== 0 || translate[1] !== 0)) {
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                shader.uniforms.uMBTranslate = { value: new THREE.Vector2(translate[0], translate[1]) };
            };
            material.needsUpdate = true;
            modified = true;
        }
    }

    private patchExtrusionMaterial(material: THREE.Material, paint: any, technique: any): void {
        const height = technique.height ?? paint['fill-extrusion-height'] ?? 0;
        const base = technique.floorHeight ?? paint['fill-extrusion-base'] ?? 0;
        const verticalGradient = paint['fill-extrusion-vertical-gradient'] !== false;
        if (height === 0 && base === 0 && !verticalGradient) return;

        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);

            if (height > 0 || base > 0) {
                shader.uniforms.uMBHeightBase = { value: base };
                shader.uniforms.uMBHeightTop = { value: height };
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    'uniform float uMBHeightBase;\nuniform float uMBHeightTop;\nvoid main() {'
                );
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `float mbH = uMBHeightBase + position.z * (uMBHeightTop - uMBHeightBase);
                     vec3 transformed = vec3(position.x, position.y, mbH);`
                );
            }

            if (verticalGradient) {
                shader.uniforms.uMBGradTop = { value: new THREE.Color(1, 1, 1) };
                shader.uniforms.uMBGradBottom = { value: new THREE.Color(0.6, 0.6, 0.6) };
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <fog_vertex>',
                    `#include <fog_vertex>
                     varying float vMBHeight;
                     vMBHeight = (transformed.z - uMBHeightBase) / max(uMBHeightTop - uMBHeightBase, 0.001);`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <colorspace_fragment>',
                    `#include <colorspace_fragment>
                     varying float vMBHeight;
                     vec3 mbGradColor = mix(vec3(0.6), vec3(1.0), clamp(vMBHeight, 0.0, 1.0));
                     gl_FragColor.rgb *= mbGradColor;`
                );
            }
        };
        material.needsUpdate = true;
    }

    private patchBuildingMaterial(material: THREE.Material, technique: any): void {
        const height = Number(technique.height ?? 10);
        const base = Number(technique.floorHeight ?? 0);
        const roofColor = technique._roofColor ?? '#aaaaaa';
        const emissive = technique._paint?.['building-emissive-strength'] ?? 0;

        if (emissive > 0 && 'emissiveIntensity' in material) {
            (material as any).emissiveIntensity = emissive;
            (material as any).emissive = new THREE.Color(roofColor);
        }

        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            shader.uniforms.uMBHeightBase = { value: base };
            shader.uniforms.uMBHeightTop = { value: height };
            shader.uniforms.uMBRoofColor = { value: new THREE.Color(roofColor) };

            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                'uniform float uMBHeightBase;\nuniform float uMBHeightTop;\nvoid main() {'
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `float mbH = uMBHeightBase + position.z * (uMBHeightTop - uMBHeightBase);
                 vec3 transformed = vec3(position.x, position.y, mbH);`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <colorspace_fragment>',
                `#include <colorspace_fragment>
                 if (abs(dot(normalize(vNormal), vec3(0.0,0.0,1.0))) > 0.9) {
                     gl_FragColor.rgb = uMBRoofColor;
                 }`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                'uniform vec3 uMBRoofColor;\nvoid main() {'
            );
        };
        material.needsUpdate = true;
    }

    invalidate(): void {
        this.m_patchedTiles = new WeakMap();
    }
}
