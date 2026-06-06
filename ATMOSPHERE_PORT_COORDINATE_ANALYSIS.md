# Bruneton Atmosphere Port: Coordinate System Analysis

## 1. RTE (Relative-To-Eye) System Overview

### How flywave-mapview rendering works

```
MapView.ts:3344-3347:
  this.m_rteCamera.copy(this.m_camera);      // Same rotation, FOV, etc.
  this.m_rteCamera.position.setScalar(0);     // Placed at world origin
  this.m_rteCamera.updateMatrixWorld(true);   // Recompute world matrix
  this.m_rteCamera.projectionMatrix.copy(this.m_camera.projectionMatrix); // Same projection
```

-   **m_camera** (public): at ECEF position `cam_ecef`, rotation `R`
-   **m_rteCamera** (rendering): at origin `(0,0,0)`, same rotation `R`
-   **Geometry offset**: All scene geometry is translated by `-cam_ecef` (pure translation, NO rotation)
    -   A point at ECEF `P_ecef` appears at `P_rte = P_ecef - cam_ecef` in the RTE scene
-   **Depth buffer**: Identical to standard rendering (same projection matrix, same view-space Z)

### Key matrices

| Matrix               | m_camera (standard)      | m_rteCamera (RTE) |
| -------------------- | ------------------------ | ----------------- |
| `matrixWorld`        | `[R \| cam_ecef]`        | `[R \| 0]`        |
| `matrixWorldInverse` | `[R^T \| -R^T*cam_ecef]` | `[R^T \| 0]`      |
| `projectionMatrix`   | `P`                      | `P` (same)        |
| `cameraPosition`     | `cam_ecef`               | `(0, 0, 0)`       |

---

## 2. The `worldToECEFMatrix` Uniform

### Purpose

Converts shader "world space" positions/directions to ECEF for the Bruneton scattering math.

### Required transformation: RTE → ECEF

Since RTE is pure translation from ECEF:

```
P_ecef = P_rte + cam_ecef    (no rotation involved)
D_ecef = D_rte               (directions unchanged by translation)
```

Therefore:

```
worldToECEFMatrix * vec4(P_rte, 1) = P_ecef = P_rte + cam_ecef
worldToECEFMatrix * vec4(D_rte, 0) = D_ecef = D_rte
```

**The correct matrix is:**

```
worldToECEFMatrix = [ I | cam_ecef ]    (identity rotation, camera position translation)
```

### BUG in current implementation

```typescript
// Celestia.ts — CURRENT (WRONG):
this.worldToECEFMatrix.identity();
this.worldToECEFMatrix.extractRotation(rteCamera.matrixWorld);  // ← extracts R
this.worldToECEFMatrix.setPosition(camera.position.x, ...);     // ← sets cam_ecef
// Result: [ R | cam_ecef ]  ← DOUBLE ROTATION BUG
```

### Proof of bug

The postprocessing library sets `inverseViewMatrix` uniform = `camera.matrixWorld`:

```
Standard: inverseViewMatrix = [R | cam_ecef]
RTE:      inverseViewMatrix = [R | 0]        (rteCamera.matrixWorld)
```

**Vertex shader camera ray** (`aerialPerspectiveEffect.vert`):

```glsl
// Perspective path:
vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
vec4 worldDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
origin = cameraPosition;          // RTE: (0,0,0)
direction = worldDirection.xyz;   // = R * inverseProjection * ndc

// ECEF conversion:
cameraPositionECEF = (worldToECEFMatrix * vec4(origin, 1.0)).xyz;
rayDirectionECEF  = (worldToECEFMatrix * vec4(direction, 0.0)).xyz;
```

| Value                | Standard (WTM=I) | RTE correct (WTM=[I | T])                  | RTE buggy (WTM=[R | T]) |
| -------------------- | ---------------- | ------------------- | -------------------- | ----------------- | --- |
| `origin`             | `cam_ecef`       | `(0,0,0)`           | `(0,0,0)`            |
| `direction`          | `R * viewDir`    | `R * viewDir`       | `R * viewDir`        |
| `cameraPositionECEF` | `cam_ecef` ✅    | `cam_ecef` ✅       | `cam_ecef` ✅        |
| `rayDirectionECEF`   | `R * viewDir` ✅ | `R * viewDir` ✅    | **R² \* viewDir** ❌ |

**Fragment shader world position** (`aerialPerspectiveEffect.frag`):

```glsl
vec3 worldPosition = screenToView(...);  // view space
worldPosition = (inverseViewMatrix * vec4(worldPosition, 1.0)).xyz;
// Standard: R * viewPos + cam_ecef  (ECEF)
// RTE:      R * viewPos             (RTE space)

vec3 worldPositionECEF = (worldToECEFMatrix * vec4(worldPosition, 1.0)).xyz;
// Correct ECEF = R * viewPos + cam_ecef

// With WTM=[I|T]: (R*viewPos) + cam_ecef ✅
// With WTM=[R|T]: R*(R*viewPos) + cam_ecef = R²*viewPos + cam_ecef ❌
```

### Fix

```typescript
// Celestia.ts — CORRECT:
this.worldToECEFMatrix.identity();
this.worldToECEFMatrix.setPosition(camera.position.x, camera.position.y, camera.position.z);
// Result: [ I | cam_ecef ]  ← no rotation, just translation
```

---

## 3. SkyLightProbe Position in RTE Scene

### Problem

```typescript
// Celestia.ts — CURRENT (WRONG):
this.skyLightProbe.position.copy(this.mapView.camera.position);
// Sets probe to cam_ecef in RTE scene
// But in RTE, camera is at origin, so probe is at 2*cam_ecef from camera
```

