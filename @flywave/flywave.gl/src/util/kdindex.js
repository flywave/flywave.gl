// import {lengthToDegrees} from '@turf/helpers'
import geokdbush from 'geokdbush';
import KDBush from 'kdbush';

function Point(feature) {
  var coord = feature.geometry.coordinates;
  this.feature = feature;

  this.lon = coord[0];
  this.lat = coord[1];
}

function LineStringStart(feature) {
  var coord = feature.geometry.coordinates[0];
  this.type = 'start';
  this.feature = feature;

  this.lon = coord[0];
  this.lat = coord[1];
}

function LineStringEnd(feature) {
  var coord = feature.geometry.coordinates;
  this.type = 'end';
  this.feature = feature;
  var len = coord.length;
  this.lon = coord[len - 1][0];
  this.lat = coord[len - 1][1];
}

export default function findNear(features, lon, lat, radioMiles) {
  let kilometers = radioMiles/1000;
  let points = [];
  features.forEach(feature => {
    switch (feature.geometry.type) {
      case 'Point':
        points.push(new Point(feature));
        break;
      case 'LineString':
        points.push(new LineStringStart(feature));
        points.push(new LineStringEnd(feature));
        break;
    }
  })

  var results = {points: {}, starts: {}, ends: {}};
  var search = geokdbush.around(
      new KDBush(points, (p) => p.lon, (p) => p.lat), lon, lat, null, kilometers);

  search.forEach(element => {
    if (element instanceof Point) {
      results.points[element.feature.id] = element.feature;
    } else {
      if (element.type == 'start') {
        results.starts[element.feature.id] = element.feature;
      } else {
        results.ends[element.feature.id] = element.feature;
      }
    }
  });

  return {
    points: Object.values(results.points),
    starts: Object.values(results.starts),
    ends: Object.values(results.ends)
  };
}