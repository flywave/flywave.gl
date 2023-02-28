import * as THREE from "three";
import GLTFLoader from '../loaders/gltf-loader.js';

function SnapshotGltf(arraybuffer, width, height) {
  var decode = new GLTFLoader();

  return new Promise((reslove) => {
    decode.parse(arraybuffer, '', (e) => {
      reslove(renderSceneToImage(e.scene, width, height));
    });
  });
}

export {
  SnapshotGltf
}

export const fitCameraToObject = function(camera, object, nofar) {
  var offset = 1.25;

  const boundingBox = new THREE.Box3();

  // get bounding box of object - this will be used to setup controls and camera
  boundingBox.setFromObject(object);

  const center = new THREE.Vector3();
  boundingBox.getCenter(center);

  const size = new THREE.Vector3();
  boundingBox.getSize(size);  //(width, height, depth)

  // get the max side of the bounding box (fits to width OR height as needed )
  const maxDim = Math.max(size.x, size.y);
  const fov = camera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / (2 * Math.tan(fov / 2)));

  camera.position.copy(center);
  cameraZ *= offset;  // zoom out a little so that objects don't fill the screen

  camera.position.set(
      camera.position.x + cameraZ, camera.position.y + cameraZ, cameraZ);
  const minZ = boundingBox.min.z;
  const cameraToFarEdge = minZ < 0 ? -minZ + cameraZ : cameraZ - minZ;

  if (!nofar)
  camera.far = cameraToFarEdge * 3;
  camera.updateProjectionMatrix();

  camera.lookAt(center);
  camera.updateProjectionMatrix();
};

  function renderSceneToImage(object, WIDTH, HEIGHT) {
    // Set the scene size.
    // const WIDTH = 400;
    // const HEIGHT = 300;
    // Set some camera attributes.
    const VIEW_ANGLE = 45;
    const ASPECT = WIDTH / HEIGHT;
    const NEAR = 0.001;
    const FAR = 10000;

    // Create a renderer
    var renderer = new THREE.WebGLRenderer({
      preserveDrawingBuffer: true,
      antialias: true,
    });
    // CreateCamera
    const camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR);
    const scene = new THREE.Scene();
    // Set Gray Background
    scene.background = new THREE.Color(0xf0f0f0);
    // Add the camera to the scene.
    scene.add(camera);
    // Start the renderer.
    renderer.setSize(WIDTH, HEIGHT);

    // Add object to scene
    scene.add(object);
    // Set the object postion to (0,0,0)
    object.position.set(0, 0, 0);

    const pointLight = new THREE.PointLight(0xffffff);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);

    // add to the scene
    fitCameraToObject(camera, object);

    pointLight.position.set(
        camera.position.x, camera.position.y, camera.position.z);
    scene.add(pointLight);
    scene.add(ambientLight);
    // Draw!
    renderer.render(scene, camera);

    return renderer.domElement;
  }
