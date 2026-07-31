/* Copyright (C) 2025 flywave.gl contributors */

import { resolveResourceUrl } from "./resourceResolver";

export const STBN_TEXTURE_WIDTH = 128;
export const STBN_TEXTURE_HEIGHT = 128;
export const STBN_TEXTURE_DEPTH = 64;

export const DEFAULT_STARS_DATA_URL = resolveResourceUrl("resources/atmosphere/stars.bin");

export const IRRADIANCE_TEXTURE_WIDTH = 64;
export const IRRADIANCE_TEXTURE_HEIGHT = 16;
export const SCATTERING_TEXTURE_R_SIZE = 32;
export const SCATTERING_TEXTURE_MU_SIZE = 128;
export const SCATTERING_TEXTURE_MU_S_SIZE = 32;
export const SCATTERING_TEXTURE_NU_SIZE = 8;
export const SCATTERING_TEXTURE_WIDTH = SCATTERING_TEXTURE_NU_SIZE * SCATTERING_TEXTURE_MU_S_SIZE;
export const SCATTERING_TEXTURE_HEIGHT = SCATTERING_TEXTURE_MU_SIZE;
export const SCATTERING_TEXTURE_DEPTH = SCATTERING_TEXTURE_R_SIZE;
export const TRANSMITTANCE_TEXTURE_WIDTH = 256;
export const TRANSMITTANCE_TEXTURE_HEIGHT = 64;

export const METER_TO_LENGTH_UNIT = 1 / 1000;
/** @deprecated The render order of the sky shouldn't matter. */
export const SKY_RENDER_ORDER = 100;
