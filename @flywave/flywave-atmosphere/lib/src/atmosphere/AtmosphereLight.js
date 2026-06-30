/* Copyright (C) 2025 flywave.gl contributors */
import { DirectionalLight } from "three";
import { renderGroup, uniform } from "three/tsl";
export class AtmosphereLight extends DirectionalLight {
    constructor(distance = 1, body = "sun") {
        super();
        this.type = "AtmosphereLight";
        this.direct = uniform(true).setGroup(renderGroup);
        this.indirect = uniform(true).setGroup(renderGroup);
        this.distance = distance;
        this.body = body;
    }
}
//# sourceMappingURL=AtmosphereLight.js.map