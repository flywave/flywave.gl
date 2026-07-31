import { assert } from 'chai';
import { CrossTileSymbolIndex, symbolKey } from '../src/CrossTileSymbolIndex';

describe('CrossTileSymbolIndex', () => {
    it('symbolKey is deterministic and differs for different text', () => {
        assert.strictEqual(symbolKey('London'), symbolKey('London'));
        assert.notStrictEqual(symbolKey('London'), symbolKey('Paris'));
    });

    it('assigns the same crossTileID to the same label at nearby positions (same zoom)', () => {
        const idx = new CrossTileSymbolIndex();
        const a = idx.assignIDs('labels', [{
            localId: 'a', text: 'Hello',
            screenX: 100, screenY: 100, tileKey: '0:0', zoom: 5,
        }]);
        // Same label, slightly shifted position (within tolerance), different tile.
        const b = idx.assignIDs('labels', [{
            localId: 'b', text: 'Hello',
            screenX: 102, screenY: 101, tileKey: '0:1', zoom: 5,
        }]);
        assert.strictEqual(a.get('a'), b.get('b'), 'same label nearby should share crossTileID');
    });

    it('assigns different crossTileIDs to different labels', () => {
        const idx = new CrossTileSymbolIndex();
        const ids = idx.assignIDs('labels', [
            { localId: 'a', text: 'Alpha', screenX: 100, screenY: 100, tileKey: '0:0', zoom: 5 },
            { localId: 'b', text: 'Beta', screenX: 100, screenY: 100, tileKey: '0:0', zoom: 5 },
        ]);
        assert.notStrictEqual(ids.get('a'), ids.get('b'));
    });

    it('matches across zoom levels (parent tile inherits ID)', () => {
        const idx = new CrossTileSymbolIndex();
        // Coarse tile (zoom 4)
        const parent = idx.assignIDs('labels', [{
            localId: 'p', text: 'City',
            screenX: 1000, screenY: 1000, tileKey: '4:0', zoom: 4,
        }]);
        // Finer tile (zoom 5) covering the same area
        const child = idx.assignIDs('labels', [{
            localId: 'c', text: 'City',
            screenX: 1000, screenY: 1000, tileKey: '5:0', zoom: 5,
        }]);
        assert.strictEqual(parent.get('p'), child.get('c'), 'child should inherit parent crossTileID');
    });

    it('pruneStale removes tiles no longer present and frees IDs', () => {
        const idx = new CrossTileSymbolIndex();
        idx.assignIDs('labels', [
            { localId: 'a', text: 'X', screenX: 10, screenY: 10, tileKey: '4:0', zoom: 4 },
            { localId: 'b', text: 'Y', screenX: 50, screenY: 50, tileKey: '4:1', zoom: 4 },
        ]);
        const removed = idx.pruneStale('labels', new Set(['4:0']));
        assert.isAtLeast(removed, 1);
        assert.strictEqual(idx.size, 1, 'one tile should remain after prune');
    });

    it('does not let one parent be claimed by two children (dedup)', () => {
        const idx = new CrossTileSymbolIndex();
        const parent = idx.assignIDs('labels', [{
            localId: 'p', text: 'Dup',
            screenX: 200, screenY: 200, tileKey: '4:0', zoom: 4,
        }]);
        // First child claims the parent ID
        const c1 = idx.assignIDs('labels', [{
            localId: 'c1', text: 'Dup',
            screenX: 200, screenY: 200, tileKey: '5:0', zoom: 5,
        }]);
        // Second child at a different position should NOT get the same parent ID
        const c2 = idx.assignIDs('labels', [{
            localId: 'c2', text: 'Dup',
            screenX: 500, screenY: 500, tileKey: '5:1', zoom: 5,
        }]);
        assert.strictEqual(c1.get('c1'), parent.get('p'));
        assert.notStrictEqual(c2.get('c2'), parent.get('p'), 'second child must get a fresh ID');
    });
});
