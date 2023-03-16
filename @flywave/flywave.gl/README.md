# flywave.gl
 

```javascript

CONST {Application,GeoCoordinates} = FlywaveGl;

config.ANCHOR_INFO_URL = "http://127.0.0.1:8000/api/v1/topo/{mesh_id}";
config.TOPO_MESH_URL = "http://127.0.0.1:8000/api/v1/topo";
config.BASE_PATH = "./dist";

var app = new Application({
    target: new GeoCoordinates(
        36.82749, 117.59765
    ),
    zoomLevel: 17,
    canvas: document.getElementById("container")
});
 
app.addMaterialProviders(new MapboxSatelliteMaterialProvider(`
pk.eyJ1IjoidzEyNTk0ODIyIiwiYSI6IkVfSkVqMGMifQ.av8k0fqnXvMFo1ThyV9KMQ`));

```