/* Copyright (C) 2025 flywave.gl contributors */



import { type DisplayParams } from "../common/render/primitives/display-params";
import { type Transform } from "../geometry3d/transform";
import { type IndexedPolyface } from "../polyface/polyface";

export class PolyfacePrimitive {
    public readonly displayParams: DisplayParams;
    private readonly _polyface: IndexedPolyface;
    public readonly displayEdges: boolean;
    public readonly isPlanar: boolean;

    public get indexedPolyface() {
        return this._polyface;
    }

    public static create(
        params: DisplayParams,
        pf: IndexedPolyface,
        displayEdges: boolean = true,
        isPlanar: boolean = false
    ) {
        return new PolyfacePrimitive(params, pf, displayEdges, isPlanar);
    }

    private constructor(
        params: DisplayParams,
        pf: IndexedPolyface,
        displayEdges: boolean,
        isPlanar: boolean
    ) {
        this.displayParams = params;
        this._polyface = pf;
        this.displayEdges = displayEdges;
        this.isPlanar = isPlanar;
    }

    public clone(): PolyfacePrimitive {
        return new PolyfacePrimitive(
            this.displayParams,
            this._polyface.clone(),
            this.displayEdges,
            this.isPlanar
        );
    }

    public transform(trans: Transform): boolean {
        return this._polyface.tryTransformInPlace(trans);
    }
}

export class PolyfacePrimitiveList extends Array<PolyfacePrimitive> {
    constructor(...args: PolyfacePrimitive[]) {
        super(...args);
    }
}
