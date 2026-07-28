import * as THREE from 'three';

export interface GlyphMetrics {
    glyphId: number;
    width: number;
    height: number;
    left: number;
    top: number;
    advance: number;
}

export interface GlyphAtlas {
    texture: THREE.DataTexture;
    /** Glyph metrics keyed by font stack + char code */
    getMetrics(font: string, char: string): GlyphMetrics | undefined;
}

/**
 * Minimal glyph loader for PBF font files.
 *
 * In a full implementation this would parse protobuf font data
 * from the glyphs URL template. This simplified version creates
 * a basic glyph atlas with ASCII characters using Canvas2D fallback.
 */
export class MBGlyphLoader {
    private m_atlasTexture: THREE.DataTexture | null = null;
    private m_metrics = new Map<string, GlyphMetrics>();
    private m_atlasSize = 512;
    private m_glyphSize = 32;

    async loadGlyphRange(
        fontStack: string,
        range: number,
        glyphUrlTemplate: string,
    ): Promise<void> {
        // In production: fetch PBF from glyphUrlTemplate, decode with protobufjs,
        // generate SDF bitmaps via TinySDF, pack into atlas.
        //
        // For now: create a minimal atlas from canvas-drawn glyphs
        this.buildFallbackAtlas(fontStack);
    }

    private buildFallbackAtlas(fontStack: string) {
        const size = this.m_atlasSize;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#000';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const glyphsPerRow = Math.floor(size / this.m_glyphSize);
        let x = 0, y = 0;

        for (let code = 32; code < 128; code++) {
            const char = String.fromCharCode(code);
            const metrics = ctx.measureText(char);

            ctx.fillText(char, x + 2, y + 2);

            const key = `${fontStack}:${char}`;
            this.m_metrics.set(key, {
                glyphId: code,
                width: Math.ceil(metrics.width),
                height: this.m_glyphSize,
                left: 0,
                top: 0,
                advance: Math.ceil(metrics.width),
            });

            x += this.m_glyphSize;
            if (x + this.m_glyphSize > size) { x = 0; y += this.m_glyphSize; }
        }

        const imageData = ctx.getImageData(0, 0, size, size);
        this.m_atlasTexture = new THREE.DataTexture(
            new Uint8Array(imageData.data.buffer),
            size, size,
            THREE.RGBAFormat,
        );
        this.m_atlasTexture.needsUpdate = true;
    }

    getAtlas(): THREE.DataTexture | null {
        return this.m_atlasTexture;
    }

    getMetrics(font: string, char: string): GlyphMetrics | undefined {
        return this.m_metrics.get(`${font}:${char}`);
    }
}
