"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const MBStyleRuntime_1 = require("../src/MBStyleRuntime");
function makeStyle() {
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
    let rt;
    beforeEach(() => {
        changes = 0;
        rt = new MBStyleRuntime_1.MBStyleRuntime(makeStyle(), () => { changes++; });
    });
    describe('layer operations', () => {
        it('addLayer appends when no beforeId', () => {
            rt.addLayer({ id: 'new', type: 'background' });
            const ids = rt.style.layers.map(l => l.id);
            (0, chai_1.expect)(ids).to.deep.equal(['bottom', 'mid', 'top', 'new']);
            (0, chai_1.expect)(changes).to.be.greaterThan(0);
        });
        it('addLayer inserts before the named layer', () => {
            rt.addLayer({ id: 'inserted', type: 'background' }, 'mid');
            const ids = rt.style.layers.map(l => l.id);
            (0, chai_1.expect)(ids).to.deep.equal(['bottom', 'inserted', 'mid', 'top']);
        });
        it('removeLayer removes a layer', () => {
            rt.removeLayer('mid');
            const ids = rt.style.layers.map(l => l.id);
            (0, chai_1.expect)(ids).to.deep.equal(['bottom', 'top']);
        });
        it('moveLayer reorders', () => {
            rt.moveLayer('top', 'bottom');
            const ids = rt.style.layers.map(l => l.id);
            (0, chai_1.expect)(ids).to.deep.equal(['top', 'bottom', 'mid']);
        });
    });
    describe('paint / layout', () => {
        it('setPaintProperty updates paint value', () => {
            rt.setPaintProperty('bottom', 'background-color', '#112233');
            (0, chai_1.expect)(rt.getPaintProperty('bottom', 'background-color')).to.equal('#112233');
        });
        it('setLayoutProperty updates layout value', () => {
            rt.setLayoutProperty('mid', 'circle-sort-key', 5);
            (0, chai_1.expect)(rt.getLayoutProperty('mid', 'circle-sort-key')).to.equal(5);
        });
        it('setFilter sets a filter', () => {
            rt.setFilter('mid', ['==', ['get', 'x'], 1]);
            const layer = rt.style.layers.find(l => l.id === 'mid');
            (0, chai_1.expect)(layer.filter).to.deep.equal(['==', ['get', 'x'], 1]);
        });
        it('setLayerZoomRange sets zoom bounds', () => {
            rt.setLayerZoomRange('mid', 4, 12);
            const layer = rt.style.layers.find(l => l.id === 'mid');
            (0, chai_1.expect)(layer.minzoom).to.equal(4);
            (0, chai_1.expect)(layer.maxzoom).to.equal(12);
        });
    });
    describe('source management', () => {
        it('addSource registers a new source', () => {
            rt.addSource('newSrc', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            (0, chai_1.expect)(rt.style.sources).to.have.property('newSrc');
        });
        it('addSource triggers onChange', () => {
            rt.addSource('newSrc', { type: 'geojson', data: {} });
            (0, chai_1.expect)(changes).to.be.greaterThan(0);
        });
        it('removeSource removes the source', () => {
            rt.removeSource('geojsonSrc');
            (0, chai_1.expect)(rt.style.sources).to.not.have.property('geojsonSrc');
        });
        it('removeSource on unknown id is a no-op', () => {
            const beforeKeys = Object.keys(rt.style.sources);
            rt.removeSource('does-not-exist');
            (0, chai_1.expect)(Object.keys(rt.style.sources)).to.deep.equal(beforeKeys);
        });
        it('setGeoJSONSourceData replaces source data', () => {
            const newData = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }] };
            rt.setGeoJSONSourceData('geojsonSrc', newData);
            const src = rt.style.sources.geojsonSrc;
            (0, chai_1.expect)(src.data.features).to.have.length(1);
        });
        it('setGeoJSONSourceData on unknown source is a no-op', () => {
            const before = JSON.stringify(rt.style.sources.geojsonSrc);
            rt.setGeoJSONSourceData('unknown', { type: 'FeatureCollection', features: [] });
            (0, chai_1.expect)(JSON.stringify(rt.style.sources.geojsonSrc)).to.equal(before);
        });
    });
    describe('setStyle', () => {
        it('replaces the entire style', () => {
            const newStyle = {
                version: 8,
                sources: { s: { type: 'geojson', data: {} } },
                layers: [{ id: 'only', type: 'background' }],
            };
            rt.setStyle(newStyle);
            (0, chai_1.expect)(rt.style.layers.map(l => l.id)).to.deep.equal(['only']);
        });
    });
});
//# sourceMappingURL=MBStyleRuntimeTest.js.map