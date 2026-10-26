/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Built-in LUT presets shipped in `@flywave/flywave-map-theme/resources/lut/`
 * and served next to the other runtime assets (`resources/lut/**`). Relative
 * paths resolve through the MapView uriResolver at apply time.
 *
 * Ported verbatim from `src/color-grading-lut/index.ts` so upcoming examples
 * can reference the table without importing the example entry; the original
 * example will be switched to this module in a later wave.
 */
export const LUT_PRESETS: Record<LutPresetName, string> = {
    None: "",
    "PresetPro Cinematic (.3dl)": "resources/lut/presetpro-cinematic.3dl",
    "Django 25 (.cube)": "resources/lut/django-25.cube",
    "Blackmagic 4.6K Film (.cube)": "resources/lut/blackmagic-4.6k-film-extended-video.cube",
    "Fuji 160C": "resources/lut/fuji-160c.png",
    "Fuji 800Z": "resources/lut/fuji-800z.png",
    "Fuji FP-100C": "resources/lut/fuji-fp100c.png",
    "Kodak E-100 GX": "resources/lut/kodak-e100-gx.png",
    "Agfa Vista 200": "resources/lut/agfa-vista-200.png",
    "Agfa Precisa 100": "resources/lut/agfa-precisa-100.png",
    "Agfa Ultra Color 100": "resources/lut/agfa-ultra-color-100.png"
};

/**
 * Names of the built-in LUT presets, usable as dat.GUI dropdown choices:
 * `gui.add(state, "preset", Object.keys(LUT_PRESETS))`.
 */
export type LutPresetName =
    | "None"
    | "PresetPro Cinematic (.3dl)"
    | "Django 25 (.cube)"
    | "Blackmagic 4.6K Film (.cube)"
    | "Fuji 160C"
    | "Fuji 800Z"
    | "Fuji FP-100C"
    | "Kodak E-100 GX"
    | "Agfa Vista 200"
    | "Agfa Precisa 100"
    | "Agfa Ultra Color 100";
