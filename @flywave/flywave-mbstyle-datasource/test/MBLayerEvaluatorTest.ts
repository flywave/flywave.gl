import { expect } from 'chai';
import { MBLayerEvaluator } from '../src/MBLayerEvaluator';
import { StyleSpecification } from '../src/MBStyleSpec';

describe('MBLayerEvaluator', () => {
    const sampleStyle: StyleSpecification = {
        version: 8,
        sources: {
            'osm': { type: 'vector', tiles: ['https://example.com/{z}/{x}/{y}.mvt'] },
        },
        layers: [
            {
                id: 'water',
                type: 'fill',
                source: 'osm',
                'source-layer': 'water',
                paint: {
                    'fill-color': '#a0c8f0',
                    'fill-opacity': 0.8,
                },
            },
            {
                id: 'roads',
                type: 'line',
                source: 'osm',
                'source-layer': 'transportation',
                filter: ['==', 'class', 'primary'],
                paint: {
                    'line-color': '#fff',
                    'line-width': 2,
                },
            },
            {
                id: 'parks',
                type: 'fill',
                source: 'osm',
                'source-layer': 'landuse',
                filter: ['==', 'class', 'park'],
                minzoom: 10,
                maxzoom: 20,
                paint: {
                    'fill-color': '#00ff00',
                },
            },
            {
                id: 'labels',
                type: 'symbol',
                source: 'osm',
                'source-layer': 'place',
                layout: {
                    'text-field': '{name}',
                    'text-size': 14,
                },
                paint: {
                    'text-color': '#333',
                },
            },
            {
                id: 'buildings',
                type: 'fill-extrusion',
                source: 'osm',
                'source-layer': 'building',
                paint: {
                    'fill-extrusion-color': '#ccc',
                    'fill-extrusion-height': ['get', 'height'],
                },
            },
            {
                id: 'hidden_layer',
                type: 'fill',
                source: 'osm',
                'source-layer': 'water',
                layout: { visibility: 'none' },
                paint: { 'fill-color': '#f00' },
            },
        ],
    };

    const evaluator = new MBLayerEvaluator(sampleStyle);

    it('evaluates fill layer', () => {
        const result = evaluator.evaluate(
            'osm', 'water',
            { type: 'Polygon', id: 1, properties: { class: 'ocean' } },
            10, 'polygon',
        );
        expect(result).to.have.lengthOf(1);
        expect(result[0].id).to.equal('water');
        expect(result[0].paint['fill-color']).to.equal('#a0c8f0');
        expect(result[0].paint['fill-opacity']).to.equal(0.8);
    });

    it('filters by filter condition', () => {
        const passing = evaluator.evaluate(
            'osm', 'transportation',
            { type: 'LineString', id: 2, properties: { class: 'primary' } },
            10, 'line',
        );
        expect(passing).to.have.lengthOf(1);
        expect(passing[0].id).to.equal('roads');

        const failing = evaluator.evaluate(
            'osm', 'transportation',
            { type: 'LineString', id: 3, properties: { class: 'secondary' } },
            10, 'line',
        );
        expect(failing).to.have.lengthOf(0);
    });

    it('evaluates minzoom/maxzoom', () => {
        const zoom5 = evaluator.evaluate(
            'osm', 'landuse',
            { type: 'Polygon', id: 4, properties: { class: 'park' } },
            5, 'polygon',
        );
        expect(zoom5).to.have.lengthOf(0); // below minzoom=10

        const zoom15 = evaluator.evaluate(
            'osm', 'landuse',
            { type: 'Polygon', id: 4, properties: { class: 'park' } },
            15, 'polygon',
        );
        expect(zoom15).to.have.lengthOf(1);
        expect(zoom15[0].id).to.equal('parks');
    });

    it('respects visibility: none', () => {
        const result = evaluator.evaluate(
            'osm', 'water',
            { type: 'Polygon', id: 5, properties: {} },
            10, 'polygon',
        );
        // only water layer (not hidden_layer) should match
        const hasHidden = result.some(l => l.id === 'hidden_layer');
        expect(hasHidden).to.be.false;
    });

    it('evaluates symbol layer', () => {
        const result = evaluator.evaluate(
            'osm', 'place',
            { type: 'Point', id: 6, properties: { name: 'Berlin' } },
            10, 'point',
        );
        expect(result).to.have.lengthOf(1);
        expect(result[0].id).to.equal('labels');
        expect(result[0].layout['text-field']).to.equal('{name}');
        expect(result[0].paint['text-color']).to.equal('#333');
    });

    it('evaluates fill-extrusion with expression', () => {
        const result = evaluator.evaluate(
            'osm', 'building',
            { type: 'Polygon', id: 7, properties: { height: 20 } },
            10, 'polygon',
        );
        expect(result).to.have.lengthOf(1);
        expect(result[0].type).to.equal('fill-extrusion');
        // height expression should eval to the feature's height property
        expect(result[0].paint['fill-extrusion-height']).to.equal(20);
    });

    it('returns layers in style order', () => {
        const result = evaluator.evaluate(
            'osm', 'water',
            { type: 'Polygon', id: 8, properties: {} },
            10, 'polygon',
        );
        expect(result).to.have.lengthOf(1);
        expect(result[0].renderOrder).to.equal(0); // first layer in style
    });

    it('passes through non-default paint properties (HD properties)', () => {
        const style = {
            version: 8,
            sources: { s: { type: 'geojson' as const, data: { type: 'FeatureCollection', features: [] } } },
            layers: [{
                id: 'l',
                type: 'line',
                source: 's',
                paint: {
                    'line-width': 3,
                    'line-trim-offset': [0.2, 0.8],
                    'line-border-width': 2,
                    'line-border-color': '#ff0000',
                },
            }],
        };
        const evaluator = new MBLayerEvaluator(style as any);
        const result = evaluator.evaluate('s', '', { type: 'LineString', properties: {} }, 10, 'line');
        expect(result).to.have.lengthOf(1);
        const paint = result[0].paint as any;
        expect(paint['line-width']).to.equal(3);
        expect(paint['line-trim-offset']).to.deep.equal([0.2, 0.8]);
        expect(paint['line-border-width']).to.equal(2);
        expect(paint['line-border-color']).to.equal('#ff0000');
    });

    it('passes through fill-extrusion HD properties', () => {
        const style = {
            version: 8,
            sources: { s: { type: 'geojson' as const, data: { type: 'FeatureCollection', features: [] } } },
            layers: [{
                id: 'b',
                type: 'fill-extrusion',
                source: 's',
                paint: {
                    'fill-extrusion-height': 10,
                    'fill-extrusion-color': '#cccccc',
                    'fill-extrusion-ambient-occlusion-intensity': 0.5,
                    'fill-extrusion-front-cutoff': 0.3,
                },
            }],
        };
        const evaluator = new MBLayerEvaluator(style as any);
        const result = evaluator.evaluate('s', '', { type: 'Polygon', properties: {} }, 10, 'polygon');
        expect(result).to.have.lengthOf(1);
        const paint = result[0].paint as any;
        expect(paint['fill-extrusion-height']).to.equal(10);
        expect(paint['fill-extrusion-ambient-occlusion-intensity']).to.equal(0.5);
        expect(paint['fill-extrusion-front-cutoff']).to.equal(0.3);
    });

    it('passes through non-default layout properties', () => {
        const style = {
            version: 8,
            sources: { s: { type: 'geojson' as const, data: { type: 'FeatureCollection', features: [] } } },
            layers: [{
                id: 'l',
                type: 'symbol',
                source: 's',
                layout: {
                    'icon-image': 'marker',
                    'symbol-elevation-reference': 'hd-road-markup',
                    'model-id': 'bridge-1',
                },
            }],
        };
        const evaluator = new MBLayerEvaluator(style as any);
        const result = evaluator.evaluate('s', '', { type: 'Point', properties: {} }, 10, 'point');
        expect(result).to.have.lengthOf(1);
        const layout = result[0].layout as any;
        // Standard property.
        expect(layout['icon-image']).to.equal('marker');
        // HD layout properties should pass through.
        expect(layout['symbol-elevation-reference']).to.equal('hd-road-markup');
        expect(layout['model-id']).to.equal('bridge-1');
    });
});
