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
});
