/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Interface representing a Vector2.
 */
export interface Vector2Like {
    /**
     * The X position.
     */
    x: number;

    /**
     * The Y position.
     */
    y: number;
}

export function isVector2Like(v: any): v is Vector2Like {
    return v && typeof v.x === "number" && typeof v.y === "number";
}
