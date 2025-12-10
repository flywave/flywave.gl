/* Copyright (C) 2025 flywave.gl contributors */

import { DataSource, type MapView } from "@flywave/flywave-mapview";
import { ProjectionType, type Projection } from "@flywave/flywave-geoutils";

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
export class ProjectionSwitchController {
    private m_projectionFactor: number = -1.0; // Use -1 to indicate uninitialized
    private m_isAnimating: boolean = false;
    private m_startTime: number = 0;
    private m_duration: number = 0; // Default 1 second
    private m_speedFactor: number = 1.0;
    private m_animate: boolean = true;
    private m_lastProjectionType?: ProjectionType;

    constructor(
        private readonly m_dataSource: DataSource,
        options?: ProjectionSwitchOptions
    ) {
        
        // Apply options if provided
        if (options) {
            if (options.duration !== undefined) {
                this.m_duration = options.duration;
            }
            if (options.speedFactor !== undefined) {
                this.m_speedFactor = options.speedFactor;
            }
            if (options.animate !== undefined) {
                this.m_animate = options.animate;
            }
        }
    }

    private get mapView(): MapView {
        return this.m_dataSource.mapView;
    }

    /**
     * Check if a projection type is planar
     * @param projectionType - The projection type to check
     * @returns True if planar, false if spherical
     */
    private isPlanarProjection(projectionType: ProjectionType): boolean {
        return projectionType === ProjectionType.Planar ||  
               // Add other planar projection types as needed
               false;
    }

    /**
     * Get the target projection factor based on projection type
     * @param projectionType - The projection type
     * @returns 1.0 for planar, 0.0 for spherical
     */
    private getTargetProjectionFactor(projectionType: ProjectionType): number {
        return this.isPlanarProjection(projectionType) ? 1.0 : 0.0;
    }

    /**
     * Update the projection switch controller state
     * This should be called every frame to check for projection changes
     */
    update(): void {
        const currentProjectionType = this.mapView.projection.type;

        // Initialize if needed
        if (this.m_projectionFactor < 0) {
            this.m_projectionFactor = this.getTargetProjectionFactor(currentProjectionType);
            this.m_lastProjectionType = currentProjectionType;
            return;
        }

        // Check if projection has changed
        if (currentProjectionType !== this.m_lastProjectionType) {
            // Start animation if projection changed
            this.startAnimation(currentProjectionType);
            this.m_lastProjectionType = currentProjectionType;
        }
        
        // Update animation progress if animating
        if (this.m_isAnimating) {
            this.updateAnimation();
        }
    }

    /**
     * Start the projection switch animation
     * @param targetProjectionType - The target projection type
     */
    private startAnimation(targetProjectionType: ProjectionType): void {
        if (!this.m_animate) {
            // If animation is disabled, immediately switch
            this.m_projectionFactor = this.getTargetProjectionFactor(targetProjectionType);
            this.m_isAnimating = false;
            return;
        }
        
        // Reset animation state
        this.m_startTime = performance.now();
        this.m_isAnimating = true;
    }

    /**
     * Update the animation progress
     */
    private updateAnimation(): void {
        if (!this.m_isAnimating) {
            return;
        }
        
        const currentTime = performance.now();
        const elapsed = currentTime - this.m_startTime;
        const progress = Math.min(1.0, (elapsed / this.m_duration) * this.m_speedFactor);
        
        // Apply easing function (smooth start and end)
        const easedProgress = this.easeInOutCubic(progress);
        
        // Calculate target factor based on projection type
        const startFactor = this.m_projectionFactor;
        const targetFactor = this.getTargetProjectionFactor(this.m_lastProjectionType!);
        
        // Interpolate between start and target factors
        this.m_projectionFactor = startFactor + (targetFactor - startFactor) * easedProgress;
        
        // Check if animation is complete
        if (progress >= 1.0) {
            this.m_isAnimating = false;
            this.m_projectionFactor = targetFactor;
        }
    }

    /**
     * Easing function for smooth animation
     * @param t - Normalized time (0 to 1)
     * @returns Eased value (0 to 1)
     */
    private easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }

    /**
     * Set the duration of the projection switch animation
     * @param duration - Duration in milliseconds
     */
    setDuration(duration: number): void {
        this.m_duration = duration;
    }

    /**
     * Set the speed factor for the projection switch animation
     * @param speedFactor - Speed factor (1.0 is normal speed)
     */
    setSpeedFactor(speedFactor: number): void {
        this.m_speedFactor = speedFactor;
    }

    /**
     * Enable or disable animation
     * @param animate - Whether to animate projection switches
     */
    setAnimate(animate: boolean): void {
        this.m_animate = animate;
    }

    /**
     * Get the current projection type
     */
    get ProjectionType(): ProjectionType {
        return this.mapView.projection.type!;
    }
 
    /**
     * Get the current projection factor (0.0 for spherical, 1.0 for planar)
     */
    get projectionFactor(): number {
        return this.m_projectionFactor;
    }
}