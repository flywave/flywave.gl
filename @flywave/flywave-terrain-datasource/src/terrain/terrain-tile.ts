import { DecodedTile, Geometry } from "@flywave/flywave-datasource-protocol";
import { GeoCoordinates, Projection, TileKey, TilingScheme } from "@flywave/flywave-geoutils";
import { DataSource, Tile, TileObject } from "@flywave/flywave-mapview";
import { TileFactory } from "@flywave/flywave-mapview-decoder";
import { Box3, BufferAttribute, BufferGeometry, Material, Mesh, Triangle, Vector3 } from "three";

import { ElevationMaterial } from "./elevation-styling";

export interface TerrainTileOptions {
    getTileMaterial?: (tile: TerrainTile, decodedTile: DecodedTile) => Promise<Material>;
    getCustomObjects?: (terrainTile: TerrainTile) => Promise<any> | void;
}

export class TerrainTileFactory extends TileFactory<TerrainTile> {
    private readonly options: TerrainTileOptions;

    constructor(options: TerrainTileOptions) {
        super(TerrainTile);
        this.options = options;
    }

    create(dataSource: DataSource, tileKey: TileKey): TerrainTile {
        return new TerrainTile(dataSource, tileKey, this.options);
    }
}

export class TerrainTile extends Tile {
    private readonly getTileMaterial?: (
        tile: TerrainTile,
        decodedTile: DecodedTile
    ) => Promise<Material>;

    private readonly getCustomObjects?: (tile: TerrainTile) => Promise<any> | void;
    private decodedTileGeometry: Geometry | null = null;
    private scaledPositionArray: Float32Array | null = null;
    private readonly tileSize: Vector3;

    constructor(dataSource: DataSource, tileKey: TileKey, options?: TerrainTileOptions) {
        super(dataSource, tileKey);

        this.getTileMaterial = options.getTileMaterial;
        this.getCustomObjects = options.getCustomObjects;

        this.decodedTileGeometry = null;
        this.scaledPositionArray = null;
        this.tileSize = this.getTileSize(
            this.tileKey,
            this.projection,
            this.dataSource.getTilingScheme()
        );
    }

    generateTileMaterial(decodedTile: DecodedTile) {
        return this.getTileMaterial
            ? this.getTileMaterial(this, decodedTile)
            : Promise.resolve(new ElevationMaterial(decodedTile));
    }

    getTileSize(tileKey: TileKey, projection: Projection, tilingScheme: TilingScheme) {
        const boundingBox = new Box3();
        const size = new Vector3();
        const geoBox = tilingScheme.getGeoBox(tileKey);

        projection.projectBox(geoBox, boundingBox);
        boundingBox.getSize(size);
        return size;
    }

    scaleVertices(
        positionArray: Float32Array,
        tileHeader: { maxHeight: number; minHeight: number },
        tileSize: Vector3
    ) {
        const xScale = tileSize.x;
        const yScale = tileSize.y;
        const zScale = tileHeader.maxHeight - tileHeader.minHeight;
        const scaledPositionArray = new Float32Array(positionArray.length);

        for (let i = 0; i < positionArray.length; i += 3) {
            scaledPositionArray[i] = positionArray[i] * xScale - tileSize.x / 2;
            scaledPositionArray[i + 1] = positionArray[i + 1] * yScale - tileSize.y / 2;
            scaledPositionArray[i + 2] = positionArray[i + 2] * zScale + tileHeader.minHeight;
        }

        return scaledPositionArray;
    }

    findVertexAttribute(attributeArray, name) {
        return attributeArray.find(attr => attr.name === name);
    }

    createObjects(decodedTile: DecodedTile, objects: TileObject[]) {
        this.decodedTileGeometry = decodedTile.geometries[0];

        const vertexPosition = this.findVertexAttribute(
            this.decodedTileGeometry.vertexAttributes,
            "position"
        );
        const buffer = vertexPosition.buffer;
        const metadata = vertexPosition.metadata;

        this.scaledPositionArray = this.scaleVertices(buffer, metadata, this.tileSize);

        this.generateTileMaterial(decodedTile).then(material =>
            this.createTileObjects(material, decodedTile.geometries[0], objects)
        );
        if (this.getCustomObjects) {
            Promise.resolve(this.getCustomObjects(this)).then(() =>
                this.dataSource.requestUpdate()
            );
        }
    }

    createTileObjects(material, decodedTileGeometry, objects) {
        const tileGeometry = new BufferGeometry();
        const tileMesh = new Mesh(tileGeometry, material);

        decodedTileGeometry.vertexAttributes.forEach(attr => {
            const buffer = attr.name === "position" ? this.scaledPositionArray : attr.buffer;

            tileGeometry.setAttribute(attr.name, new BufferAttribute(buffer, attr.itemCount));
        });

        if (decodedTileGeometry.index !== undefined) {
            tileGeometry.setIndex(new BufferAttribute(decodedTileGeometry.index.buffer, 1));
        }

        if (!tileGeometry.attributes.normal && !tileGeometry.attributes.octNormal) {
            tileGeometry.computeVertexNormals();
        }

        objects.push(tileMesh);

        this.dataSource.requestUpdate();
    }

    calculateLocalDisplacement(geoCoordinates: GeoCoordinates) {
        const worldCoordinates = this.projection.projectPoint(geoCoordinates, new Vector3());
        const localCoordinates = worldCoordinates.sub(this.center);

        const indexBuffer = new Uint32Array(this.decodedTileGeometry.index.buffer); // Convert to typed array
        const scaledPositionArray = this.scaledPositionArray;
        const displacement = new Vector3(0, 0, 0);

        for (let i = 0; i < indexBuffer.length; i += 3) {
            const index1 = indexBuffer[i] * 3;
            const index2 = indexBuffer[i + 1] * 3;
            const index3 = indexBuffer[i + 2] * 3;

            const v1 = new Vector3(
                scaledPositionArray[index1],
                scaledPositionArray[index1 + 1],
                scaledPositionArray[index1 + 2]
            );
            const v2 = new Vector3(
                scaledPositionArray[index2],
                scaledPositionArray[index2 + 1],
                scaledPositionArray[index2 + 2]
            );
            const v3 = new Vector3(
                scaledPositionArray[index3],
                scaledPositionArray[index3 + 1],
                scaledPositionArray[index3 + 2]
            );

            const triangle = new Triangle(v1, v2, v3);
            const planeTriangle = new Triangle(
                v1.clone().setZ(0),
                v2.clone().setZ(0),
                v3.clone().setZ(0)
            );

            if (planeTriangle.containsPoint(localCoordinates)) {
                const rationVector = planeTriangle.getBarycoord(localCoordinates, new Vector3());

                const displacementZ =
                    rationVector.x * triangle.a.z +
                    rationVector.y * triangle.b.z +
                    rationVector.z * triangle.c.z;

                displacement.set(localCoordinates.x, localCoordinates.y, displacementZ);

                break;
            }
        }

        return displacement;
    }

    addObject(geoCoordinates: GeoCoordinates, object: TileObject) {
        if (this.geoBox.contains(geoCoordinates)) {
            object.displacement = this.calculateLocalDisplacement(geoCoordinates);
            this.objects.push(object);
        }
    }
}

export { ElevationMaterial };
