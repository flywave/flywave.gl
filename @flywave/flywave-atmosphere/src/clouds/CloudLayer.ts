// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import { Vector3, Vector4 } from "three";

export interface DensityProfileLike {
    expTerm?: number;
    exponent?: number;
    linearTerm?: number;
    constantTerm?: number;
}

export class DensityProfile {
    constructor(
        public expTerm = 0,
        public exponent = 0,
        public linearTerm = 0.75,
        public constantTerm = 0.25
    ) {}

    set(expTerm = 0, exponent = 0, linearTerm = 0.75, constantTerm = 0.25): this {
        this.expTerm = expTerm;
        this.exponent = exponent;
        this.linearTerm = linearTerm;
        this.constantTerm = constantTerm;
        return this;
    }

    clone(): DensityProfile {
        return new DensityProfile(this.expTerm, this.exponent, this.linearTerm, this.constantTerm);
    }

    copy(other: DensityProfileLike): this {
        this.expTerm = other.expTerm ?? 0;
        this.exponent = other.exponent ?? 0;
        this.linearTerm = other.linearTerm ?? 0.75;
        this.constantTerm = other.constantTerm ?? 0.25;
        return this;
    }
}

export type TextureChannel = "r" | "g" | "b" | "a";

export interface CloudLayerLike {
    channel?: TextureChannel;
    altitude?: number;
    height?: number;
    densityScale?: number;
    shapeAmount?: number;
    shapeDetailAmount?: number;
    weatherExponent?: number;
    shapeAlteringBias?: number;
    coverageFilterWidth?: number;
    shadow?: boolean;
    densityProfile?: DensityProfileLike;
}

export class CloudLayer {
    static readonly DEFAULT = new CloudLayer();

    channel: TextureChannel = "r";
    altitude = 0;
    height = 0;
    densityScale = 0.2;
    shapeAmount = 1;
    shapeDetailAmount = 1;
    weatherExponent = 1;
    shapeAlteringBias = 0.35;
    coverageFilterWidth = 0.6;
    densityProfile = new DensityProfile();
    shadow = false;

    constructor(options?: CloudLayerLike) {
        this.set(options);
    }

    set(options?: CloudLayerLike): this {
        if (!options) return this;
        if (options.channel != null) this.channel = options.channel;
        if (options.altitude != null) this.altitude = options.altitude;
        if (options.height != null) this.height = options.height;
        if (options.densityScale != null) this.densityScale = options.densityScale;
        if (options.shapeAmount != null) this.shapeAmount = options.shapeAmount;
        if (options.shapeDetailAmount != null) this.shapeDetailAmount = options.shapeDetailAmount;
        if (options.weatherExponent != null) this.weatherExponent = options.weatherExponent;
        if (options.shapeAlteringBias != null) this.shapeAlteringBias = options.shapeAlteringBias;
        if (options.coverageFilterWidth != null)
            this.coverageFilterWidth = options.coverageFilterWidth;
        if (options.shadow != null) this.shadow = options.shadow;
        if (options.densityProfile != null) this.densityProfile.copy(options.densityProfile);
        return this;
    }

    clone(): CloudLayer {
        return new CloudLayer(this);
    }

    copy(other: CloudLayer): this {
        this.channel = other.channel;
        this.altitude = other.altitude;
        this.height = other.height;
        this.densityScale = other.densityScale;
        this.shapeAmount = other.shapeAmount;
        this.shapeDetailAmount = other.shapeDetailAmount;
        this.weatherExponent = other.weatherExponent;
        this.shapeAlteringBias = other.shapeAlteringBias;
        this.coverageFilterWidth = other.coverageFilterWidth;
        this.densityProfile.copy(other.densityProfile);
        this.shadow = other.shadow;
        return this;
    }
}

interface IntervalEntry {
    value: number;
    flag: 0 | 1;
}

interface Interval {
    min: number;
    max: number;
}

const _entries: IntervalEntry[] = Array.from({ length: 8 }, () => ({ value: 0, flag: 0 }));
const _intervals: Interval[] = Array.from({ length: 3 }, () => ({ min: 0, max: 0 }));

