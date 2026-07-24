# Cloud Rendering Status (cloud-wip branch)

## What This Is

Porting `@flywave/flywave-atmosphere` TSL/WebGPU cloud renderer to match `three-geospatial` GLSL/WebGL reference.

## Current State: All rendering features aligned. Performance optimization pending.

## Feature Checklist

-   [x] marchOpticalDepth + marchClouds (main raymarch)
-   [x] marchOpticalDepth Loop end 128 (dynamic break, was hardcoded 4)
-   [x] rayStartTexelsPerPixel: pow(2, mipLevel) (was hardcoded 1)
-   [x] Aerial perspective (luminance transfer)
-   [x] Haze (analytical fog)
-   [x] STBN jitter (blue noise ray jitter)
-   [x] Temporal accumulation (velocity reprojection + variance clipping, alpha=0.05)
-   [x] BSM shadow map (shadow march + temporal resolve + variance clipping)
-   [x] BSM per-cascade mipLevel [0.0, 0.5, 1.0, 2.0]
-   [x] BSM PCF radius: sun angle scaling remap(sunDotNormal, 0.1, 0.0)
-   [x] Shadow PCF Vogel disk 8 samples (was 5-tap)
-   [x] Cascade fade transition (blend approach)
-   [x] shadowBottomHeight (was using minHeight)
-   [x] Light shafts / God rays (marchShadowLength via BSM sampling, 500 iterations)
-   [x] Wind animation (code restored + velocity set in test page)
-   [x] Ground bounce irradiance (projected to ground position)
-   [x] getMipLevel: uniform mipLevelScale (was hardcoded 0.1, default 1.0)
-   [x] haze phaseFunction attenuation 1.0 (was 0.2)
-   [x] Non-cloud pixel velocity computation
-   [x] \_shadowMarch(i)() — Fn explicit invocation fix
-   [ ] **Performance optimization (low fps → target 30+fps)**

## Key Files

-   TSL impl: `@flywave/flywave-atmosphere/src/`
    -   `clouds/cloudTsl.ts` — all cloud shader logic (TSL)
    -   `clouds/CloudUniforms.ts` — uniforms
    -   `atmosphere/CloudRenderNode.ts` — render pipeline (passes, RTs, temporal)
    -   `atmosphere/AtmosphereContext.ts` — atmosphere context
-   Reference impl: `three-geospatial/packages/clouds/src/`
    -   `shaders/clouds.frag` — reference fragment shader
    -   `shaders/clouds.glsl` — shared cloud functions (sampleWeather, sampleMedia, etc.)
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

## Key Bugs Fixed (chronological)

1. TSL `remap` only takes 3 args (not 5 like GLSL)
2. `matrixViewToECEF` used wrong matrix multiplication
3. velocity reprojection precision: use `curUv - prevUv` (same projection path) not `screenUV - prevUv`
4. `ecefToWorld` uniform was never assigned (stayed identity) — now set in updateBefore
5. `_prevJitteredVP` camera jitter disabled (reference uses temporalUpscale=false)
6. `altitudeCorrection` missing in ecefToWorld velocity calc
7. `_shadowMarch(i)` must be `_shadowMarch(i)()` — Fn requires explicit invocation
8. marchOpticalDepth Loop end was hardcoded to 4 (now 128)
9. BSM shadow resolve missing variance clipping
10. rayStartTexelsPerPixel hardcoded to 1 (now pow(2, mipLevel))
11. BSM PCF radius missing sun angle scaling
12. ground bounce irradiance not projected to ground position
13. getMipLevel hardcoded mipLevelScale=0.1 (now uniform, default 1.0)
14. haze phaseFunction attenuation 0.2 (now 1.0)
15. shadowBottomHeight missing (used minHeight instead)

## Known Minor Differences (low impact)

-   Cascade fade uses blend approach (TSL can't dynamically index sampleCascade functions)
-   Haze irradiance uses per-pixel LUT (reference uses vertex precomputed vGroundIrradiance)
-   raySphereSecondIntersection discriminant < 0 handling slightly different
-   TSL doesn't support #define — runtime if branches remain in compiled WGSL
-   Full-resolution rendering (reference uses temporalUpscale for 1/4 res)

## Performance Notes

-   ~40fps currently (was 2fps, optimized by previous session)
-   TSL doesn't support `#define` — runtime `if` branches remain in compiled WGSL
-   Full-resolution rendering (reference uses temporalUpscale for 1/4 res)
-   marchShadowLength 500 iterations with BSM sampling per pixel

## Debugging Method

-   Exclusion method: modify both sides, add one feature at a time, compare visually
-   Note: WebGPU canvas cannot be read via 2D canvas `drawImage` — always shows black
-   Both sides must be modified in sync for fair comparison
-   Use commented-out code (not deleted) for exclusion testing

## Git

-   Branch: `cloud-wip` (in @flywave/flywave-atmosphere)
-   three-geospatial submodule on `main`
-   This project prohibits git commands by AI (see AGENTS.md) — but user can run them
