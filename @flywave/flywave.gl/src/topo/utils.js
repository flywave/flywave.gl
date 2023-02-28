import * as THREE from "three";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import config from "../config";

var decalTexture = new THREE.TextureLoader();
export function makeEllipse(sides, center, p1, p2) {
    var origin = p1;

    var radiusPoint = p2;
    var points = [];

    var radius = Math.sqrt(2) * Math.abs(radiusPoint.y - origin.y) / 2;
    var rotatedAngle, x, y, ratio;
    var angle = Math.PI * ((1 / sides) - (1 / 2));
    var dx = radiusPoint.x - origin.x;
    var dy = radiusPoint.y - origin.y;

    if (dy === 0) {
        ratio = dx / (radius * Math.sqrt(2));
    } else {
        ratio = dx / dy;
    }

    for (var i = 0; i < sides; ++i) {
        rotatedAngle = angle + (i * 2 * Math.PI / this.sides);
        x = origin.x + ratio * (radius * Math.cos(rotatedAngle)) + dx / 2;
        y = origin.y + (radius * Math.sin(rotatedAngle)) + dy / 2;
        points[i] = new THREE.Vector2(x, y).add(center);
    }

    points[i] = points[0];
    return points;
}

export function makeCircle(sides, center, radius) {
    var points = [];

    var step = 360 / sides;
    for (var i = 0; i < 360; i += step) {
        var radians = (i + 1) * Math.PI / 180;
        points.push(new THREE.Vector2(Math.cos(radians) * radius + center.x, Math.sin(radians) * radius + center.y));
    }

    points[points.length - 1] = points[0];
    return points;
}

// "profile": {
//     "center": [
//       0,
//       0
//     ],
//     "radius": 0.1,
//     "type": "circ"
//   }
export function makeCircProfile(profile, steps) {
    return makeCircle(steps, new THREE.Vector2().fromArray(profile.center), profile.radius);
}

// "profile": {
//     "p1": [0,0,0],
//     "p2": [0,0,0],
//     "p3": [0,0,0],
//   }
export function makeTriangleProfile(profile) {
    return [
        new THREE.Vector2().fromArray(profile.p1),
        new THREE.Vector2().fromArray(profile.p2),
        new THREE.Vector2().fromArray(profile.p3),
    ]
}

// "profile": {
//     "p1": [0,0,0],
//     "p2": [0,0,0], 
//   }
export function makeRectangleProfile(profile) {
    return [
        new THREE.Vector2().fromArray(profile.p1),
        new THREE.Vector2().fromArray(profile.p2),
    ]
}

// "profile": {
//     "s1": [0,0,0],
//     "s2": [0,0,0],
//     "center":[0,0,0]
// }
export function makeElipsProfile(profile, sides) {
    var lx = new THREE.Vector2().fromArray(profile.s1);
    var sx = new THREE.Vector2().fromArray(profile.s2);
    var center = new THREE.Vector2().fromArray(profile.center);
    return makeEllipse(sides, center, lx, sx);
}

// "profile": {
//     "edges": [[0,0,0]...], 
// }
export function makePolygonProfile(profile) {
    const { edges } = profile;
    return edges.map(c => new THREE.Vector2(c[0], c[1]));
}

export function makeGeoCoordinatesToPath(projection, geoCoordinates, geoOrigin) {
    var originWorld = projection.projectPoint(geoOrigin);
    return geoCoordinates.map(coordinate => {
        var geocoord = new GeoCoordinates(coordinate[1], coordinate[0], coordinate[2] || 0);
        geocoord = projection.projectPoint(geocoord);
        return new THREE.Vector3().copy(geocoord).sub(originWorld);
    });
}

// {
//     "type": "pbr",
//     "color": [
//         0,
//         255,
//         0
//     ],
//     "transparency": 0,
//     "ambient": [
//         0,
//         0,
//         0
//     ],
//     "emissive": [
//         0,
//         0,
//         0
//     ],
//     "specular": [
//         1,
//         1,
//         0
//     ],
//     "shininess": 0.4,
//     "specularity": 0.3,
//     "roughness": 0.3,
//     "metallic": 0,
//     "reflectance": 0.8,
//     "ambient-occlusion": 0.4
// }
export function makeTopoMaterial(materials) {
    if (!(materials instanceof Array)) {
        materials = Object.values(materials);
    }
    for (var material of materials) {
        const { type, color, roughness, reflectance, shininess, emissive, ambient, specular, texture } = material;
        var mtl;
        switch (type) {
            case "pbr":
                mtl = new THREE.MeshStandardMaterial({
                    color: new THREE.Color().fromArray(color),
                    emissive: new THREE.Color().fromArray(emissive),
                    side: THREE.DoubleSide,
                    roughness,
                    refractionRatio: reflectance
                });
                break;
            case "lambert":
                mtl = new THREE.MeshLambertMaterial({
                    color: new THREE.Color().fromArray(color || [0, 0, 0]),
                    emissive: new THREE.Color().fromArray(emissive || [0, 0, 0]),
                    ambient: new THREE.Color().fromArray(ambient || [0, 0, 0]),
                    side: THREE.DoubleSide,
                    reflectivity: reflectance
                });
                break;

            case "phong":
                mtl = new THREE.MeshPhongMaterial({
                    // color: new THREE.Color().fromArray(color || [0, 0, 0]),
                    specular: new THREE.Color().fromArray(specular || [0, 0, 0]),
                    shininess,
                    reflectivity: reflectance,
                });
                break;
        }

        if (mtl && texture) {
            mtl.map = decalTexture.load(config.formatTopoTextureUrl(texture));
        }

        if (!mtl) {
            return new THREE.MeshBasicMaterial();
        }
        return mtl;
    }
}

export function makeTopoSection(topoSection) {
    switch (topoSection.type) {
        case "triangle":
            return makeTriangleProfile(topoSection);

        case "rectangle":
            return makeRectangleProfile(topoSection);

        case "circ":
            return makeCircProfile(topoSection, 20);

        case "ellipse":
            return makeElipsProfile(topoSection);

        case "polygon":
            return makePolygonProfile(topoSection);
    }
}