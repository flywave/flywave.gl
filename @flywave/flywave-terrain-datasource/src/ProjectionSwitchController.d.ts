import { DataSource } from "@flywave/flywave-mapview";
import { ProjectionType } from "@flywave/flywave-geoutils";
/**
 * Configuration options for ProjectionSwitchController
 */
export interface ProjectionSwitchOptions {
    /** Duration of the projection switch animation in milliseconds */
    duration?: number;
    /** Speed factor for the projection switch animation */
    speedFactor?: number;
    /** Whether to animate the projection switch */
    animate?: boolean;
}
/**
 * Controller for managing terrain projection switching animations
 */
export declare class ProjectionSwitchController {
    private readonly m_dataSource;
    private m_projectionFactor;
    private m_isAnimating;
    private m_startTime;
    private m_duration;
    private m_speedFactor;
    private m_animate;
    private m_lastProjectionType?;
    constructor(m_dataSource: DataSource, options?: ProjectionSwitchOptions);
    private get mapView();
    /**
     * Check if a projection type is planar
     * @param projectionType - The projection type to check
     * @returns True if planar, false if spherical
     */
    private isPlanarProjection;
    /**
     * Get the target projection factor based on projection type
     * @param projectionType - The projection type
     * @returns 1.0 for planar, 0.0 for spherical
     */
    private getTargetProjectionFactor;
    /**
     * Update the projection switch controller state
     * This should be called every frame to check for projection changes
     */
    update(): void;
    /**
     * Start the projection switch animation
     * @param targetProjectionType - The target projection type
     */
    private startAnimation;
    /**
     * Update the animation progress
     */
    private updateAnimation;
    /**
     * Easing function for smooth animation
     * @param t - Normalized time (0 to 1)
     * @returns Eased value (0 to 1)
     */
    private easeInOutCubic;
    /**
     * Set the duration of the projection switch animation
     * @param duration - Duration in milliseconds
     */
    setDuration(duration: number): void;
    /**
     * Set the speed factor for the projection switch animation
     * @param speedFactor - Speed factor (1.0 is normal speed)
     */
    setSpeedFactor(speedFactor: number): void;
    /**
     * Enable or disable animation
     * @param animate - Whether to animate projection switches
     */
    setAnimate(animate: boolean): void;
    /**
     * Get the current projection type
     */
    get ProjectionType(): ProjectionType;
    /**
     * Get the current projection factor (0.0 for spherical, 1.0 for planar)
     */
    get projectionFactor(): number;
}
