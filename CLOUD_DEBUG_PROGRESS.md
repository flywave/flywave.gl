# Cloud Rendering Debug Progress

## Current Status: ✅ Core Cloud Rendering Aligned

Both sides render clouds with matching:

-   Sun irradiance + multiple scattering
-   Sky irradiance + powder effect
-   Aerial perspective (getIndirectLuminanceToPoint)
-   Haze (approximateHaze with correct mix(), cameraHeight, shadowLength)
-   Temporal resolve (bayer, jitter, swap, varianceClipping)
-   Tone mapping (linear, exposure=1)

Disabled on both sides (reference medium preset doesn't use them):

-   BSM shadow (cascade textures empty on our side)
-   Ground bounce (maxIterationCountToGround=0)

Known minor difference:

-   磨砂感: our temporal resolve slightly more grainy (STBN loaded on our side but not reference's Clouds-Basic; no SMAA on our side)

## Key Fixes Applied

1. **TSL int type bug**: bayer computation entirely in float
2. **Y jitter flip**: WebGPU clip space Y requires negation
3. **TSL `.mix()` bug**: `.mix()` method doesn't work correctly, use `mix(a, b, t)` function form
4. **RT swap**: plain texture nodes + `.value` update (not OutputTextureNode)
5. **cameraHeight**: `length(pos+altitudeCorrection) - bottomRadius` (osculating sphere, ≈300m)
6. **hazeEnabled**: was never set (default 0), now initialized to 1
7. **STBN**: local loading from `/stbn.bin`
8. **Tone mapping**: `_toneMappingApplied` flag prevents VRM rebuild loop
9. **Deferred blit**: resolveRT→historyRT at start of next frame

## Modified Files

### Our Side

-   `CloudRenderNode.ts`: bayer float, Y jitter, swap, cameraHeight, hazeEnabled, deferred blit
-   `cloudTsl.ts`: sun/sky/powder/aerial perspective/haze restored, mix() fix
-   `cloud-mapview/index.ts`: tone mapping override, auto rotate button
-   `QualityPresets.ts`: hazeEnabled
-   `constants.ts`: STBN local URL
-   `stbn.bin`: copied to examples root

### Reference Side

-   `clouds.frag`: STEP 3 debug removed, BSM/ground bounce disabled
-   `cloudsResolve.frag`: full temporalUpscale
-   `qualityPresets.ts`: haze enabled
-   `Clouds-Basic.tsx`: exposure=1
