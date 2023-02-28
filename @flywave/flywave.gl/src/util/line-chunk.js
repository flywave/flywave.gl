import * as turf from "@turf/turf";
import * as THREE from "three";
import { GeoCoordinates } from "@flywave/flywave-geoutils";


export default function lineStringChunk(linestring, projection, distance, ignro) {
    var {
        geometry: {
            coordinates
        }
    } = linestring;
    var segments = [];
    var projLines = coordinates.map(coordinate => {
        return projection.projectPoint(GeoCoordinates.fromGeoPoint(coordinate), new THREE.Vector3());
    });

    var remainder = 0;
    var segmentIndex = [0];

    var lastEnd;
    var normal;
    var pos = projLines[0];
    segments.push(projection.unprojectPoint(pos).toGeoPoint());

    if (!distance) {
        return {
            segments: turf.multiPoint(segments),
            segmentIndex
        };
    }

    for (var i = 0; i < projLines.length - 1; i++) {
        var start = projLines[i].clone();
        var end = projLines[i + 1].clone();
        var v = new THREE.Vector3().subVectors(end, start);
        var lastV = new THREE.Vector3().subVectors(end, pos);

        var vLen = v.length();
        var lastLen = lastV.length();
        if (vLen < distance && lastLen < distance) {
            continue;
        }

        var normal = v.normalize();
        if (lastEnd) {
            var rem = new THREE.Vector3().subVectors(lastEnd, pos);
            var remNormal = rem.clone().normalize();
            var sinL = rem.dot(normal);
            var reml = rem.length();

            var del = new THREE.Vector3().dot(remNormal, normal);
            var l = Math.sin(Math.acos(del)) * reml;
            var posL = Math.sqrt(distance * distance - l * l) - sinL;
            var newpos = normal.clone().setLength(posL);
            newpos = newpos.add(start);

            var newNormal = new THREE.Vector3().subVectors(newpos, pos)
            newNormal.normalize()

            segments.push(projection.unprojectPoint(pos).toGeoPoint());
            pos = newpos;
            segmentIndex.push(i - 1);

            lastV = new THREE.Vector3().subVectors(end, pos)
        }


        while (true) {
            var lth = lastV.length();
            if (distance > lth) {
                if (lth > 0) {
                    lastEnd = end;
                }
                break
            }
            segments.push(projection.unprojectPoint(pos).toGeoPoint());
            segmentIndex.push(i);

            var dis = normal.clone().setLength(distance)
            pos = new THREE.Vector3().addVectors(dis, pos)
            lastV = new THREE.Vector3().subVectors(end, pos)
        }
    }
    return { segments: turf.multiPoint(segments), segmentIndex };
}