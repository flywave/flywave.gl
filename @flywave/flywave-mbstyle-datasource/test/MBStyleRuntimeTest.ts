import { expect } from 'chai';
import { MBStyleRuntime } from '../src/MBStyleRuntime';
import { StyleSpecification } from '../src/MBStyleSpec';

function makeStyle(): StyleSpecification {
    return {
        version: 8,
        sources: {
            geojsonSrc: {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            },
        },
        layers: [
            { id: 'bottom', type: 'background', paint: { 'background-color': '#000000' } },
            { id: 'mid', type: 'circle', source: 'geojsonSrc', paint: { 'circle-color': '#ff0000' } },
            { id: 'top', type: 'circle', source: 'geojsonSrc', paint: { 'circle-color': '#00ff00' } },
        ],
    };
}

describe('MBStyleRuntime', () => {
    let changes = 0;
    let rt: MBStyleRuntime;

    beforeEach(() => {
        changes = 0;
        rt = new MBStyleRuntime(makeStyle(), () => { changes++; });
    });

    describe('layer operations', () => {
        it('addLayer appends when no beforeId', () => {
            rt.addLayer({ id: 'new', type: 'background' } as any);
            const ids = rt.style.layers.map(l => l.id);
            expect(ids).to.deep.equal(['bottom', 'mid', 'top', 'new']);
            expect(changes).to.be.greaterThan(0);
        });

        it('addLayer inserts before the named layer', () => {
            rt.addLayer({ id: 'inserted', type: 'background' } as any, 'mid');
            const ids = rt.style.layers.map(l => l.id);
            expect(ids).to.deep.equal(['bottom', 'inserted', 'mid', 'top']);
        });

        it('removeLayer removes a layer', () => {
            rt.removeLayer('mid');
            const ids = rt.style.layers.map(l => l.id);
            expect(ids).to.deep.equal(['bottom', 'top']);
        });

        it('moveLayer reorders', () => {
            rt.moveLayer('top', 'bottom');
            const ids = rt.style.layers.map(l => l.id);
            expect(ids).to.deep.equal(['top', 'bottom', 'mid']);
        });
    });

    describe('paint / layout', () => {
        it('setPaintProperty updates paint value', () => {
            rt.setPaintProperty('bottom', 'background-color', '#112233');
            expect(rt.getPaintProperty('bottom', 'background-color')).to.equal('#112233');
        });

        it('setLayoutProperty updates layout value', () => {
            rt.setLayoutProperty('mid', 'circle-sort-key', 5);
            expect(rt.getLayoutProperty('mid', 'circle-sort-key')).to.equal(5);
        });

        it('setFilter sets a filter', () => {
            rt.setFilter('mid', ['==', ['get', 'x'], 1]);
            const layer = rt.style.layers.find(l => l.id === 'mid') as any;
            expect(layer.filter).to.deep.equal(['==', ['get', 'x'], 1]);
        });

        it('setLayerZoomRange sets zoom bounds', () => {
            rt.setLayerZoomRange('mid', 4, 12);
            const layer = rt.style.layers.find(l => l.id === 'mid') as any;
            expect(layer.minzoom).to.equal(4);
            expect(layer.maxzoom).to.equal(12);
        });
    });

    describe('source management', () => {
        it('addSource registers a new source', () => {
            rt.addSource('newSrc', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            expect(rt.style.sources).to.have.property('newSrc');
        });

        it('addSource triggers onChange', () => {
            rt.addSource('newSrc', { type: 'geojson', data: {} });
            expect(changes).to.be.greaterThan(0);
        });

        it('removeSource removes the source', () => {
            rt.removeSource('geojsonSrc');
            expect(rt.style.sources).to.not.have.property('geojsonSrc');
        });

        it('removeSource on unknown id is a no-op', () => {
            const beforeKeys = Object.keys(rt.style.sources);
            rt.removeSource('does-not-exist');
            expect(Object.keys(rt.style.sources)).to.deep.equal(beforeKeys);
        });

        it('setGeoJSONSourceData replaces source data', () => {
            const newData = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }] };
            rt.setGeoJSONSourceData('geojsonSrc', newData);
            const src = (rt.style.sources as any).geojsonSrc;
            // The runtime stores a deep-cloned copy of the new data.
            expect(src.data.features).to.have.length(1);
        });

        it('setGeoJSONSourceData on unknown source is a no-op', () => {
            const before = JSON.stringify((rt.style.sources as any).geojsonSrc);
            rt.setGeoJSONSourceData('unknown', { type: 'FeatureCollection', features: [] });
            expect(JSON.stringify((rt.style.sources as any).geojsonSrc)).to.equal(before);
        });
    });

    describe('setStyle', () => {
        it('replaces the entire style', () => {
            const newStyle: StyleSpecification = {
                version: 8,
                sources: { s: { type: 'geojson', data: {} } },
                layers: [{ id: 'only', type: 'background' } as any],
            };
            rt.setStyle(newStyle);
            expect(rt.style.layers.map(l => l.id)).to.deep.equal(['only']);
        });
    });
});
