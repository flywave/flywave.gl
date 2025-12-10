import * as THREE from 'three';
import { EarthConstants } from '../projection/EarthConstants';

/**
 * Represents a tangent plane to an ellipsoid at a specific origin point
 * Provides East-North-Up coordinate system for local spatial calculations
 */
export class EllipsoidTangentPlane {
    private _ellipsoid: any;
    private _origin: THREE.Vector3;
    private _xAxis: THREE.Vector3; // East direction
    private _yAxis: THREE.Vector3; // North direction  
    private _zAxis: THREE.Vector3; // Up direction (normal vector)
    private _plane: THREE.Plane;

    constructor(origin: THREE.Vector3, ellipsoid?: any) {
        this._ellipsoid = ellipsoid || {
            equatorialRadius: EarthConstants.EQUATORIAL_RADIUS,
            flattening: 1 / 298.257223563
        };

        this._origin = origin.clone();

        // Compute East-North-Up coordinate frame
        const enuFrame = this.computeEastNorthUpFrame(this._origin);

        this._xAxis = enuFrame.east;
        this._yAxis = enuFrame.north;
        this._zAxis = enuFrame.up;

        // Create tangent plane using normal vector and origin point
        this._plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            this._zAxis.clone(),
            this._origin
        );
    }

    get ellipsoid() { return this._ellipsoid; }
    get origin() { return this._origin; }
    get xAxis() { return this._xAxis; }
    get yAxis() { return this._yAxis; }
    get zAxis() { return this._zAxis; }
    get plane() { return this._plane; }

    /**
     * Computes the East-North-Up coordinate frame at the given origin point
     * East: tangent to parallel (longitude line)
     * North: tangent to meridian (latitude line) 
     * Up: surface normal direction
     */
    private computeEastNorthUpFrame(origin: THREE.Vector3): {
        east: THREE.Vector3;
        north: THREE.Vector3;
        up: THREE.Vector3;
    } {
        const { x, y, z } = origin;

        // Calculate longitude and latitude
        const longitude = Math.atan2(y, x);
        const latitude = Math.atan2(z, Math.sqrt(x * x + y * y));

        // East direction: tangent to parallel (-sinλ, cosλ, 0)
        const east = new THREE.Vector3(
            -Math.sin(longitude),
            Math.cos(longitude),
            0
        ).normalize();

        // Up direction: surface normal (cosφ·cosλ, cosφ·sinλ, sinφ)
        const up = new THREE.Vector3(
            Math.cos(latitude) * Math.cos(longitude),
            Math.cos(latitude) * Math.sin(longitude),
            Math.sin(latitude)
        ).normalize();

        // North direction: cross product of up and east (right-handed system)
        const north = new THREE.Vector3()
            .crossVectors(up, east)
            .normalize();

        return { east, north, up };
    }
}