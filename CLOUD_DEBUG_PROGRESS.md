# Cloud Rendering Debug Progress

## Goal

Port `@flywave/flywave-atmosphere` (TSL/WebGPU) cloud renderer to visually match `three-geospatial` (GLSL/WebGL) reference implementation, using **exclusion method**: incrementally add components on BOTH sides, verifying at each step.

## Test Pages

-   **Ours**: `http://127.0.0.1:8080/cloud-mapview.html` (MapView, RTE, WebGPU)
-   **Reference**: `http://127.0.0.1:4400/iframe.html?id=clouds-clouds--basic&viewMode=story` (R3F, ECEF, WebGL)

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

## Current Status: ✅ Visually Aligned (Minor Differences)

Both sides now render clouds with matching density, lighting, brightness, and temporal resolve. Reference appears slightly smoother (likely due to texelFetch vs UV-based texture sampling in varianceClipping).

## Completed Steps

### STEP 0: Fixed Gray ✅

-   Both output `vec4(0.5, 0.5, 0.5, 1)` — tone mapping aligned
-   **Key finding**: VRM default `toneMappingMode = "agx-punchy"` + `exposure = 3` was never overridden. `setToneMapping({ mode: "none" })` didn't work because `"none"` is not in the `ToneMappingMode` enum. Fix: force VRM config every frame via `updateCameras` hook until it sticks (`_toneMappingApplied` flag).

### STEP 1: rayNearFar (intersection) ✅

-   Both output `rayNear / 200000` (R channel)
-   Gradient distribution matches, Y-flipped (WebGPU top-down vs WebGL bottom-up)

### STEP 2: marchClouds alpha (density shape) ✅

-   Both output `vec3(color.a)` as grayscale — shapes match
-   Raymarch density/lighting fully aligned

### STEP 3: Full color output ✅

-   Both output `vec4(color.rgb, 1.0)` — brightness and color match

### STEP 4: Temporal resolve ✅

-   Bayer pattern, history accumulation, reprojection, varianceClipping all working
-   Result visually matches reference

## Confirmed Fixes

### Fix 1: MapView.updateCameras() overrides near/far/fov ✅

**File**: `CloudRenderNode.ts:updateBefore()` (~line 755)
MapView dynamically sets near=146, far=615, fov=40 each frame. Override to near=1, far=4e5, fov=75.

### Fix 2: Tone mapping override ✅

**File**: `cloud-mapview/index.ts`
VRM defaults to `agx-punchy` + exposure=3. Override to `linear` + exposure=1 via `applyToneMappingOverride()` hook on `updateCameras`. Uses `_toneMappingApplied` flag to avoid repeated `needsUpdate` (which causes stars.bin infinite reload + WebGPU crash).

### Fix 3: TSL int type bug in bayer pattern ✅

**File**: `CloudRenderNode.ts` resolve pass (~line 1000)
TSL `.equal()` and `.mod()` on int types produce incorrect results in WGSL. Rewrote entire bayer computation in **float only** using `.floor()`, `.sub()`, `.lessThan()`, `.select()`.

### Fix 4: Y jitter flip for WebGPU ✅

**File**: `CloudRenderNode.ts` jitter section (~line 770)
WebGPU clip space Y is top-down (opposite of WebGL). Jitter Y must be **negated**: `jitterDy = -((oy - 0.5) / virtualHeight) * 4`. Without this, horizontal lines appear in temporal accumulation.

### Fix 5: historyNode/resolveNodeTex as plain texture nodes ✅

**File**: `CloudRenderNode.ts` constructor (~line 589)
Changed from `outputTexture(this, rt.texture)` to plain `texture(rt.texture)` for historyNode and resolveNodeTex. OutputTextureNode triggers circular owner build in blit/separate pass contexts. Plain texture nodes allow `.value` swap (matches TemporalAntialiasNode pattern).

### Fix 6: RT swap instead of blit ✅

**File**: `CloudRenderNode.ts` updateBefore (~line 843)
Replaced blit pass with RT pointer swap (matches reference CloudsPass.swapBuffers + TemporalAntialiasNode). After resolve pass writes to resolveRT, swap `this.resolveRT ↔ this.historyRT` and update `.value` on texture nodes.

### Fix 7: Low-res nearest texel sampling ✅

**File**: `CloudRenderNode.ts` resolve pass (~line 1007)
Use `floor(fullCoord / 4)` + `+0.5 / lowResSize` to compute exact low-res texel center UV, matching reference's `texelFetch(colorBuffer, lowResCoord, 0)`.

### Fix 8: stars.bin infinite reload ✅

**File**: `cloud-mapview/index.ts`
`applyToneMappingOverride()` set `vrm.needsUpdate = true` every frame, causing pipeline rebuild → SkyNode recreation → stars.bin re-download → WebGPU crash. Fixed with `_toneMappingApplied` flag.

### Fix 9: Low-res color sampling bypass ✅

**File**: `CloudRenderNode.ts` resolve pass
Previously used `texture(lowResNode, screenUV)` (bilinear at full-res UV on low-res texture → blurry). Changed to nearest-texel UV calculation.

## Modified Files

### Our Side

| File                     | Changes                                                       | Status |
| ------------------------ | ------------------------------------------------------------- | ------ |
| `CloudRenderNode.ts`     | Fix 1: jitterCamera near/far/fov override                     | ✅     |
| `CloudRenderNode.ts`     | Fix 3: float-only bayer computation                           | ✅     |
| `CloudRenderNode.ts`     | Fix 4: Y jitter flip                                          | ✅     |
| `CloudRenderNode.ts`     | Fix 5: plain texture nodes for history/resolve                | ✅     |
| `CloudRenderNode.ts`     | Fix 6: RT swap instead of blit                                | ✅     |
| `CloudRenderNode.ts`     | Fix 7+9: nearest low-res texel sampling                       | ✅     |
| `CloudRenderNode.ts`     | Full temporal resolve (reprojection + varianceClipping)       | ✅     |
| `cloud-mapview/index.ts` | Fix 2+8: tone mapping override with \_toneMappingApplied flag | ✅     |

### Reference Side

| File                 | Changes                                                            | Status |
| -------------------- | ------------------------------------------------------------------ | ------ |
| `clouds.frag`        | `outputColor = vec4(color.rgb, 1.0)` (alpha forced to 1 for debug) | ✅     |
| `cloudsResolve.frag` | Restored full temporalUpscale                                      | ✅     |

## Known Minor Differences

1.  **Reference slightly smoother**: varianceClipping uses `textureOffset` (integer texel offsets, GPU-exact) while our `_varianceClippingUV` uses UV + texelSize multiplication (float approximation). Could improve by using TSL `textureLoad` with integer coordinates.
2.  **Top edge artifact**: Thin line at top of our screen (floor boundary pixel). Cosmetic, doesn't affect cloud rendering.

## What To Do Next

1.  Tag current state as baseline
2.  Optionally improve varianceClipping precision (texelFetch equivalent in TSL)
3.  Restore reference side `clouds.frag` alpha to original value (remove debug override)
4.  Test with camera movement (velocity reprojection)
5.  Re-enable shadow (BSM) pass comparison
