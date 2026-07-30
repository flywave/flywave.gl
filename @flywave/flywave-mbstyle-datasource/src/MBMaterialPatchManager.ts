import * as THREE from 'three';
import { MBStyleDataSource } from './MBStyleDataSource';

interface MaterialPatchState {
    patched: boolean;
}

const rasterTextureCache = new Map<string, THREE.Texture>();
const rasterTextureLoader = new THREE.TextureLoader();
// Cache of cropped sprite sub-rect textures used for fill/line/extrusion patterns.
const patternTextureCache = new Map<string, THREE.Texture>();

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
            this.patchIconObject(obj, tech);
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
                if (technique._isHillshade) {
                    this.patchHillshadeMaterial(material, technique);
                } else if (technique._rasterTileUrl) {
                    this.patchRasterMaterial(material, technique);
                } else if (technique._patternName) {
                    this.patchFillPatternMaterial(material, technique);
                } else {
                    this.patchFillMaterial(material, paint);
                }
                break;
            case 'solid-line':
                this.patchLineMaterial(material, paint, layout, technique);
                break;
            case 'circles':
                if (technique._isHeatmap) {
                    this.patchHeatmapMaterial(material, technique);
                } else {
                    this.patchCircleMaterial(material, paint);
                }
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

        const paint = technique._paint ?? {};
        const brightness = paint['raster-brightness']; // [min,max] or number
        const contrast = paint['raster-contrast'];     // [-1,1]
        const saturation = paint['raster-saturation']; // [-1,1]
        const hue = paint['raster-hue-rotate'];        // degrees
        const colorVal = paint['raster-color'];        // [r,g,b] mix factor
        const hasAdjust =
            brightness !== undefined || contrast !== undefined ||
            saturation !== undefined || hue !== undefined || colorVal !== undefined;

        const applyAdjust = () => {
            if (!hasAdjust) return;
            if ((material as any).__mbRasterAdj) return;
            (material as any).__mbRasterAdj = true;
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                const bMin = Array.isArray(brightness) ? brightness[0] : (brightness ?? 0);
                const bMax = Array.isArray(brightness) ? brightness[1] : (brightness ?? 1);
                shader.uniforms.uMBRasBMin = { value: bMin };
                shader.uniforms.uMBRasBMax = { value: bMax };
                shader.uniforms.uMBRasContrast = { value: contrast ?? 0 };
                shader.uniforms.uMBRasSat = { value: saturation ?? 0 };
                shader.uniforms.uMBRasHue = { value: (hue ?? 0) * Math.PI / 180 };
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `uniform float uMBRasBMin; uniform float uMBRasBMax;
                     uniform float uMBRasContrast; uniform float uMBRasSat; uniform float uMBRasHue;
                     void main() {`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    'gl_FragColor = vec4( diffuse, opacity );',
                    `vec3 mbR = diffuse;
                     mbR = clamp((mbR - uMBRasBMin) / max(uMBRasBMax - uMBRasBMin, 0.001), 0.0, 1.0);
                     mbR = (mbR - 0.5) * (1.0 + uMBRasContrast) + 0.5;
                     float mbL = dot(mbR, vec3(0.299, 0.587, 0.114));
                     mbR = mix(vec3(mbL), mbR, 1.0 + uMBRasSat);
                     float mbCa = cos(uMBRasHue); float mbSa = sin(uMBRasHue);
                     mat3 mbHue = mat3(
                         vec3(mbCa + 0.299*(1.0-mbCa), 0.587*(1.0-mbCa) - 0.327*mbSa, 0.114*(1.0-mbCa) + 0.921*mbSa),
                         vec3(0.299*(1.0-mbCa) - 0.714*mbSa, mbCa + 0.587*(1.0-mbCa), 0.114*(1.0-mbCa) + 0.530*mbSa),
                         vec3(0.299*(1.0-mbCa) + 0.165*mbSa, 0.587*(1.0-mbCa) - 0.330*mbSa, mbCa + 0.114*(1.0-mbCa)));
                     mbR = clamp(mbHue * mbR, 0.0, 1.0);
                     gl_FragColor = vec4(mbR, opacity);`
                );
            };
            material.needsUpdate = true;
        };

        const attach = (texture: THREE.Texture) => {
            (material as any).map = texture;
            (material as any).color = new THREE.Color(0xffffff);
            applyAdjust();
            material.needsUpdate = true;
        };

        const cached = rasterTextureCache.get(url);
        if (cached) {
            attach(cached);
            return;
        }

        rasterTextureLoader.load(url, (texture) => {
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            rasterTextureCache.set(url, texture);
            attach(texture);
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

    private patchLineMaterial(material: THREE.Material, paint: any, layout: any, technique: any): void {
        const cap = layout['line-cap'];
        const join = layout['line-join'];
        const dashArray = paint['line-dasharray'] ?? layout['line-dasharray'];
        const gapWidth = paint['line-gap-width'];
        const translate = paint['line-translate'] ?? technique._translate ?? [0, 0];
        const gradientStops = technique._lineGradientStops;
        const patternName = technique._patternName;
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

        if (join) {
            // SolidLineMaterial exposes a join type setter; fall back to a define.
            const joinMap: Record<string, string> = {
                bevel: 'Bevel', round: 'Round', miter: 'Miter',
            };
            const joinValue = joinMap[join];
            if (joinValue && typeof (material as any).setJoinType === 'function') {
                (material as any).setJoinType(joinValue);
                modified = true;
            } else if (joinValue && typeof (material as any).joins !== 'undefined') {
                (material as any).joins = joinValue;
                modified = true;
            }
        }

        if (gapWidth && gapWidth > 0 && 'secondaryWidth' in material) {
            (material as any).secondaryWidth = gapWidth;
            modified = true;
        }

        const hasTranslate = translate && (translate[0] !== 0 || translate[1] !== 0);
        const hasGradient = Array.isArray(gradientStops) && gradientStops.length > 1;
        const patternTex = patternName ? this.extractPatternTexture(patternName) : undefined;
        if (hasTranslate || hasGradient || patternTex) {
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                if (hasTranslate) {
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
                if (hasGradient && !patternTex) {
                    const tex = MBMaterialPatchManager.buildGradientTexture(gradientStops);
                    shader.uniforms.uMBGradient = { value: tex };
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'void main() {',
                        'uniform sampler2D uMBGradient;\nvoid main() {'
                    );
                    // Mapbox line-gradient colors by line-progress (distance along line).
                    // The native SolidLineMaterial exposes vCoords.x as cumulative distance
                    // (same varying the dasharray patch uses); normalize via fract so the
                    // full gradient ramp is applied along the line.
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'gl_FragColor = vec4( diffuse, opacity );',
                        `float mbG = fract(vCoords.x);
                         vec3 mbGradColor = texture2D(uMBGradient, vec2(mbG, 0.5)).rgb;
                         gl_FragColor = vec4(mbGradColor, opacity);`
                    );
                }
                if (patternTex) {
                    shader.uniforms.uMBLinePattern = { value: patternTex };
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'void main() {',
                        'uniform sampler2D uMBLinePattern;\nvoid main() {'
                    );
                    // Tile the pattern image along the line using the cumulative
                    // distance varying (vCoords.x), scaled by the pattern width.
                    const pscale = 1 / Math.max(1, (patternTex.image?.width ?? 32));
                    shader.uniforms.uMBPatternScale = { value: pscale };
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'gl_FragColor = vec4( diffuse, opacity );',
                        `vec2 mbLP = vec2(fract(vCoords.x * uMBPatternScale), 0.5);
                         vec4 mbLPx = texture2D(uMBLinePattern, mbLP);
                         gl_FragColor = vec4(mbLPx.rgb, mbLPx.a * opacity);`
                    );
                }
            };
            material.needsUpdate = true;
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
        const translate = paint['fill-extrusion-translate'] ?? technique._translate ?? [0, 0];
        const hasTranslate = translate && (translate[0] !== 0 || translate[1] !== 0);
        const patternTex = technique._patternName ? this.extractPatternTexture(technique._patternName) : undefined;
        if (height === 0 && base === 0 && !verticalGradient && !hasTranslate && !patternTex) {
            // Nothing to patch unless a pattern is requested.
            if (!patternTex) return;
        }

        // Apply pattern as a base texture (tiles across the footprint).
        if (patternTex) {
            (material as any).map = patternTex;
            (material as any).color = new THREE.Color('#ffffff');
        }

        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);

            if (hasTranslate) {
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

    /**
     * Connect the sprite atlas to a native POI/icon object: set the atlas texture
     * and inject per-icon UV so each icon samples its own sub-rectangle.
     */
    private patchIconObject(obj: THREE.Object3D, technique: any): void {
        const atlas = (this.m_dataSource as any).spriteAtlas;
        if (!atlas) return;
        const iconName = technique.imageTexture ?? technique._layout?.['icon-image'];
        if (!iconName) return;

        const material = (obj as any).material as THREE.Material | undefined;
        if (!material || (material as any).__mbIconPatched) return;
        (material as any).__mbIconPatched = true;

        const uv = atlas.getIconUv(iconName);
        const iconInfo = atlas.icons?.get(iconName);
        const isSdf = iconInfo?.sdf === true;
        const iconColor = technique.color ?? technique._paint?.['icon-color'] ?? '#ffffff';

        (material as any).map = atlas.texture;
        // Non-SDF icons show the texture as-is (white multiplier); SDF icons are
        // tinted by icon-color.
        (material as any).color = new THREE.Color(isSdf ? iconColor : '#ffffff');
        (material as any).transparent = true;
        (material as any).depthWrite = false;

        if (uv) {
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                shader.uniforms.uUvOffset = { value: new THREE.Vector2(uv.uvMin[0], uv.uvMin[1]) };
                shader.uniforms.uUvScale = {
                    value: new THREE.Vector2(uv.uvMax[0] - uv.uvMin[0], uv.uvMax[1] - uv.uvMin[1]),
                };
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <common>',
                    '#include <common>\nuniform vec2 uUvOffset;\nuniform vec2 uUvScale;'
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    'texture2D( map, vUv )',
                    'texture2D( map, uUvOffset + vUv * uUvScale )'
                );
            };
            material.needsUpdate = true;
        }
    }

    /**
     * Approximate heatmap rendering on a native points material: additive
     * blending with a soft radial falloff so overlapping points build density.
     * (Full Mapbox heatmap uses a two-pass density→color-ramp pipeline; this is
     * a single-pass approximation that "connects the flow" and produces visible
     * heatmap-like output.)
     */
    private patchHeatmapMaterial(material: THREE.Material, technique: any): void {
        if ((material as any).__mbHeatmapPatched) return;
        (material as any).__mbHeatmapPatched = true;

        (material as any).transparent = true;
        (material as any).depthWrite = false;
        (material as any).blending = (THREE as any).AdditiveBlending;

        const colorStops = technique._heatmapColorStops;
        const ramp = MBMaterialPatchManager.buildGradientTexture(colorStops);
        const intensity = technique._heatmapIntensity ?? 1;
        const weight = technique._heatmapWeight ?? 1;

        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            shader.uniforms.uMBHeatRamp = { value: ramp };
            shader.uniforms.uMBHeatIntensity = { value: intensity };
            shader.uniforms.uMBHeatWeight = { value: weight };
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                'uniform sampler2D uMBHeatRamp;\nuniform float uMBHeatIntensity;\nuniform float uMBHeatWeight;\nvoid main() {'
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'gl_FragColor = vec4( diffuse, opacity );',
                `vec2 mbHp = gl_PointCoord - vec2(0.5);
                 float mbHd = dot(mbHp, mbHp) * 4.0;
                 float mbHfall = exp(-mbHd * uMBHeatIntensity);
                 float mbHden = clamp(mbHfall * uMBHeatWeight, 0.0, 1.0);
                 vec3 mbHcol = texture2D(uMBHeatRamp, vec2(mbHden, 0.5)).rgb;
                 gl_FragColor = vec4(mbHcol, mbHden * opacity);`
            );
        };
        material.needsUpdate = true;
    }

    /**
     * Hillshade: load the per-tile raster-DEM texture and apply a hillshade
     * shader (slope/aspect from finite differences, lambertian dot with a light
     * direction). DEM PNGs encode elevation in (r*256*256 + g*256 + b) - 65536.
     */
    private patchHillshadeMaterial(material: THREE.Material, technique: any): void {
        const url = technique._hillshadeDemUrl as string;
        if (!url) return;
        if ((material as any).__mbHillshadePatched) return;

        const intensity = technique._hillshadeIntensity ?? 0.5;
        const accent = new THREE.Color(technique._hillshadeAccent ?? '#ffffff');
        const highlight = new THREE.Color(technique._hillshadeHighlight ?? '#ffffff');

        const applyShader = (demTex: THREE.Texture) => {
            if ((material as any).__mbHillshadePatched) return;
            (material as any).__mbHillshadePatched = true;
            (material as any).map = demTex;
            const origOnCompile = material.onBeforeCompile;
            material.onBeforeCompile = (shader: any) => {
                if (origOnCompile) origOnCompile.call(material, shader);
                shader.uniforms.uMBDem = { value: demTex };
                shader.uniforms.uMBHsIntensity = { value: intensity };
                shader.uniforms.uMBHsAccent = { value: accent };
                shader.uniforms.uMBHsHighlight = { value: highlight };
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    `uniform sampler2D uMBDem;
                     uniform float uMBHsIntensity;
                     uniform vec3 uMBHsAccent;
                     uniform vec3 uMBHsHighlight;
                     float mbDemElev(vec2 uv){ vec4 c=texture2D(uMBDem,uv);
                         return (c.r*65536.0+c.g*256.0+c.b)-65536.0; }
                     void main() {`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    'gl_FragColor = vec4( diffuse, opacity );',
                    `vec2 mbPx = 1.0/vec2(64.0);
                     float mbL=mbDemElev(vUv-vec2(mbPx.x,0.0));
                     float mbR=mbDemElev(vUv+vec2(mbPx.x,0.0));
                     float mbD=mbDemElev(vUv-vec2(0.0,mbPx.y));
                     float mbU=mbDemElev(vUv+vec2(0.0,mbPx.y));
                     vec3 mbN=normalize(vec3(mbL-mbR, mbD-mbU, 0.5));
                     vec3 mbLight=normalize(vec3(0.7,0.7,1.0));
                     float mbSlope=max(dot(mbN,mbLight),0.0);
                     vec3 mbHs=mix(diffuse,vec3(mbSlope),uMBHsIntensity);
                     mbHs+=uMBHsAccent*(1.0-abs(mbN.z))*0.15;
                     mbHs+=uMBHsHighlight*pow(mbSlope,3.0)*0.2;
                     gl_FragColor = vec4(mbHs, opacity);`
                );
            };
            material.needsUpdate = true;
        };

        const cached = rasterTextureCache.get(url);
        if (cached) {
            applyShader(cached);
        } else {
            rasterTextureLoader.load(url, (texture) => {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                rasterTextureCache.set(url, texture);
                applyShader(texture);
            }, undefined, () => {});
        }
    }

    /**
     * Build a 256x1 RGBA DataTexture from Mapbox color-expression stops:
     * `[[t, color], ...]`. Used by line-gradient and heatmap color ramps.
     */
    private static buildGradientTexture(stops: any): THREE.DataTexture {
        const size = 256;
        const data = new Uint8Array(size * 4);
        if (!Array.isArray(stops) || stops.length === 0) {
            for (let i = 0; i < size; i++) { data[i*4+3] = 255; }
        } else {
            const norm = stops.map((s: any) => {
                const t = typeof s[0] === 'number' ? s[0] : 0;
                const c = MBMaterialPatchManager.parseColor(String(s[1]));
                return { t, r: c[0], g: c[1], b: c[2], a: c[3] };
            }).sort((a: any, b: any) => a.t - b.t);
            for (let i = 0; i < size; i++) {
                const p = i / (size - 1);
                let lo = norm[0];
                let hi = norm[norm.length - 1];
                for (let j = 0; j < norm.length - 1; j++) {
                    if (p >= norm[j].t && p <= norm[j+1].t) { lo = norm[j]; hi = norm[j+1]; break; }
                }
                const span = Math.max(hi.t - lo.t, 1e-6);
                const f = Math.max(0, Math.min(1, (p - lo.t) / span));
                data[i*4+0] = Math.round(lo.r + (hi.r - lo.r) * f);
                data[i*4+1] = Math.round(lo.g + (hi.g - lo.g) * f);
                data[i*4+2] = Math.round(lo.b + (hi.b - lo.b) * f);
                data[i*4+3] = Math.round((lo.a + (hi.a - lo.a) * f) * 255);
            }
        }
        const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
    }

    private static parseColor(c: string): [number, number, number, number] {
        const h = c.replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(h)) {
            return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), 1];
        }
        if (/^[0-9a-fA-F]{8}$/.test(h)) {
            return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), parseInt(h.slice(6,8),16)/255];
        }
        const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
        if (m) return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
        return [0, 0, 255, 0];
    }

    /**
     * Extract a sprite sub-rectangle into its own repeating CanvasTexture so it
     * can be tiled independently of the rest of the atlas. Returns undefined when
     * the sprite name is unknown or the atlas image is unavailable.
     */
    private extractPatternTexture(patternName: string): THREE.Texture | undefined {
        const atlas = (this.m_dataSource as any).spriteAtlas;
        if (!atlas) return undefined;
        const cached = patternTextureCache.get(patternName);
        if (cached) return cached;
        const info = atlas.icons?.get(patternName);
        const img = atlas.texture?.image;
        if (!info || !img) return undefined;

        const w = info.width;
        const h = info.height;
        try {
            const canvas = typeof document !== 'undefined'
                ? document.createElement('canvas') : null;
            if (!canvas) return undefined;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return undefined;
            ctx.drawImage(img, info.x, info.y, w, h, 0, 0, w, h);
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearFilter;
            tex.needsUpdate = true;
            patternTextureCache.set(patternName, tex);
            return tex;
        } catch {
            return undefined;
        }
    }

    /**
     * fill-pattern / fill-extrusion-pattern: tile a sprite image across the
     * polygon by deriving UVs from world-space position.
     */
    private patchFillPatternMaterial(material: THREE.Material, technique: any): void {
        const tex = this.extractPatternTexture(technique._patternName);
        if (!tex) return;
        if ((material as any).__mbPatternPatched) return;
        (material as any).__mbPatternPatched = true;

        (material as any).map = tex;
        (material as any).color = new THREE.Color('#ffffff');
        (material as any).transparent = (technique.opacity ?? 1) < 1;

        // Pattern tile size in world units. The sprite pixel size is mapped to
        // meters at roughly the sprite's pixelRatio; 1px ≈ 1 world unit scaled.
        const tileScale = 1 / Math.max(1, (tex.image?.width ?? 32));
        const origOnCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader: any) => {
            if (origOnCompile) origOnCompile.call(material, shader);
            shader.uniforms.uMBPatternTex = { value: tex };
            shader.uniforms.uMBPatternScale = { value: tileScale };
            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                'uniform float uMBPatternScale;\nvarying vec2 vMBPatternUv;\nvoid main() {'
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nvMBPatternUv = position.xy * uMBPatternScale;'
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                'uniform sampler2D uMBPatternTex;\nvarying vec2 vMBPatternUv;\nvoid main() {'
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'gl_FragColor = vec4( diffuse, opacity );',
                'vec4 mbPat = texture2D(uMBPatternTex, vMBPatternUv);\n' +
                'gl_FragColor = vec4(mbPat.rgb, mbPat.a * opacity);'
            );
        };
        material.needsUpdate = true;
    }

    invalidate(): void {
        this.m_patchedTiles = new WeakMap();
    }
}

