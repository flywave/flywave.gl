import * as turf from '@turf/turf';

function collectionPolygonPoints(points, feature, maxOutLineDistance) {
    var polygonOutLine = turf.lineString(feature.geometry.coordinates[0]);

    var retPoints = [];
    points.features.forEach(f => {
        if (f.geometry.type == 'Point') {
            var { properties: { dist, index } } = turf.nearestPointOnLine(polygonOutLine, f, { units: 'kilometers' });
            if (dist >= maxOutLineDistance) {
                retPoints.push(f.geometry.coordinates);
            }
        }
        if (f.geometry.type == 'MultiPoint') {
            f.geometry.coordinates.forEach(coordinate => {
                var { properties: { dist } } = turf.nearestPointOnLine(polygonOutLine, turf.point(coordinate), { units: 'kilometers' });
                if (dist >= maxOutLineDistance) {
                    retPoints.push(coordinate);
                }
            });
        }
    });

    return turf.multiPoint(retPoints);
}

export function randomPointInPolygon(feature, count, maxOutLineDistance) {
    maxOutLineDistance = maxOutLineDistance / 1000;
    const box = turf.bbox(feature);
    var points = turf.randomPoint(count, { bbox: box });
    var wpoints = turf.pointsWithinPolygon(points, feature);
    return collectionPolygonPoints(wpoints, feature, maxOutLineDistance);
}


export function gridPointInPolygon(feature, distance, maxOutLineDistance) {
    maxOutLineDistance = maxOutLineDistance / 1000;
    const box = turf.bbox(feature);
    var points = turf.pointGrid(box, distance, { mask: feature });

    return collectionPolygonPoints(points, feature, maxOutLineDistance);
}

export function polygonOutlinePoints(feature, dist) {
    dist = dist / 1000;
    const { geometry: { coordinates } } = feature;
    var lineFeature = turf.lineString(coordinates[0]);

    var popLine = turf.clone(lineFeature);
    popLine.geometry.coordinates.pop();

    var line = turf.lineChunk(popLine, dist, { units: 'kilometers' });

    var retPoints = [];
    line.features.forEach(line => {
        const { geometry: { coordinates: points } } = line;
        retPoints.push(...points);
    })
    return turf.multiPoint(retPoints);
}

export function lineChunkPoints(feature, lineDist) {
    lineDist = lineDist / 1000;
    var line = turf.lineChunk(feature, lineDist, { units: 'kilometers' });

    var retPoints = [];
    line.features.forEach(line => {
        const { geometry: { coordinates: points } } = line;
        retPoints.push(...points);
    })

    return turf.multiPoint(retPoints);
}
