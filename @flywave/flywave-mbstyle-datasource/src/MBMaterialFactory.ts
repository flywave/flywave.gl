import * as THREE from 'three';

import { LayerType } from './MBStyleSpec';

function parseColor(color: string): THREE.Color {
    return new THREE.Color(color);
}

function isColorTransparent(color: string | undefined, opacity: number): boolean {
    return opacity < 1 || color === 'rgba(0,0,0,0)' || color === 'transparent';
}

export class MBMaterialFactory {
    static create(
        layerType: LayerType,
        paint: Record<string, any>,
        options?: {
            sprites?: Map<string, THREE.Texture>;
            lineGeometryMode?: 'native' | 'triangulated';
        }
    ): THREE.Material {
        switch (layerType) {
            case 'background':
                return this.createBackgroundMaterial(paint);
            case 'fill':
                return this.createFillMaterial(paint, options);
            case 'line':
                return this.createLineMaterial(paint, options);
            case 'symbol':
                return this.createSymbolMaterial(paint, options);
            case 'circle':
                return this.createCircleMaterial(paint);
            case 'fill-extrusion':
                return this.createFillExtrusionMaterial(paint);
            default:
                return new THREE.MeshBasicMaterial({ color: '#ff00ff' });
        }
    }

    private static createBackgroundMaterial(paint: Record<string, any>): THREE.Material {
        const color = paint['background-color'] ?? '#000000';
        const opacity = paint['background-opacity'] ?? 1;
        const pattern = paint['background-pattern'];

        if (pattern) {
            return new THREE.MeshBasicMaterial({
                color: parseColor(color),
                opacity,
                transparent: isColorTransparent(color, opacity),
                depthWrite: false,
            });
        }

        return new THREE.MeshBasicMaterial({
            color: parseColor(color),
            opacity,
            transparent: isColorTransparent(color, opacity),
            depthWrite: false,
        });
    }

    private static createFillMaterial(
        paint: Record<string, any>,
        options?: any
    ): THREE.Material {
        const color = paint['fill-color'] ?? '#000000';
        const opacity = paint['fill-opacity'] ?? 1;
        const outlineColor = paint['fill-outline-color'];
        const antialias = paint['fill-antialias'] !== false;

        const mat = new THREE.MeshBasicMaterial({
            color: parseColor(color),
            opacity,
            transparent: isColorTransparent(color, opacity),
            side: THREE.DoubleSide,
            depthWrite: opacity >= 1,
        });

        return mat;
    }

    private static createLineMaterial(
        paint: Record<string, any>,
        options?: { lineGeometryMode?: 'native' | 'triangulated' }
    ): THREE.Material {
        const color = paint['line-color'] ?? '#000000';
        const opacity = paint['line-opacity'] ?? 1;
        const width = paint['line-width'] ?? 1;
        const dasharray = paint['line-dasharray'];
        const pattern = paint['line-pattern'];

        if (dasharray) {
            // Use dashed line with a custom shader or stipple pattern
        }

        // Native line - WebGL only supports width=1
        const mat = new THREE.LineBasicMaterial({
            color: parseColor(color),
            opacity,
            transparent: isColorTransparent(color, opacity),
            linewidth: Math.min(width, 1),
        });

        return mat;
    }

    private static createSymbolMaterial(
        paint: Record<string, any>,
        options?: { sprites?: Map<string, THREE.Texture> }
    ): THREE.Material {
        const iconOpacity = paint['icon-opacity'] ?? 1;
        const iconColor = paint['icon-color'] ?? '#000000';

        return new THREE.SpriteMaterial({
            color: parseColor(iconColor),
            opacity: iconOpacity,
            transparent: isColorTransparent(iconColor, iconOpacity),
            depthWrite: false,
        });
    }

    private static createCircleMaterial(paint: Record<string, any>): THREE.Material {
        const color = paint['circle-color'] ?? '#000000';
        const opacity = paint['circle-opacity'] ?? 1;
        const radius = paint['circle-radius'] ?? 5;
        const blur = paint['circle-blur'] ?? 0;

        return new THREE.PointsMaterial({
            color: parseColor(color),
            opacity,
            transparent: isColorTransparent(color, opacity),
            size: radius * 2,
            sizeAttenuation: true,
            depthWrite: false,
        });
    }

    private static createFillExtrusionMaterial(paint: Record<string, any>): THREE.Material {
        const color = paint['fill-extrusion-color'] ?? '#000000';
        const opacity = paint['fill-extrusion-opacity'] ?? 1;

        return new THREE.MeshLambertMaterial({
            color: parseColor(color),
            opacity,
            transparent: isColorTransparent(color, opacity),
            side: THREE.DoubleSide,
            flatShading: true,
        });
    }
}
