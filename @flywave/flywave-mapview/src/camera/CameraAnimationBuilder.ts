/* Copyright (C) 2025 flywave.gl contributors */

import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { MathUtils } from "@flywave/flywave-geoutils/math/MathUtils";
import { type LookAtParams, type MapView } from "../MapView";
import * as THREE from "three/webgpu";

import { type CameraKeyTrackAnimationOptions, ControlPoint } from "./CameraKeyTrackAnimation";

export class CameraAnimationBuilder {
    static getLookAtFromView(
        mapView: MapView
    ): Pick<LookAtParams, "target" | "tilt" | "heading" | "distance"> {
        return {
            target: mapView.target,
            heading: mapView.heading,
            tilt: mapView.tilt,
            distance: mapView.targetDistance
        };
    }

    static appendControlPoint(
        options: CameraKeyTrackAnimationOptions,
        point: ControlPoint,
        appendTime?: number
    ) {
        appendTime = appendTime ?? 10;
        if (
            options.controlPoints.length > 0 &&
            (point.timestamp === undefined ||
                point.timestamp <=
                    options.controlPoints[options.controlPoints.length - 1].timestamp)
        ) {
            point.timestamp =
                options.controlPoints[options.controlPoints.length - 1].timestamp + appendTime;
        }
        options.controlPoints.push(point);
    }

    static prependControlPoint(
        options: CameraKeyTrackAnimationOptions,
        point: ControlPoint,
        prependTime?: number
    ) {
        prependTime = prependTime !== undefined ? prependTime : 10;
        for (const controlPoint of options.controlPoints) {
            controlPoint.timestamp += prependTime;
        }
        point.timestamp = 0;
        options.controlPoints.unshift(point);
    }

    static createBowFlyToOptions(
        mapView: MapView,
        startControlPoint: ControlPoint,
        targetControlPoint: ControlPoint,
        altitude?: number,
        duration = 10
    ): CameraKeyTrackAnimationOptions {
        const controlPoints: ControlPoint[] = [startControlPoint];
        const startWorldTarget: THREE.Vector3 = new THREE.Vector3();
        mapView.projection.projectPoint(startControlPoint.target, startWorldTarget);
        let maxAltitude =
            altitude ??
            2 *
                startWorldTarget.distanceTo(
                    mapView.projection.projectPoint(targetControlPoint.target)
                );
        maxAltitude = Math.max(
            startControlPoint.distance + targetControlPoint.distance,
            maxAltitude
        );

        const midCoord0 = GeoCoordinates.lerp(
            startControlPoint.target as GeoCoordinates,
            targetControlPoint.target as GeoCoordinates,
            0.25
        );
        const midPoint0 = new ControlPoint({
            target: midCoord0,
            distance: maxAltitude,
            timestamp: duration / 3,
            tilt: MathUtils.interpolateAnglesDeg(
                startControlPoint.tilt,
                targetControlPoint.tilt,
                0.25
            ),
            heading: MathUtils.interpolateAnglesDeg(
                startControlPoint.heading,
                targetControlPoint.heading,
                0.25
            )
        });
        controlPoints.push(midPoint0);
        const midCoord1 = GeoCoordinates.lerp(
            startControlPoint.target as GeoCoordinates,
            targetControlPoint.target as GeoCoordinates,
            0.75
        );
        const midPoint1 = new ControlPoint({
            target: midCoord1,
            distance: maxAltitude,
            timestamp: (duration / 3) * 2,
            tilt: MathUtils.interpolateAnglesDeg(
                startControlPoint.tilt,
                targetControlPoint.tilt,
                0.75
            ),
            heading: MathUtils.interpolateAnglesDeg(
                startControlPoint.heading,
                targetControlPoint.heading,
                0.75
            )
        });
        controlPoints.push(midPoint1);

        targetControlPoint.timestamp = duration;
        controlPoints.push(targetControlPoint);

        return { controlPoints };
    }

    static createOrbitOptions(
        startControlPoint: ControlPoint,
        duration: number = 10
    ): CameraKeyTrackAnimationOptions {
        const amountOfKeys = 4;
        const controlPoints: ControlPoint[] = [startControlPoint];

        const steps = amountOfKeys - 1;
        const headingStep = 360 / steps;
        const timeStep = duration / steps;
        for (let n = 1; n < amountOfKeys; n++) {
            const prev = controlPoints[n - 1];
            controlPoints.push({
                ...prev,
                heading: prev.heading - headingStep,
                timestamp: prev.timestamp + timeStep
            });
        }

        return { controlPoints };
    }
}
