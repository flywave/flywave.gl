/* Copyright (C) 2025 flywave.gl contributors */

import { type Env, type GeometryKindSet } from "@flywave/flywave-datasource-protocol";
import { type Projection } from "@flywave/flywave-geoutils";
import type * as THREE from "three";

import { type ElevationProvider } from "../ElevationProvider";

/**
 * State parameters of a view that are required by the text renderer.
 */
export interface ViewState {
    worldCenter: THREE.Vector3; // View's center world coordinates.
    cameraIsMoving: boolean; // Whether view's camera is currently moving.
    maxVisibilityDist: number; // Maximum far plane distance.
    zoomLevel: number; // View's zoom level.
    env: Env;
    frameNumber: number; // Current frame number.
    lookAtVector: THREE.Vector3; // Normalized camera viewing direction.
    lookAtDistance: number; // Distance to the lookAt point.
    isDynamic: boolean; // Whether a new frame for the view is already requested.
    hiddenGeometryKinds?: GeometryKindSet; // Kinds of geometries that are disabled.
    renderedTilesChanged: boolean; // True if rendered tiles changed since previous frame.
    projection: Projection; // geo to world space projection.
    elevationProvider?: ElevationProvider; // Elevation data provider if available.
}
