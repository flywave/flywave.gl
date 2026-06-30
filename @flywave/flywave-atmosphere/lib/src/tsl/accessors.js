// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
import { cameraFar as cameraFarTSL, cameraNear as cameraNearTSL, cameraPosition, cameraProjectionMatrix, cameraProjectionMatrixInverse, cameraViewMatrix, cameraWorldMatrix, Fn, positionView, reference, renderGroup, uniform } from "three/tsl";
let caches;
function getCache(object, name, callback) {
    caches ?? (caches = new WeakMap());
    let cache = caches.get(object);
    if (cache == null) {
        cache = {};
        caches.set(object, cache);
    }
    return (cache[name] ?? (cache[name] = callback()));
}
export const projectionMatrix = (camera) => camera != null
    ? getCache(camera, "projectionMatrix", () => reference("projectionMatrix", "mat4", camera)
        .setGroup(renderGroup)
        .setName("projectionMatrix"))
    : cameraProjectionMatrix;
export const viewMatrix = (camera) => camera != null
    ? getCache(camera, "viewMatrix", () => reference("matrixWorldInverse", "mat4", camera)
        .setGroup(renderGroup)
        .setName("viewMatrix"))
    : cameraViewMatrix;
export const inverseProjectionMatrix = (camera) => camera != null
    ? getCache(camera, "inverseProjectionMatrix", () => reference("projectionMatrixInverse", "mat4", camera)
        .setGroup(renderGroup)
        .setName("inverseProjectionMatrix"))
    : cameraProjectionMatrixInverse;
export const inverseViewMatrix = (camera) => camera != null
    ? getCache(camera, "inverseViewMatrix", () => reference("matrixWorld", "mat4", camera)
        .setGroup(renderGroup)
        .setName("inverseViewMatrix"))
    : cameraWorldMatrix;
export const cameraPositionWorld = (camera) => camera != null
    ? getCache(camera, "cameraPositionWorld", () => uniform("vec3")
        .setGroup(renderGroup)
        .setName("cameraPositionWorld")
        .onRenderUpdate((_, { value }) => {
        value.setFromMatrixPosition(camera.matrixWorld);
    }))
    : cameraPosition;
export const cameraNear = (camera) => camera != null
    ? getCache(camera, "cameraNear", () => reference("near", "float", camera).setGroup(renderGroup).setName("cameraNear"))
    : cameraNearTSL;
export const cameraFar = (camera) => camera != null
    ? getCache(camera, "cameraFar", () => reference("far", "float", camera).setGroup(renderGroup).setName("cameraFar"))
    : cameraFarTSL;
export const viewZ = Fn(() => positionView.z)
    .once()()
    .toVar("viewZ");
//# sourceMappingURL=accessors.js.map