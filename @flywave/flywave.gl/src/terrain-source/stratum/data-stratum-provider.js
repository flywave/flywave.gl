import { DataTerrainProvider } from "../tin-terrain/data-terrain-provider";
import { TinMeshResourceTile, TinMeshLoader } from "../tin-terrain/tin-terrain-loader";

class StratumResourceTile extends TinMeshResourceTile {
    builderQuantized(tinData) {
        this.tinData = tinData;
        const { position3DAndHeight, textureCoordAndEncodedNormals, indices, center } =
            tinData._mesh;
        var geometry = new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.setAttribute("position", new THREE.BufferAttribute(position3DAndHeight, 3));
        // geometry.setAttribute("position3DAndHeight", new THREE.BufferAttribute(position3DAndHeight, 4));
        geometry.setAttribute(
            "textureCoordAndEncodedNormals",
            new THREE.BufferAttribute(textureCoordAndEncodedNormals, 4)
        );

        this.geometry = geometry;

        this.tinCenter = new THREE.Vector3(center.x, center.y, center.z);
    }
}

class DataStratumProvider extends DataTerrainProvider {
    makeLoaderTile(tileKey, parentTileTinData) {
        var tile = new StratumResourceTile(this.dataSource, tileKey);
        tile.tileKey.level = tile.tileKey.level - 1;
        tile.geoBox = this.tilingScheme.getGeoBox(tile.tileKey);
        tile.tileLoader = new TinMeshLoader(
            this.dataSource,
            tileKey,
            tile,
            this.dataSource.decoder,
            parentTileTinData
        );
        return tile;
    }
}

export { DataStratumProvider };
