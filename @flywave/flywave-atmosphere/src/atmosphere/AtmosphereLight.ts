/* Copyright (C) 2025 flywave.gl contributors */

import { renderGroup, uniform } from "three/tsl";
import { DirectionalLight } from "three/webgpu";

export type AtmosphereLightBody = "sun" | "moon";

export class AtmosphereLight extends DirectionalLight {
    override readonly type = "AtmosphereLight";

    distance: number; // Distance to the target position.
    body: AtmosphereLightBody;

    direct = uniform(true).setGroup(renderGroup);
    indirect = uniform(true).setGroup(renderGroup);

    constructor(distance = 1, body: AtmosphereLightBody = "sun") {
        super();
        this.distance = distance;
        this.body = body;
    }
}
