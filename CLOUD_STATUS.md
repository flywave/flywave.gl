# Cloud Rendering Status (cloud-wip branch)

## What This Is

Porting `@flywave/flywave-atmosphere` TSL/WebGPU cloud renderer to match `three-geospatial` GLSL/WebGL reference.

## Current State: All features implemented. Performance optimization pending.

## Feature Checklist

-   [x] marchOpticalDepth + marchClouds (main raymarch)
-   [x] Aerial perspective (luminance transfer)
-   [x] Haze (analytical fog)
-   [x] STBN jitter (blue noise ray jitter)
-   [x] Temporal accumulation (velocity reprojection + variance clipping, alpha=0.05)
-   [x] BSM shadow map (shadow march + temporal resolve + variance clipping)
-   [x] BSM per-cascade mipLevel [0.0, 0.5, 1.0, 2.0]
-   [x] Shadow PCF Vogel disk 8 samples
-   [x] Cascade fade transition (blend approach)
-   [x] marchShadowLength via BSM sampling (500 iterations)
-   [x] marchOpticalDepth Loop end 128 (dynamic break)
-   [x] Wind animation (code restored, velocity defaults to 0)
-   [x] Non-cloud pixel velocity computation
-   [ ] **Performance optimization (low fps → target 30+fps)**
-   [ ] Compile-time define equivalent (TSL limitation)

## Key Files

-   TSL impl: `@flywave/flywave-atmosphere/src/`
    -   `clouds/cloudTsl.ts` — all cloud shader logic (TSL)
    -   `clouds/CloudUniforms.ts` — uniforms
    -   `atmosphere/CloudRenderNode.ts` — render pipeline (passes, RTs, temporal)
    -   `atmosphere/AtmosphereContext.ts` — atmosphere context
-   Reference impl: `three-geospatial/packages/clouds/src/`
    -   `shaders/clouds.frag` — reference fragment shader
    -   `shaders/cloudsResolve.frag` — temporal resolve
    -   `shaders/shadow.frag` — BSM march
    -   `shaders/shadowResolve.frag` — BSM temporal resolve
-   Test page: `@flywave/flywave-examples/src/cloud-render/index.ts`
-   Reference storybook: `three-geospatial/storybook/src/clouds/Clouds-Debug.tsx`

## Test URLs

-   TSL (WebGPU): `http://localhost:8080/cloud-render.html`
-   Reference (WebGL): `http://localhost:4400/iframe.html?id=clouds-clouds--debug&viewModes=story`

## Render Pipeline (per frame, in CloudRenderNode.updateBefore)

1. BSM shadow march (3 cascades, each renders shadowRTs[i])
2. BSM temporal resolve (variance clipping + blit to history)
3. BSM blit → history
4. Low-res cloud render (MRT: color + velocity/frontDepth)
5. Resolve pass (temporal accumulation: velocity reprojection + variance clipping)
6. Blit resolve → history

## Key Bugs Fixed

1. TSL `remap` only takes 3 args (not 5 like GLSL)
2. `matrixViewToECEF` used wrong matrix multiplication
3. velocity reprojection precision: use `curUv - prevUv` (same projection path)
4. `ecefToWorld` uniform was never assigned (stayed identity) — now set in updateBefore
5. `_prevJitteredVP` camera jitter disabled (reference uses temporalUpscale=false)
6. `altitudeCorrection` missing in ecefToWorld velocity calc
7. **`_shadowMarch(i)` must be `_shadowMarch(i)()` — Fn requires explicit invocation**
8. marchOpticalDepth Loop end was hardcoded to 4 (now 128)
9. BSM shadow resolve missing variance clipping

## Performance Notes

-   TSL doesn't support `#define` — runtime `if` branches remain in compiled WGSL
-   Full-resolution rendering (reference uses temporalUpscale for 1/4 res)
-   Cascade fade uses blend approach (samples 2 cascades at boundary) vs reference's jitter selection

## Debugging Method

-   Exclusion method: modify both sides, add one feature at a time, compare visually
-   Note: WebGPU canvas cannot be read via 2D canvas `drawImage` — always shows black
-   Both sides must be modified in sync for fair comparison

## Git

-   Branch: `cloud-wip` (in @flywave/flywave-atmosphere)
-   three-geospatial submodule on `main`
