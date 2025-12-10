/* Copyright (C) 2025 flywave.gl contributors */

import { type DrawableObject } from "./DrawableObject";

export enum DrawEventNames {
    DRAW_START = "drawstart",
    DRAW_END = "drawend",
    OBJECT_ADDED = "objectadded",
    OBJECT_REMOVED = "objectremoved",
    OBJECT_SELECTED = "objectselected",
    OBJECT_MODIFIED = "objectmodified",
    OBJECT_MODIFIED_END = "objectmodifiedend",
    MODE_CHANGED = "modechanged"
}

export interface DrawEvent {
    type: DrawEventNames;
    object?: DrawableObject;
    mode?: string;
}
