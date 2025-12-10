/* Copyright (C) 2025 flywave.gl contributors */

// CurveGenerator.ts
import * as THREE from "three";

export type CurveType = "catmull-rom" | "cubic-bezier" | "quadratic-bezier" | "spline";

export interface CurveConfig {
    type?: CurveType;
    resolution?: number;
    tension?: number;
}

export class CurveGenerator {
    private readonly defaultResolution = 50;

    public generate(points: THREE.Vector3[], config: CurveConfig): THREE.Vector3[] {
        if (points.length < 2) return points;
        if (!config.type) throw new Error("Curve type is required");

        const resolution = config.resolution || this.defaultResolution;

        try {
            const curve = this.createCurve(points, config);
            const curvePoints = curve.getPoints(resolution);
            return curvePoints;
        } catch (error) {
            console.warn("Curve generation failed, returning original points:", error);
            return points;
        }
    }

    private createCurve(points: THREE.Vector3[], config: CurveConfig): THREE.Curve<THREE.Vector3> {
        const type = config.type || "catmull-rom";
        switch (type) {
            case "catmull-rom":
                return new THREE.CatmullRomCurve3(
                    points,
                    false,
                    "centripetal",
                    config.tension || 0.5
                );

            case "cubic-bezier":
                return points.length === 4
                    ? new THREE.CubicBezierCurve3(points[0], points[1], points[2], points[3])
                    : new THREE.CubicBezierCurve3(
                          points[0],
                          this.getIntermediatePoint(points, 0.33),
                          this.getIntermediatePoint(points, 0.67),
                          points[points.length - 1]
                      );

            case "quadratic-bezier":
                return points.length === 3
                    ? new THREE.QuadraticBezierCurve3(points[0], points[1], points[2])
                    : new THREE.QuadraticBezierCurve3(
                          points[0],
                          this.getIntermediatePoint(points, 0.5),
                          points[points.length - 1]
                      );

            case "spline":
                return new THREE.CatmullRomCurve3(points);

            default:
                throw new Error(`Unsupported curve type: ${config.type}`);
        }
    }

    private getIntermediatePoint(points: THREE.Vector3[], ratio: number): THREE.Vector3 {
        const index = Math.floor((points.length - 1) * ratio);
        return points[index].clone();
    }
}
