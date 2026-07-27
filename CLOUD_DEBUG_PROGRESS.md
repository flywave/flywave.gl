# Cloud Rendering Debug Progress

## Goal

Port `@flywave/flywave-atmosphere` (TSL/WebGPU) cloud renderer to visually match `three-geospatial` (GLSL/WebGL) reference implementation, using **exclusion method**: incrementally add components on BOTH sides, verifying at each step.

## Test Pages

-   **Ours**: `http://127.0.0.1:8080/cloud-mapview.html` (MapView, RTE, WebGPU)
-   **Reference**: `http://127.0.0.1:4400/iframe.html?id=clouds-clouds--basic&viewMode=story` (R3F, ECEF, WebGL)

## Current Status: ✅ Lighting Restored (BSM/GroundBounce/Haze Pending)

Both sides now render clouds with matching sun irradiance, sky irradiance, powder effect, and aerial perspective. Remaining differences:

1. **磨砂感**: Our temporal resolve has slightly more grain (STBN loaded on our side but not reference's Clouds-Basic; no SMAA on our side)
2. **BSM Shadow**: Disabled on both sides (needs cascade setup implementation)
3. **Ground Bounce**: Disabled on both sides (needs approximateRadianceFromGround port)
4. **Haze**: Disabled on both sides (needs hazeRayNearFar intersection port)

## Camera Alignment

Hardcoded in `cloud-mapview/index.ts` (captured from R3F via browser console):

```ts
camPos = [4529606.670615005, 2614762.716348598, 3638805.5858316943];
camQuat = [0.341611239061481, 3.177626864111724e-11, -0.42250890119681356, 0.8395165214314373];
camUp = [0.7094064060180906, 0.40957597947938945, 0.5735765582152];
(fov = 75), (near = 1), (far = 4e5);
```

## Sun Time Alignment

```ts
// dayOfYear=1, timeOfDay=9.0, longitude=30 → Jan 2 07:00 UTC
const epoch = Date.UTC(year, 0, 1, 0, 0, 0, 0);
const offset = longitude / 15;
sunTime = epoch + (dayOfYear * 24 + timeOfDay - offset) * 3600000;
```

## Completed Steps

### STEP 0: Tone Mapping ✅

-   VRM default `agx-punchy` + exposure=3 overridden to `linear` + exposure=1
-   `_toneMappingApplied` flag prevents repeated `needsUpdate` (stars.bin crash fix)

### STEP 1: Raymarch Density/Lighting ✅

-   Bayer pattern, jitter, density shape, media sampling all aligned
-   Key fix: TSL int type bug — bayer computed entirely in float
-   Key fix: Y jitter flip for WebGPU clip space

### STEP 2: Temporal Resolve ✅

-   RT swap + texture node `.value` update (matches TemporalAntialiasNode pattern)
-   `historyNode`/`resolveNodeTex` as plain `texture()` nodes (not OutputTextureNode)
-   Deferred blit at start of next frame for cross-frame data
-   Full varianceClipping + getClosestFragment + reprojection
-   Note: Slight grain difference remains (STBN + SMAA mismatch)

### STEP 3: Sun Irradiance + Multiple Scattering ✅

-   `sunIrradiance * approximateMultipleScattering(opticalDepth, cosTheta)`
-   Both sides aligned

### STEP 4: Sky Irradiance ✅

-   `skyIrradiance * RECIPROCAL_PI4 * skyGradient * skyLightScale`
-   Both sides aligned

### STEP 5: Powder Effect ✅

-   `radiance *= 1.0 - powderScale * exp(-extinction * powderExponent)`
-   Both sides aligned

### STEP 6: Aerial Perspective ✅

-   `getIndirectLuminanceToPoint` for cloud inscattering/transmittance
-   Key: returns `luminanceTransferStruct`, use `.get("luminance")` not `.get("radiance")`
-   Parameters: `position * worldToUnit` (no altitudeCorrection double-add)

## Pending Steps

### STEP 7: BSM Shadow (TODO)

-   `sampleShadowOpticalDepth` implemented but cascade matrices/intervals not set up
-   BSM render pass exists in CloudRenderNode but textures may be empty
-   Needs: shadow cascade setup, shadowFar, shadowIntervals configuration

### STEP 8: Ground Bounce (TODO)

-   `approximateRadianceFromGround` not implemented in TSL
-   Needs: marchOpticalDepth toward ground, getGroundSunSkyIrradiance port

### STEP 9: Haze (TODO)

-   `approximateHaze` implemented in TSL but ray intersection differs
-   Needs: `getHazeRayNearFar` port (haze uses different intersection than clouds)

## Confirmed Fixes

### Fix 1: MapView camera override

**File**: `CloudRenderNode.ts:updateBefore()`
Override near=1, far=4e5, fov=75 each frame.

### Fix 2: Tone mapping override

**File**: `cloud-mapview/index.ts`
`_toneMappingApplied` flag, force VRM `linear` + exposure=1.

### Fix 3: TSL int type bug in bayer pattern

**File**: `CloudRenderNode.ts` resolve pass
Rewrote bayer computation entirely in float (`.floor()`, `.sub()`, `.lessThan()`, `.select()`).

### Fix 4: Y jitter flip for WebGPU

**File**: `CloudRenderNode.ts` jitter section
`jitterDy = -((oy - 0.5) / virtualHeight) * 4`

### Fix 5: historyNode/resolveNodeTex as plain texture nodes

**File**: `CloudRenderNode.ts` constructor
Changed from `outputTexture()` to `texture()` for swappable nodes.

### Fix 6: RT swap instead of blit

**File**: `CloudRenderNode.ts` updateBefore
Swap resolveRT ↔ historyRT, update `.value` on texture nodes.

### Fix 7: STBN local loading

**File**: `constants.ts`
Changed STBN URL to `/stbn.bin` (local), copied file to examples root.

### Fix 8: HAZE identification

**File**: `qualityPresets.ts` (reference)
`haze: true` was causing the "cloud glow" effect. Now identified and disabled for comparison.

## Modified Files

### Our Side

| File                     | Changes                                                 | Status |
| ------------------------ | ------------------------------------------------------- | ------ |
| `CloudRenderNode.ts`     | Fix 1-6: camera, bayer, jitter, swap, texture nodes     | ✅     |
| `cloudTsl.ts`            | Sun/sky irradiance, powder, aerial perspective restored | ✅     |
| `cloud-mapview/index.ts` | Fix 2: tone mapping override                            | ✅     |
| `QualityPresets.ts`      | hazeEnabled: false                                      | ✅     |
| `constants.ts`           | Fix 7: STBN local URL                                   | ✅     |

### Reference Side

| File                           | Changes                                         | Status |
| ------------------------------ | ----------------------------------------------- | ------ |
| `clouds.frag`                  | STEP 3 EXCLUSION (no BSM/groundBounce), alpha=1 | ✅     |
| `cloudsResolve.frag`           | Full temporalUpscale restored                   | ✅     |
| `cloudsEffect.frag`            | Original alpha blend                            | ✅     |
| `aerialPerspectiveEffect.frag` | Original code restored                          | ✅     |
| `qualityPresets.ts`            | haze: false                                     | ✅     |
| `Clouds-Basic.tsx`             | exposure: 1                                     | ✅     |
