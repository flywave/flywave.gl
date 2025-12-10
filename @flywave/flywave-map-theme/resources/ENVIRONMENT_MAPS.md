# Environment Maps in Flywave GL

Environment maps provide reflections and lighting for 3D objects in the scene. This document explains how to configure and use environment maps in Flywave GL themes.

## Overview

Environment maps are textures that define the lighting and reflections for the entire scene. Flywave GL supports multiple types of environment maps.

## Configuration

Environment maps are configured in the theme file using the `environment` property:

### Cube Map (传统立方体贴图)

```json
{
  "environment": {
    "urls": [
      "Sky_px.png",
      "Sky_nx.png",
      "Sky_py.png",
      "Sky_ny.png",
      "Sky_pz.png",
      "Sky_nz.png"
    ],
    "preload": true
  }
}
```

### Equirectangular Map (等距柱状投影贴图)

```json
{
  "environment": {
    "url": "environment.hdr",
    "preload": true
  }
}
```

### Properties

For Cube Map:
- `urls`: Array of six URLs for the cube map faces in this order:
  1. Positive X (+X) - Right face
  2. Negative X (-X) - Left face
  3. Positive Y (+Y) - Top face
  4. Negative Y (-Y) - Bottom face
  5. Positive Z (+Z) - Front face
  6. Negative Z (-Z) - Back face

For Equirectangular Map:
- `url`: URL to the equirectangular environment map image

For both types:
- `preload`: Optional boolean indicating whether to preload the environment map. Default is `false`.

## Usage Example

```typescript
const map = new MapView({
  canvas,
  theme: {
    extends: "resources/berlin_tilezen_envmap.json"
  }
});
```

## Technical Details

The environment map is loaded using Three.js loaders and set as the scene's environment property:

For Cube Maps:
```javascript
const cubeTextureLoader = new THREE.CubeTextureLoader();
const cubeTexture = cubeTextureLoader.load(resolvedUrls);
mapView.scene.environment = cubeTexture;
```

For Equirectangular Maps:
```javascript
const textureLoader = new THREE.TextureLoader();
const texture = textureLoader.load(resolvedUrl);
mapView.scene.environment = texture;
```

This enables physically-based rendering (PBR) materials to use the environment map for reflections and indirect lighting.

## Best Practices

1. **Image Format**: Use high-quality images in formats supported by browsers (PNG, JPEG, HDR, etc.)

2. **Image Size**: Keep individual face images reasonably sized to balance quality and performance

3. **Preloading**: Use `preload: true` for critical environment maps that should be loaded immediately

4. **File Organization**: Keep environment map files organized in the theme's resource directory

## File Naming Convention

### For Cube Maps
We recommend using the standard cube map naming convention:
- `Sky_px.png` - Positive X (right)
- `Sky_nx.png` - Negative X (left)
- `Sky_py.png` - Positive Y (top)
- `Sky_ny.png` - Negative Y (bottom)
- `Sky_pz.png` - Positive Z (front)
- `Sky_nz.png` - Negative Z (back)

### For Equirectangular Maps
Common naming conventions:
- `environment.hdr` - High dynamic range environment map
- `panorama.jpg` - JPEG format panorama