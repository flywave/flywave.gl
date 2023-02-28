import * as turf from "@turf/turf";


const transparentPngUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';

export function arrayBufferToImage(data: ArrayBuffer, callback: Callback<HTMLImageElement>) {
  const img: HTMLImageElement = new window.Image();
  const URL = window.URL;
  img.onload = () => {
    callback(null, img);
    URL.revokeObjectURL(img.src);
    // prevent image dataURI memory leak in Safari;
    // but don't free the image immediately because it might be uploaded in the next frame
    // https://github.com/mapbox/mapbox-gl-js/issues/10226
    img.onload = null;
    window.requestAnimationFrame(() => { img.src = transparentPngUrl; });
  };
  img.onerror = () => callback(new Error('Could not load image. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported.'));
  const blob: Blob = new window.Blob([new Uint8Array(data)], { type: 'image/png' });
  img.src = data.byteLength ? URL.createObjectURL(blob) : transparentPngUrl;
}

export function arrayBufferToImageBitmap(data: ArrayBuffer, callback: Callback<ImageBitmap>) {
  const blob: Blob = new window.Blob([new Uint8Array(data)], { type: 'image/png' });
  window.createImageBitmap(blob).then((imgBitmap) => {
    callback(null, imgBitmap);
  }).catch((e) => {
    callback(new Error(`Could not load image because of ${e.message}. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported.`));
  });
}

/**
 * constrain n to the given range via min + max
 *
 * @param n value
 * @param min the minimum value to be returned
 * @param max the maximum value to be returned
 * @returns the clamped value
 * @private
 */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

const warnOnceHistory = {};

export function warnOnce(message) {
  if (!warnOnceHistory[message]) {
    // console isn't defined in some WebWorkers, see #2558
    if (typeof console !== "undefined") console.warn(message);
    warnOnceHistory[message] = true;
  }
}
/**
 * Return the previous power of two, or the input value if already a power of two
 * @private
 */
export function prevPowerOfTwo(value) {
  if (value <= 1) return 1;
  return Math.pow(2, Math.floor(Math.log(value) / Math.LN2));
}

export function getCanvasPosition(event, canvas) {
  const { left, top } = canvas.getBoundingClientRect();
  return {
    x: event.clientX - Math.floor(left),
    y: event.clientY - Math.floor(top),
  };
}

export function insertPathVertex(coordinates, loc, index, repeat) {

  function isCoordEq(n1, n2, coords) {
    coords = coords || coordinates;
    n1 = coords[n1];
    n2 = coords[n2];
    return (n1[0] - n2[0]).toFixed(11) == 0 && (n1[1] - n2[1]).toFixed(11) == 0;
  }

  function pathIsClose() {
    return coordinates.length > 1 && isCoordEq(0, coordinates.length - 1);
  }

  var nodes = coordinates.slice();
  if (pathIsClose()) {
    // leading connectors..
    var i = 1;
    while (i < nodes.length && nodes.length > 2 &&
      isCoordEq(i, 0, nodes)) {
      nodes.splice(i, 1);
      if (index > i) index--;
    }

    // trailing connectors..
    i = nodes.length - 1;
    while (i > 0 && nodes.length > 1 && isCoordEq(i, 0, nodes)) {
      nodes.splice(i, 1);
      if (index > i) index--;
      i = nodes.length - 1;
    }
  }


  function noRepeatNodes(node, i, arr) {
    return i === 0 || !isCoordEq(i, i - 1, nodes);
  }

  nodes.splice(index < 0 ? nodes.length : index, 0, loc);
  if (nodes.length > 2 && !repeat) nodes = nodes.filter(noRepeatNodes);

  // If the way was closed before, append a connector node to keep it closed..
  if (pathIsClose() &&
    (nodes.length === 1 || !isCoordEq(0, nodes.length - 1, nodes))) {
    nodes.push(nodes[0]);
  }

  return nodes;
}

export function updateGeometryCoordinatesByPath(coordinates, coordinate, path, closed) {
  path = path.slice();

  if (!path.length) {
    coordinates.splice(0, coordinate.length, ...coordinate)
    return;
  }
  while (path.length) {
    var index = path.shift();
    if (index == -1) {
      index = coordinates.length - 1;
      if (closed) {
        index--;
      }
    }

    if (path.length == 0) {
      coordinates[index] = coordinate;
      break;
    }
    coordinates = coordinates[index];
  }
}


function pathIsClose(coordinates) {
  function isCoordEq(n1, n2, coords) {
    coords = coords || coordinates;
    n1 = coords[n1];
    n2 = coords[n2];
    return (n1[0] - n2[0]).toFixed(11) == 0 && (n1[1] - n2[1]).toFixed(11) == 0;
  }
  return coordinates.length > 1 && isCoordEq(0, coordinates.length - 1);
}

export function removeGeometryCoordinate(coordinates, path) {

  path = path.slice();

  while (path.length) {
    var index = path.shift();
    if (path.length == 0) {
      if (pathIsClose(coordinates)) {
        index = coordinates.length - 2;
      }
      coordinates.splice(index, 1);
      break;
    }
    coordinates = coordinates[index];
  }
}

export function insertGeometryCoordinateByPath(coordinates, coordinate, path) {
  path = path.slice();
  while (path.length) {
    var index = path.shift();
    if (path.length == 0) {
      coordinates.splice(0, coordinates.length + 1, ...insertPathVertex(coordinates, coordinate, index, true));
      break;
    }
    coordinates = coordinates[index];
  }
}

export function findGeometryCoordinateByPath(coordinates, path) {
  path = path.slice();
  while (path.length) {
    var index = path.shift();
    if (index == -1) {
      index = coordinates.length - 1;
    }
    if (path.length == 0) {
      return coordinates[index];
    }
    coordinates = coordinates[index];
  }
  return coordinates;
}

export function findFeatureVertex(feature, point) {
  const { geometry, geometry: { type } } = feature;

  var lines = [];

  if (type == "MultiLineString") {
    geometry.coordinates.forEach((line, index) => {
      lines.push({ indexPath: [index], near: turf.nearestPointOnLine(turf.lineString(line), point) });
    });
  }

  if (type == "LineString") {
    lines.push({ indexPath: [], near: turf.nearestPointOnLine(turf.lineString(geometry.coordinates), point) });
  }

  if (type == "Polygon") {
    geometry.coordinates.forEach((line, index) => {
      lines.push({ indexPath: [index], near: turf.nearestPointOnLine(turf.lineString(line), point) });
    });
  }

  if (type == "MultiPolygon") {
    geometry.coordinates.forEach((plines, index) => {
      plines.forEach((line, sindex) => {
        lines.push({ indexPath: [index, sindex], near: turf.nearestPointOnLine(turf.lineString(line), point) });
      });
    });
  }
  if (type == "Point" || type == "MultiPoint") {
    return;
  }

  var chooseLine =
    lines.sort((a, b) => {
      const { near: { properties: { dist } } } = a;
      const { near: { properties: { dist: dis2 } } } = b;
      return dist - dis2;
    })[0];

  const { near: { geometry: { coordinates }, properties: { index } }, indexPath } = chooseLine;

  return {
    coordinates: coordinates.concat([point[2]]), indexPath: indexPath.concat([index + 1])
  };
}