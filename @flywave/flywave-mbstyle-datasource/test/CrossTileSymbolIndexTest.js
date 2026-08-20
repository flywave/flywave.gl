"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const CrossTileSymbolIndex_1 = require("../src/CrossTileSymbolIndex");
describe('CrossTileSymbolIndex', () => {
    it('symbolKey is deterministic and differs for different text', () => {
        chai_1.assert.strictEqual((0, CrossTileSymbolIndex_1.symbolKey)('London'), (0, CrossTileSymbolIndex_1.symbolKey)('London'));
        chai_1.assert.notStrictEqual((0, CrossTileSymbolIndex_1.symbolKey)('London'), (0, CrossTileSymbolIndex_1.symbolKey)('Paris'));
    });
    it('assigns the same crossTileID to the same label at nearby positions (same zoom)', () => {
        const idx = new CrossTileSymbolIndex_1.CrossTileSymbolIndex();
        const a = idx.assignIDs('labels', [{
                localId: 'a', text: 'Hello',
                screenX: 100, screenY: 100, tileKey: '0:0', zoom: 5,
            }]);
        const b = idx.assignIDs('labels', [{
                localId: 'b', text: 'Hello',
                screenX: 102, screenY: 101, tileKey: '0:1', zoom: 5,
            }]);
        chai_1.assert.strictEqual(a.get('a'), b.get('b'), 'same label nearby should share crossTileID');
    });
    it('assigns different crossTileIDs to different labels', () => {
        const idx = new CrossTileSymbolIndex_1.CrossTileSymbolIndex();
        const ids = idx.assignIDs('labels', [
            { localId: 'a', text: 'Alpha', screenX: 100, screenY: 100, tileKey: '0:0', zoom: 5 },
            { localId: 'b', text: 'Beta', screenX: 100, screenY: 100, tileKey: '0:0', zoom: 5 },
        ]);
        chai_1.assert.notStrictEqual(ids.get('a'), ids.get('b'));
    });
    it('matches across zoom levels (parent tile inherits ID)', () => {
        const idx = new CrossTileSymbolIndex_1.CrossTileSymbolIndex();
        const parent = idx.assignIDs('labels', [{
                localId: 'p', text: 'City',
                screenX: 1000, screenY: 1000, tileKey: '4:0', zoom: 4,
            }]);
        const child = idx.assignIDs('labels', [{
                localId: 'c', text: 'City',
                screenX: 1000, screenY: 1000, tileKey: '5:0', zoom: 5,
            }]);
        chai_1.assert.strictEqual(parent.get('p'), child.get('c'), 'child should inherit parent crossTileID');
    });
    it('pruneStale removes tiles no longer present and frees IDs', () => {
        const idx = new CrossTileSymbolIndex_1.CrossTileSymbolIndex();
        idx.assignIDs('labels', [
            { localId: 'a', text: 'X', screenX: 10, screenY: 10, tileKey: '4:0', zoom: 4 },
            { localId: 'b', text: 'Y', screenX: 50, screenY: 50, tileKey: '4:1', zoom: 4 },
        ]);
        const removed = idx.pruneStale('labels', new Set(['4:0']));
        chai_1.assert.isAtLeast(removed, 1);
        chai_1.assert.strictEqual(idx.size, 1, 'one tile should remain after prune');
    });
    it('does not let one parent be claimed by two children (dedup)', () => {
        const idx = new CrossTileSymbolIndex_1.CrossTileSymbolIndex();
        const parent = idx.assignIDs('labels', [{
                localId: 'p', text: 'Dup',
                screenX: 200, screenY: 200, tileKey: '4:0', zoom: 4,
            }]);
        const c1 = idx.assignIDs('labels', [{
                localId: 'c1', text: 'Dup',
                screenX: 200, screenY: 200, tileKey: '5:0', zoom: 5,
            }]);
        const c2 = idx.assignIDs('labels', [{
                localId: 'c2', text: 'Dup',
                screenX: 500, screenY: 500, tileKey: '5:1', zoom: 5,
            }]);
        chai_1.assert.strictEqual(c1.get('c1'), parent.get('p'));
        chai_1.assert.notStrictEqual(c2.get('c2'), parent.get('p'), 'second child must get a fresh ID');
    });
});
//# sourceMappingURL=CrossTileSymbolIndexTest.js.map