### How it's used

```typescript
// SkyLightProbe.ts:
const cameraPosition = this.getWorldPosition(vectorScratch1);
const cameraPositionECEF = cameraPosition.applyMatrix4(worldToECEFMatrix);
// getWorldPosition() returns position in RTE scene space
// worldToECEFMatrix converts to ECEF
```

### Fix

```typescript
this.skyLightProbe.position.set(0, 0, 0);
// In RTE scene, camera is at origin
// [I|cam_ecef] * (0,0,0,1) = cam_ecef ✅
```

---

## 4. SunDirectionalLight Target in RTE Scene

### Problem

```typescript
// Celestia.ts — CURRENT (WRONG):
this.mapView.scene.add(this.sunDirectionalLight.target);
// target.position defaults to (0,0,0) in scene — actually CORRECT by default!
// BUT updateSunDirectionalLight overrides position incorrectly
```

### How update() works

```typescript
// SunDirectionalLight.ts:
update(): void {
    const ecefToWorldRotation = rotationScratch
        .setFromMatrix4(worldToECEFMatrix).transpose();
    this.position
        .copy(this.sunDirection)         // ECEF sun direction
        .applyMatrix3(ecefToWorldRotation) // [I|T] → ecefToWorldRotation = I
        .normalize()
        .multiplyScalar(this.distance)
        .add(this.target.position);      // target at (0,0,0) in RTE → origin
}
```

With `worldToECEFMatrix = [I|T]`:

-   `ecefToWorldRotation = I`
-   `position = sunDirection * distance + (0,0,0) = sunDirection * distance` ✅
-   Light direction = `normalize(0 - sunDirection * distance) = -sunDirection` ✅

### Fix

Remove manual position override — let `update()` handle it:

```typescript
private updateSunDirectionalLight(): void {
    if (this.sunDirectionalLight) {
        this.sunDirectionalLight.worldToECEFMatrix.copy(this.worldToECEFMatrix);
        this.sunDirectionalLight.sunDirection.copy(this.sunDirectionECEF);
        this.sunDirectionalLight.update();  // Computes correct position automatically
    }
}
```

---

## 5. Shader Coordinate Flow Summary

### Vertex Shader (fullscreen quad)

```
NDC position
  ↓ inverseProjectionMatrix
View-space direction
  ↓ inverseViewMatrix (= matrixWorld = [R|0])
RTE world-space direction = R * viewDir
  ↓ worldToECEFMatrix * vec4(dir, 0) = [I|T] * (dir, 0)
ECEF direction = R * viewDir  (correct: same as standard rendering)

cameraPosition = (0,0,0) [RTE origin]
  ↓ worldToECEFMatrix * vec4(pos, 1) = [I|T] * (0,0,0,1)
ECEF camera position = cam_ecef  (correct)
```

### Fragment Shader (aerial perspective)

```
Depth buffer (same as standard)
  ↓ screenToView()
View-space position
  ↓ inverseViewMatrix * vec4(viewPos, 1) = [R|0] * (viewPos, 1)
RTE world position = R * viewPos
  ↓ worldToECEFMatrix * vec4(rtePos, 1) = [I|T] * (R*viewPos, 1)
ECEF position = R * viewPos + cam_ecef  (correct)
```

---

## 6. Logarithmic Depth Buffer

The system uses `logarithmicDepthBuffer: true`. The atmosphere shaders read the depth buffer:

```glsl
// shaders/core/index.ts — depth chunk:
float reverseLogDepth(const float depth, const float near, const float far) {
    #if defined(USE_LOGDEPTHBUF) || defined(USE_LOGARITHMIC_DEPTH_BUFFER)
    float d = pow(2.0, depth * log2(far + 1.0)) - 1.0;
    float a = far / (far - near);
    float b = far * near / (near - far);
    return a + b / d;
    #else
    return depth;
    #endif
}
```

When `USE_LOGDEPTHBUF` is defined by Three.js, this correctly reverses the logarithmic encoding. No changes needed — the depth reconstruction is handled.

Note: The atmosphere post-processing effect does NOT write to gl_FragDepth, so it doesn't need logarithmic depth output encoding. It only reads depth as input.

---

## 7. Bruneton Coordinate System

The Bruneton scattering model operates in a coordinate system centered at Earth's center:

-   Origin: Earth center
-   Unit: meters (scaled by `METER_TO_LENGTH_UNIT` = 1/ATMOSPHERE.bottomRadius in shader)
-   Z-up convention (WGS84 ECEF)

All scattering functions (GetSkyRadiance, GetTransmittance, etc.) expect positions and directions in this ECEF frame. The `worldToECEFMatrix` uniform is the bridge from the rendering coordinate system (RTE) to ECEF.

---

## 8. Summary of Required Fixes

| #   | File                                      | Issue                                          | Fix                                                |
| --- | ----------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| 1   | `Celestia.ts:updateWorldToECEFMatrix()`   | `extractRotation(rteCamera)` → double rotation | Remove extractRotation, use identity + setPosition |
| 2   | `Celestia.ts:setupSkyLightProbe()`        | position = camera.position (ECEF)              | position = (0,0,0) (RTE origin)                    |
| 3   | `Celestia.ts:updateSkyLightProbe()`       | position.copy(camera.position)                 | position.set(0, 0, 0)                              |
| 4   | `Celestia.ts:updateSunDirectionalLight()` | Manual position override                       | Remove; let SunDirectionalLight.update() handle it |
| 5   | No change needed                          | Depth buffer, logarithmic depth                | Already handled by shader depth chunk              |
