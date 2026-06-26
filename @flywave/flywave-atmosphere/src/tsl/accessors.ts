/* Copyright (C) 2025 flywave.gl contributors */

// @ts-nocheck
// TSL accessors use reference() and cached camera property lookups.
// @types/three@0.184 cannot fully type these TSL reference patterns.

import type { Camera, Vector3 } from "three";
import {
    cameraFar as cameraFarTSL,
    cameraNear as cameraNearTSL,
    cameraPosition,
    cameraProjectionMatrix,
    cameraProjectionMatrixInverse,
    cameraViewMatrix,
    cameraWorldMatrix,
    Fn,
    positionView,
    reference,
    renderGroup,
    uniform
} from "three/tsl";
import type { UniformNode } from "three/webgpu";

let caches: WeakMap<object, Record<string, unknown>> | undefined;

function getCache<T extends object, U>(object: T, name: string, callback: () => U): U {
    caches ??= new WeakMap<object, Record<string, unknown>>();
    let cache = caches.get(object);
    if (cache == null) {
        cache = {};
        caches.set(object, cache);
    }
    return (cache[name] ??= callback()) as U;
}

export const projectionMatrix = (camera?: Camera | null) =>
    camera != null
        ? getCache(camera, "projectionMatrix", () =>
              reference("projectionMatrix", "mat4", camera)
                  .setGroup(renderGroup)
                  .setName("projectionMatrix")
          )
        : cameraProjectionMatrix;

export const viewMatrix = (camera?: Camera | null) =>
    camera != null
        ? getCache(camera, "viewMatrix", () =>
              reference("matrixWorldInverse", "mat4", camera)
                  .setGroup(renderGroup)
                  .setName("viewMatrix")
          )
        : cameraViewMatrix;

export const inverseProjectionMatrix = (camera?: Camera | null) =>
    camera != null
        ? getCache(camera, "inverseProjectionMatrix", () =>
              reference("projectionMatrixInverse", "mat4", camera)
                  .setGroup(renderGroup)
                  .setName("inverseProjectionMatrix")
          )
        : cameraProjectionMatrixInverse;

export const inverseViewMatrix = (camera?: Camera | null) =>
    camera != null
        ? getCache(camera, "inverseViewMatrix", () =>
              reference("matrixWorld", "mat4", camera)
                  .setGroup(renderGroup)
                  .setName("inverseViewMatrix")
          )
        : cameraWorldMatrix;

export const cameraPositionWorld = (camera?: Camera | null): UniformNode<Vector3> =>
    camera != null
        ? getCache(camera, "cameraPositionWorld", () =>
              uniform("vec3")
                  .setGroup(renderGroup)
                  .setName("cameraPositionWorld")
                  .onRenderUpdate((_, { value }) => {
                      value.setFromMatrixPosition(camera.matrixWorld);
                  })
          )
        : cameraPosition;

export const cameraNear = (camera?: Camera | null) =>
    camera != null
        ? getCache(camera, "cameraNear", () =>
              reference("near", "float", camera).setGroup(renderGroup).setName("cameraNear")
          )
        : cameraNearTSL;

export const cameraFar = (camera?: Camera | null) =>
    camera != null
        ? getCache(camera, "cameraFar", () =>
              reference("far", "float", camera).setGroup(renderGroup).setName("cameraFar")
          )
        : cameraFarTSL;

export const viewZ = Fn((): unknown => positionView.z)
    .once()()
    .toVar("viewZ");
