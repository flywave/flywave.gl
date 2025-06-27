import { Vector3, Matrix4, Vector4 } from "three";
import { CameraTransform } from "./CameraTransform";
import { ElevationProvider, MapView } from "@flywave/flywave-mapview";

export class PlanarCameraTransform extends CameraTransform {
    constructor(
        protected mapView: MapView,
        private options: {
            hitCountPrecision: number; // Precision for terrain hit detection
        } = { hitCountPrecision: 0.01 } // Default precision value
    ) {
        super();
    }

    // Returns the camera's projection matrix
    protected getCameraProjectionMatrix(): Matrix4 {
        return this.mapView.camera.projectionMatrix;
    }

    // Gets the current viewport dimensions
    protected getViewPort(): Vector4 {
        return this.mapView.renderer.getViewport(new Vector4());
    }

    // Gets the elevation provider for terrain data
    protected getElevationProvider(): ElevationProvider | null {
        return this.mapView.elevationProvider || null;
    }

    // Shortcut to access map projection
    private get projection() {
        return this.mapView.projection;
    }

    // ============== Collision Detection ==============
    /**
     * Checks for collision between source and target points
     * @param outTarget Output vector for collision point
     * @param sourcePoint Ray origin point
     * @param targetPoint Ray target point
     * @param radius Not used in planar projection (kept for interface compatibility)
     * @returns Boolean indicating if collision occurred
     */
    protected collisionTo(
        outTarget: Vector3,
        sourcePoint: Vector3,
        targetPoint: Vector3,
        radius: number
    ): boolean {
        // In planar projection, we simply check ray intersection with z=0 plane
        const t = this.rayCastProjectionWorld(outTarget, sourcePoint, targetPoint);
        return t >= 0 && t <= 1;
    }

    // ============== Camera Controls ==============
    /**
     * Performs inertial panning with damping
     * @param targetPoint Pivot point for rotation
     * @param inertialAxis Rotation axis and amount [x,y,z,angle]
     * @param inertial Damping factor (0-1)
     */
    inertialPan(targetPoint: Vector3, inertialAxis: Vector4, inertial: number): void {
        if (inertialAxis.w === 0) return;

        // Move to origin relative to target
        const position = new Vector3().setFromMatrixPosition(this.cameraToWorld);
        this.cameraToWorld.setPosition(position.sub(targetPoint));

        // Apply rotation with damping
        this.rotate(inertialAxis.x, inertialAxis.y, inertialAxis.z, inertialAxis.w * inertial);

        // Move back to target position
        this.cameraToWorld.setPosition(position.add(targetPoint));

        // Apply damping to rotation amount
        inertialAxis.w *= 1 - inertial;
    }

    /**
     * Pans the camera around a target point
     * @param moveToTargetPoint Target reference point for movement
     * @param cameraPosition Current camera position
     * @param rayTargetPoint Current mouse/touch position in world coordinates
     * @param inertialAxis Output parameter for storing inertial rotation data
     * @param step Damping/step factor for smooth movement
     */
    pan(
        moveToTargetPoint: Vector3,
        cameraPosition: Vector3,
        rayTargetPoint: Vector3,
        inertialAxis: Vector4,
        step: number
    ): void {
        // Calculate movement delta in screen space
        const deltaX = rayTargetPoint.x - moveToTargetPoint.x;
        const deltaY = rayTargetPoint.y - moveToTargetPoint.y;

        // Apply movement to camera position (planar projection only affects X/Y)
        const newPosition = new Vector3(
            cameraPosition.x - deltaX * step, // X movement
            cameraPosition.y - deltaY * step, // Y movement
            cameraPosition.z // Z remains unchanged in planar projection
        );

        // Update camera matrix
        this.cameraToWorld.setPosition(newPosition);

        // Calculate inertia for smooth follow-through
        const inertiaMagnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY) * 0.5;
        inertialAxis.set(
            deltaY, // Rotation axis X (perpendicular to movement)
            -deltaX, // Rotation axis Y (perpendicular to movement)
            0, // No Z rotation in planar mode
            inertiaMagnitude * step // Rotation amount
        );

        // Limit maximum rotation to prevent excessive spinning
        if (inertialAxis.w > Math.PI / 4) {
            inertialAxis.w = Math.PI / 4;
        }
    }

    /**
     * Applies panning velocity to camera
     * @param step Time step/factor
     * @param panVelocityX Horizontal pan velocity
     * @param panVelocityY Vertical pan velocity
     */
    public applyPanVelocity(step: number, panVelocityX: number, panVelocityY: number): void {
        const position = new Vector3().setFromMatrixPosition(this.cameraToWorld);

        // Apply velocity to X/Y coordinates
        position.x += panVelocityX * step * 100; // Scaled for appropriate sensitivity
        position.y += panVelocityY * step * 100;

        this.cameraToWorld.setPosition(position);
    }

    // ============== Raycasting ==============
    private readonly _scratchVec3 = new Vector3(); // Reusable vector for calculations

    /**
     * Performs ray casting against the planar projection with optional terrain
     * @param result Output vector for intersection point
     * @param origin Ray origin in world coordinates
     * @param target Ray end point in world coordinates
     * @returns Intersection parameter t (0-1) or -1 if no intersection
     */
    rayCastProjectionWorld(result: Vector3, origin: Vector3, target: Vector3): number {
        // Early exit if ray is parallel to plane
        if (Math.abs(target.z - origin.z) < 1e-10) return -1;

        // Calculate intersection parameter with z=0 plane
        const t = -origin.z / (target.z - origin.z);
        if (t < 0 || t > 1) return -1; // Intersection outside ray segment

        // Calculate base intersection point (without terrain)
        const baseIntersection = this._scratchVec3.set(
            origin.x + t * (target.x - origin.x),
            origin.y + t * (target.y - origin.y),
            0 // Default to ground level
        );

        // Check for terrain elevation if available
        const elevationProvider = this.getElevationProvider();
        if (elevationProvider) {
            const direction = new Vector3().subVectors(target, origin);
            let terrainHeight = 0;

            // Sample along ray to find terrain collisions
            for (let step = 0; step <= t; step += this.options.hitCountPrecision) {
                const testPoint = new Vector3().copy(origin).addScaledVector(direction, step);

                // Convert to geographic coordinates
                const geoCoords = this.projection.unprojectPoint(testPoint);
                geoCoords.altitude = 0; // Sample from sea level

                const height = elevationProvider.getHeight(geoCoords) ?? 0;
                if (height > 0) {
                    terrainHeight = height;
                    break;
                }
            }

            // Apply terrain height to result
            result.set(baseIntersection.x, baseIntersection.y, terrainHeight);
        } else {
            result.copy(baseIntersection);
        }

        return t;
    }

    // ============== Utility Methods ==============
    /**
     * Smoothly zooms camera toward target point
     * @param target Target position to zoom toward
     * @param interpolationFactor Interpolation amount (0-1)
     */
    public zoom(target: Vector3, interpolationFactor: number): void {
        const position = new Vector3().setFromMatrixPosition(this.cameraToWorld);
        position.lerp(target, interpolationFactor); // Linear interpolation
        this.cameraToWorld.setPosition(position);
    }
}
