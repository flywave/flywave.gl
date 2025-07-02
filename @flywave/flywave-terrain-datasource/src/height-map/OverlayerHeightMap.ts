import { GeoBox, GeoCoordinates, mercatorProjection } from "@flywave/flywave-geoutils";
import { booleanIntersects } from "@turf/boolean-intersects";
import * as turf from "@turf/turf";
import {
    Box2,
    Box3,
    ClampToEdgeWrapping,
    Color,
    LinearFilter,
    Texture,
    Vector2,
    Vector3,
    Vector4
} from "three";

import DEMData from "./dem/DemData";

interface HeightMapSource {
    dataProvider(): {
        clearTree(geoBox: GeoBox): void;
    };
    updateTileOverlayer(): void;
}

export type GeoJsonFeature = turf.Feature<turf.Polygon>;

export class OverlayerHeightMap {
    private readonly heightMapSource: HeightMapSource;
    private readonly canvas: HTMLCanvasElement;
    private readonly canvasContext: CanvasRenderingContext2D;
    private geojson?: GeoJsonFeature;
    private turfPolygon?: turf.Feature<turf.Polygon>;
    private digDepth: number = 0;
    private geoBox?: GeoBox;
    private _box?: Box2;
    private texture: Texture;
    private readonly _color: Color = new Color(0xffffff);
    private _digTexture?: Texture;

    get digTexture(): Texture | undefined {
        return this._digTexture;
    }

    setDigTexture(texture: Texture) {
        this._digTexture = texture;
    }

    public get box(): Box2 | undefined {
        return this._box;
    }

    public set box(box: Box2 | undefined) {
        this._box = box;
    }

    constructor(heightMapSource: HeightMapSource) {
        this.heightMapSource = heightMapSource;
        this.canvas = document.createElement("canvas");
        this.canvasContext = this.canvas.getContext("2d")!;
        this.texture = new Texture();
    }

    setGeojson(geojson: GeoJsonFeature | undefined, digDepth: number): void {
        this.geojson = geojson;
        this.digDepth = digDepth;
        if (this.geojson) {
            this.turfPolygon = turf.polygon(this.geojson.geometry.coordinates);
        }
        const preGeoBox = this.geoBox;
        if (preGeoBox) {
            this.heightMapSource.dataProvider().clearTree(preGeoBox);
        }
        this.draw();

        if (!this.geoBox) {
            return;
        }
        const boxB = new Box2();
        boxB.expandByPoint(new Vector2().fromArray(this.geoBox.southWest.toGeoPoint()));
        boxB.expandByPoint(new Vector2().fromArray(this.geoBox.northEast.toGeoPoint()));
        this.box = boxB;
    }

    getDigAltitude(lng: number, lat: number): number {
        if (!this.geojson || !this.turfPolygon) {
            return 0;
        }
        const point = turf.point([lng, lat]);
        return turf.booleanPointInPolygon(point, this.turfPolygon) ? this.digDepth : 0;
    }

    getBoxAltitude(geobox: Box3): number {
        if (!this.geojson || !this.turfPolygon) {
            return 0;
        }
        const [minx, miny] = geobox.min.toArray();
        const [maxx, maxy] = geobox.max.toArray();
        const bboxPolygon = turf.bboxPolygon([minx, miny, maxx, maxy]);
        return booleanIntersects(this.turfPolygon, bboxPolygon) ? this.digDepth : 0;
    }

    setDepth(digDepth: number): void {
        this.digDepth = digDepth;
    }

    draw(): void {
        if (!this.geojson) {
            this.texture = new Texture();
            this.heightMapSource.updateTileOverlayer();
            return;
        }

        // Calculate bounding box
        const [a, b, c, d] = turf.bbox(this.geojson);
        this.geoBox = new GeoBox(
            GeoCoordinates.fromGeoPoint([a, b, 0]),
            GeoCoordinates.fromGeoPoint([c, d, 0])
        );

        const canvas = this.canvas;
        const canvasContext = this.canvasContext;
        canvas.width = 256;
        canvas.height = 256;

        const { geojson } = this;

        const texture = new Texture(canvas);
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.generateMipmaps = false;
        texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
        texture.flipY = false;

        const box = mercatorProjection.projectBox(this.geoBox, new Box3());

        const coordinates = geojson.geometry.coordinates;
        const [r, g, blue] = DEMData.pack(this.digDepth);
        coordinates.forEach(polygon => {
            canvasContext.beginPath();
            canvasContext.fillStyle = `rgb(${[r, g, blue].join(",")}`;
            polygon.forEach(([lng, lat], index) => {
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

    private projectPointToPixel(
        point: GeoCoordinates,
        box: Box3,
        canvas: HTMLCanvasElement
    ): { x: number; y: number } {
        const { width, height } = canvas;
        const size = box.getSize(new Vector3());
        const projected = mercatorProjection
            .projectPoint(point, new Vector3())
            .sub(box.min)
            .divide(size)
            .multiply(new Vector3(width, height, 0));
        return { x: projected.x, y: projected.y };
    }

    setColor(color: Color | string | number): void {
        this._color.set(color);
    }

    get digColor(): Color {
        return this._color;
    }

    getBindTexture(tile: { geoBox: GeoBox }): [Texture, Vector4] {
        if (!this.geoBox) {
            return [this.texture, new Vector4(0, 0, 0, 0)];
        }

        const boxA = new Box2();
        boxA.expandByPoint(new Vector2().fromArray(tile.geoBox.southWest.toGeoPoint()));
        boxA.expandByPoint(new Vector2().fromArray(tile.geoBox.northEast.toGeoPoint()));

        const boxB = new Box2();
        boxB.expandByPoint(new Vector2().fromArray(this.geoBox.southWest.toGeoPoint()));
        boxB.expandByPoint(new Vector2().fromArray(this.geoBox.northEast.toGeoPoint()));

        return [this.texture, this.computeTextureUvTransfrom(boxA, boxB)];
    }

    private computeTextureUvTransfrom(tinProjGeoBox: Box2, dataBox: Box2): Vector4 {
        const textuProjGeoboxSize = new Vector2().subVectors(dataBox.max, dataBox.min);
        const tinProjGeoBoxSize = new Vector2().subVectors(tinProjGeoBox.max, tinProjGeoBox.min);

        const w = Math.abs(tinProjGeoBoxSize.x / textuProjGeoboxSize.x);
        const h = Math.abs(tinProjGeoBoxSize.y / textuProjGeoboxSize.y);

        const offsetY = (tinProjGeoBox.min.y - dataBox.min.y) / textuProjGeoboxSize.y;
        const offsetX = (tinProjGeoBox.min.x - dataBox.min.x) / textuProjGeoboxSize.x;

        return new Vector4(w, h, offsetX, offsetY);
    }
}
