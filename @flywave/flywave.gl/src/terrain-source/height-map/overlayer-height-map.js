import { GeoBox, GeoCoordinates, mercatorProjection } from "@flywave/flywave-geoutils";
import { Texture, Box2, Vector2, Box3, Vector3, ClampToEdgeWrapping, LinearFilter } from "three";
import * as turf from "@turf/turf";
import DEMData from "./dem/dem_data";

export class OverlayerHeightMap {
    constructor(heightMapSource) {
        this.heightMapSource = heightMapSource;
    }
    canvas = document.createElement("canvas");
    canvasContext = this.canvas.getContext("2d");
    setGeojson(geojson, digDepth) {
        this.geojson = geojson;
        this.digDepth = digDepth;
        this.draw();
    }

    getDigAltitude(lng, lat) {
        if (!this.geojson) {
            return 0;
        }
        if (
            turf.booleanPointInPolygon(
                turf.point([lng, lat]),
                turf.polygon(this.geojson.geometry.coordinates)
            )
        ) {
            return this.digDepth;
        }
        return 0;
    }

    getDigPixelAltitude(geoBox) {
        if (!this.geojson) {
            return 0;
        }

        let boxA = new Box2();
        boxA.expandByPoint(new Vector2().fromArray(geoBox.southWest.toGeoPoint()));
        boxA.expandByPoint(new Vector2().fromArray(geoBox.northEast.toGeoPoint()));

        let boxB = new Box2();
        boxB.expandByPoint(new Vector2().fromArray(this.geoBox.southWest.toGeoPoint()));
        boxB.expandByPoint(new Vector2().fromArray(this.geoBox.northEast.toGeoPoint()));

        if (boxA.intersectsBox(boxB)) {
            return this.digDepth;
        }

        return 0;
    }

    getBoxAltitude(box) {
        if (!this.geojson) {
            return 0;
        }
        let boxB = new Box2();
        boxB.expandByPoint(new Vector2().fromArray(this.geoBox.southWest.toGeoPoint()));
        boxB.expandByPoint(new Vector2().fromArray(this.geoBox.northEast.toGeoPoint()));
        if (box.intersectsBox(boxB)) {
            return this.digDepth;
        }

        return 0;
    }

    setDepth(digDepth) {
        this.digDepth = digDepth;
    }

    draw() {
        if (!this.geojson) {
            this.texture = new Texture();
            this.heightMapSource.updateTileOverlayer();
            return;
        }
        {
            const [a, b, c, d] = turf.bbox(this.geojson);
            this.geoBox = new GeoBox(
                GeoCoordinates.fromGeoPoint([a, b, 0]),
                GeoCoordinates.fromGeoPoint([c, d, 0])
            );
        }

        let canvas = this.canvas;
        let canvasContext = this.canvasContext;
        canvas.width = 256;
        canvas.height = 256;

        const { geojson } = this;

        let texture = new Texture(canvas);
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.generateMipmaps = false;
        texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
        texture.flipY = false;

        const box = mercatorProjection.projectBox(this.geoBox, new Box3());

        const coordinates = geojson.geometry.coordinates;
        const [a, b, c, w] = DEMData.pack(this.digDepth);
        coordinates.forEach(p => {
            canvasContext.beginPath();
            canvasContext.fillStyle = `rgb(${[a, b, c].join(",")}`;
            p.forEach(([lng, lat], index) => {
                const { x, y } = this.projectPointToPixel(
                    GeoCoordinates.fromGeoPoint([lng, lat, 0]),
                    box,
                    canvas
                );
                if (index === 0) {
                    canvasContext.moveTo(x, y);
                } else {
                    canvasContext.lineTo(x, y);
                }
            });

            canvasContext.closePath();
            canvasContext.fill();
        });
        texture.needsUpdate = true;
        this.texture = texture;
        this.heightMapSource.updateTileOverlayer();
        this.heightMapSource.dataProvider().clearTree(this.geoBox);
    }

    projectPointToPixel(point, box, canvas) {
        const { width, height } = canvas;
        const size = box.getSize(new Vector3());
        return mercatorProjection
            .projectPoint(point, new THREE.Vector3())
            .sub(box.min)
            .divide(size)
            .multiply(new Vector3(width, height, 0));
    }

    _color = new THREE.Color(0xffffff);
    setColor(color) {
        this.digColor.set(color);
    }

    get digColor() {
        return this._color;
    }

    setDigTexture(texture) {
        this.digTexture = texture;
    }

    getBindTexture(tile) {
        if (!this.geoBox) {
            return [this.texture, new THREE.Vector4(0, 0, 0, 0)];
        }
        let boxA = new Box2();
        boxA.expandByPoint(new Vector2().fromArray(tile.geoBox.southWest.toGeoPoint()));
        boxA.expandByPoint(new Vector2().fromArray(tile.geoBox.northEast.toGeoPoint()));

        let boxB = new Box2();
        boxB.expandByPoint(new Vector2().fromArray(this.geoBox.southWest.toGeoPoint()));
        boxB.expandByPoint(new Vector2().fromArray(this.geoBox.northEast.toGeoPoint()));

        return [this.texture, this.computeTextureUvTransfrom(boxA, boxB)];
    }

    computeTextureUvTransfrom(tinProjGeoBox, dataBox) {
        var textuProjGeoboxSize = new THREE.Vector2().subVectors(dataBox.max, dataBox.min);
        var tinProjGeoBoxSize = new THREE.Vector2().subVectors(
            tinProjGeoBox.max,
            tinProjGeoBox.min
        );
        var w = Math.abs(tinProjGeoBoxSize.x / textuProjGeoboxSize.x);
        var h = Math.abs(tinProjGeoBoxSize.y / textuProjGeoboxSize.y);

        var offsetY = (tinProjGeoBox.min.y - dataBox.min.y) / textuProjGeoboxSize.y;
        var offsetX = (tinProjGeoBox.min.x - dataBox.min.x) / textuProjGeoboxSize.x;

        return new THREE.Vector4(w, h, offsetX, offsetY);
    }
}
