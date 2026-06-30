// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */


import { bool, bvec2, bvec3, bvec4, overloadingFn, uvec2, uvec3, uvec4 } from "three/tsl";

import { FnLayout } from "./FnLayout";

const bvec2Not = /*#__PURE__*/ FnLayout({
    name: "bvec2Not",
    type: "bvec2",
    inputs: [{ name: "x", type: "bvec2" }]
})(([x]) => x.notEqual(bool(true)));

const bvec3Not = /*#__PURE__*/ FnLayout({
    name: "bvec3Not",
    type: "bvec3",
    inputs: [{ name: "x", type: "bvec3" }]
})(([x]) => x.notEqual(bool(true)));

const bvec4Not = /*#__PURE__*/ FnLayout({
    name: "bvec4Not",
    type: "bvec4",
    inputs: [{ name: "x", type: "bvec4" }]
})(([x]) => x.notEqual(bool(true)));

export const bvecNot = /*#__PURE__*/ overloadingFn([bvec2Not, bvec3Not, bvec4Not]);

const bvec2And = /*#__PURE__*/ FnLayout({
    name: "bvec2And",
    type: "bvec2",
    inputs: [
        { name: "x", type: "bvec2" },
        { name: "y", type: "bvec2" }
    ]
})(([x, y]) => bvec2(uvec2(x).mul(uvec2(y))));

const bvec3And = /*#__PURE__*/ FnLayout({
    name: "bvec3And",
    type: "bvec3",
    inputs: [
        { name: "x", type: "bvec3" },
        { name: "y", type: "bvec3" }
    ]
})(([x, y]) => bvec3(uvec3(x).mul(uvec3(y))));

const bvec4And = /*#__PURE__*/ FnLayout({
    name: "bvec4And",
    type: "bvec4",
    inputs: [
        { name: "x", type: "bvec4" },
        { name: "y", type: "bvec4" }
    ]
})(([x, y]) => bvec4(uvec4(x).mul(uvec4(y))));

export const bvecAnd = /*#__PURE__*/ overloadingFn([bvec2And, bvec3And, bvec4And]);

const bvec2Or = /*#__PURE__*/ FnLayout({
    name: "bvec2Or",
    type: "bvec2",
    inputs: [
        { name: "x", type: "bvec2" },
        { name: "y", type: "bvec2" }
    ]
})(([x, y]) => uvec2(x).add(uvec2(y)).notEqual(0));

const bvec3Or = /*#__PURE__*/ FnLayout({
    name: "bvec3Or",
    type: "bvec3",
    inputs: [
        { name: "x", type: "bvec3" },
        { name: "y", type: "bvec3" }
    ]
})(([x, y]) => uvec3(x).add(uvec3(y)).notEqual(0));

const bvec4Or = /*#__PURE__*/ FnLayout({
    name: "bvec4Or",
    type: "bvec4",
    inputs: [
        { name: "x", type: "bvec4" },
        { name: "y", type: "bvec4" }
    ]
})(([x, y]) => uvec4(x).add(uvec4(y)).notEqual(0));

export const bvecOr = /*#__PURE__*/ overloadingFn([bvec2Or, bvec3Or, bvec4Or]);