function compareEntries(a: IntervalEntry, b: IntervalEntry): number {
    return a.value !== b.value ? a.value - b.value : a.flag - b.flag;
}

export class CloudLayers extends Array<CloudLayer> {
    static readonly DEFAULT = new CloudLayers([
        {
            channel: "r",
            altitude: 750,
            height: 650,
            densityScale: 0.2,
            shapeAmount: 1,
            shapeDetailAmount: 1,
            weatherExponent: 1,
            shapeAlteringBias: 0.35,
            coverageFilterWidth: 0.6,
            shadow: true
        },
        {
            channel: "g",
            altitude: 1000,
            height: 1200,
            densityScale: 0.2,
            shapeAmount: 1,
            shapeDetailAmount: 1,
            weatherExponent: 1,
            shapeAlteringBias: 0.35,
            coverageFilterWidth: 0.6,
            shadow: true
        },
        {
            channel: "b",
            altitude: 7500,
            height: 500,
            densityScale: 0.003,
            shapeAmount: 0.4,
            shapeDetailAmount: 0,
            weatherExponent: 1,
            shapeAlteringBias: 0.35,
            coverageFilterWidth: 0.5,
            shadow: true
        },
        { channel: "a", shadow: true }
    ]);

    constructor(options?: readonly CloudLayerLike[]) {
        super(
            new CloudLayer(options?.[0]),
            new CloudLayer(options?.[1]),
            new CloudLayer(options?.[2]),
            new CloudLayer(options?.[3])
        );
    }

    set(options?: readonly CloudLayerLike[]): this {
        this[0].set(options?.[0]);
        this[1].set(options?.[1]);
        this[2].set(options?.[2]);
        this[3].set(options?.[3]);
        return this;
    }

    get localWeatherChannels(): string {
        return this[0].channel + this[1].channel + this[2].channel + this[3].channel;
    }

    packValues(key: keyof CloudLayer, result: Vector4): Vector4 {
        return result.set(
            this[0][key] as number,
            this[1][key] as number,
            this[2][key] as number,
            this[3][key] as number
        );
    }

    packSums(a: keyof CloudLayer, b: keyof CloudLayer, result: Vector4): Vector4 {
        return result.set(
            (this[0][a] as number) + (this[0][b] as number),
            (this[1][a] as number) + (this[1][b] as number),
            (this[2][a] as number) + (this[2][b] as number),
            (this[3][a] as number) + (this[3][b] as number)
        );
    }

    packDensityProfiles(key: keyof DensityProfileLike, result: Vector4): Vector4 {
        return result.set(
            this[0].densityProfile[key],
            this[1].densityProfile[key],
            this[2].densityProfile[key],
            this[3].densityProfile[key]
        );
    }

    packIntervalHeights(minIntervals: Vector3, maxIntervals: Vector3): void {
        for (let i = 0; i < 4; ++i) {
            const layer = this[i];
            _entries[i].value = layer.altitude;
            _entries[i].flag = 0;
            _entries[i + 4].value = layer.altitude + layer.height;
            _entries[i + 4].flag = 1;
        }
        _entries.sort(compareEntries);

        let intervalIndex = 0;
        let balance = 0;
        for (let entryIndex = 0; entryIndex < _entries.length; ++entryIndex) {
            const { value, flag } = _entries[entryIndex];
            if (balance === 0 && entryIndex > 0) {
                const interval = _intervals[intervalIndex++];
                interval.min = _entries[entryIndex - 1].value;
                interval.max = value;
            }
            balance += flag === 0 ? 1 : -1;
        }
        for (; intervalIndex < 3; ++intervalIndex) {
            _intervals[intervalIndex].min = 0;
            _intervals[intervalIndex].max = 0;
        }

        minIntervals.set(_intervals[0].min, _intervals[1].min, _intervals[2].min);
        maxIntervals.set(_intervals[0].max, _intervals[1].max, _intervals[2].max);
    }
}
