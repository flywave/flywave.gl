import { Vector3, BufferGeometry, BufferAttribute } from "three";
import { GeoCoordinates } from "@flywave/flywave-geoutils";

export function makeGeoBox(
    { south, west, north, east, maxAltitude, minAltitude, center: geoCenter },
    projection
) {
    let center = projection.projectPoint(geoCenter, new Vector3());
    var a0 = projection
        .projectPoint(new GeoCoordinates(north, east, maxAltitude), new Vector3())
        .sub(center);
    var a1 = projection
        .projectPoint(new GeoCoordinates(south, east, maxAltitude), new Vector3())
        .sub(center);
    var a2 = projection
        .projectPoint(new GeoCoordinates(south, west, maxAltitude), new Vector3())
        .sub(center);

    var a3 = projection
        .projectPoint(new GeoCoordinates(north, west, maxAltitude), new Vector3())
        .sub(center);

    var a4 = projection
        .projectPoint(new GeoCoordinates(north, east, minAltitude), new Vector3())
        .sub(center);
    var a5 = projection
        .projectPoint(new GeoCoordinates(south, east, minAltitude), new Vector3())
        .sub(center);
    var a6 = projection
        .projectPoint(new GeoCoordinates(south, west, minAltitude), new Vector3())
        .sub(center);
    var a7 = projection
        .projectPoint(new GeoCoordinates(north, west, minAltitude), new Vector3())
        .sub(center);

    var geometry = new BufferGeometry();

    var index = [
        1, 2, 3, 1, 3, 0, 0, 3, 7, 0, 7, 4, 7, 6, 5, 5, 4, 7, 6, 2, 1, 1, 5, 6, 0, 4, 5, 1, 0, 5
    ];
    var position = [
        ...a0.toArray(),
        ...a1.toArray(),
        ...a2.toArray(),
        ...a3.toArray(),
        ...a4.toArray(),
        ...a5.toArray(),
        ...a6.toArray(),
        ...a7.toArray()
    ];

    geometry.setAttribute("position", new BufferAttribute(new Float32Array(position), 3));
    geometry.setIndex(new BufferAttribute(new Uint16Array(index), 1));

    return { geometry, center };
}
