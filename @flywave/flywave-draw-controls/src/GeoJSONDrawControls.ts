/* Copyright (C) 2025 flywave.gl contributors */

import {
    type Feature,
    type FeatureCollection,
    type GeoJson
} from "@flywave/flywave-datasource-protocol";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapControls } from "@flywave/flywave-map-controls";
import { type MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";

import { type DrawableObject } from "./DrawableObject";
import { DrawLine } from "./DrawLine";
import { DrawMode } from "./DrawMode";
import { DrawPolygon } from "./DrawPolygon";
import { MapDrawControls } from "./MapDrawControls";
import { PointObject } from "./PointObject";

/**
 * GeoJSON drawing controls class
 * Control specifically designed for drawing and editing GeoJSON data
 */
export class GeoJSONDrawControls extends MapDrawControls {
    constructor(mapView: MapView, mapControls: MapControls) {
        super(mapView, mapControls);
    }

    /**
     * Create drawing objects from GeoJSON data
     * @param geoJson GeoJSON data
     * @returns Array of created drawing objects
     */
    public createObjectsFromGeoJSON(geoJson: GeoJson): DrawableObject[] {
        const objects: DrawableObject[] = [];

        if (!geoJson) {
            console.error("Invalid GeoJSON format");
            return objects;
        }

        // Handle different types of GeoJSON data
        if (this.isFeatureCollection(geoJson)) {
            // FeatureCollection
            geoJson.features.forEach((feature: Feature) => {
                const object = this.createObjectFromFeature(feature);
                if (object) {
                    objects.push(object);
                }
            });
        } else if (this.isFeature(geoJson)) {
            // Single Feature
            const object = this.createObjectFromFeature(geoJson);
            if (object) {
                objects.push(object);
            }
        } else {
            // Geometry object
            const object = this.createObjectFromGeometry(geoJson);
            if (object) {
                objects.push(object);
            }
        }

        return objects;
    }

    /**
     * Check if object is a FeatureCollection
     * @param geoJson GeoJSON object
     * @returns Whether it is a FeatureCollection
     */
    private isFeatureCollection(geoJson: GeoJson): geoJson is FeatureCollection {
        return (geoJson as FeatureCollection).type === "FeatureCollection";
    }

    /**
     * Check if object is a Feature
     * @param geoJson GeoJSON object
     * @returns Whether it is a Feature
     */
    private isFeature(geoJson: GeoJson): geoJson is Feature {
        return (geoJson as Feature).type === "Feature";
    }

    /**
     * Create drawing object from Feature
     * @param feature Feature object
     * @returns DrawableObject instance
     */
    private createObjectFromFeature(feature: Feature): DrawableObject | null {
        try {
            let object: DrawableObject | null = null;

            // Create object based on geometry type
            object = this.createObjectFromGeometry(feature.geometry);

            if (object) {
                // Set object properties
                if (feature.id !== undefined) {
                    // Use userData to store custom ID
                    object.userData.featureId = feature.id;
                }

                if (feature.properties) {
                    object.userData.properties = feature.properties;
                }
            }

            return object;
        } catch (error) {
            console.error("Error creating object from Feature:", error);
            return null;
        }
    }

    /**
     * Create drawing object from geometry object
     * @param geometry Geometry object
     * @returns DrawableObject instance
     */
    private createObjectFromGeometry(geometry: any): DrawableObject | null {
        try {
            let object: DrawableObject | null = null;

            switch (geometry.type) {
                case "Point":
                    object = this.createPointFromGeometry(geometry);
                    break;
                case "LineString":
                    object = this.createLineFromGeometry(geometry);
                    break;
                case "Polygon":
                    object = this.createPolygonFromGeometry(geometry);
                    break;
                default:
                    console.warn(`Unsupported geometry type: ${geometry.type}`);
                    break;
            }

            return object;
        } catch (error) {
            console.error("Error creating object from geometry:", error);
            return null;
        }
    }

    /**
     * Create point object from Point geometry
     * @param geometry Point geometry data
     * @returns PointObject instance
     */
    private createPointFromGeometry(geometry: any): PointObject | null {
        if (!geometry || geometry.type !== "Point" || !geometry.coordinates) {
            return null;
        }

        try {
            const coordinates = geometry.coordinates;
            const position = new GeoCoordinates(
                coordinates[1], // latitude
                coordinates[0], // longitude
                coordinates[2] || 0 // altitude
            );

            return new PointObject(this.mapView, position);
        } catch (error) {
            console.error("Error creating PointObject from geometry:", error);
            return null;
        }
    }

    /**
     * Create line object from LineString geometry
     * @param geometry LineString geometry data
     * @returns DrawLine instance
     */
    private createLineFromGeometry(geometry: any): DrawLine | null {
        if (!geometry || geometry.type !== "LineString" || !geometry.coordinates) {
            return null;
        }

        try {
            const vertices = geometry.coordinates.map((coord: number[]) => {
                return new GeoCoordinates(
                    coord[1], // latitude
                    coord[0], // longitude
                    coord[2] || 0 // altitude
                );
            });

            return new DrawLine(this.mapView, vertices);
        } catch (error) {
            console.error("Error creating DrawLine from geometry:", error);
            return null;
        }
    }

    /**
     * Create polygon object from Polygon geometry
     * @param geometry Polygon geometry data
     * @returns DrawPolygon instance
     */
    private createPolygonFromGeometry(geometry: any): DrawPolygon | null {
        if (!geometry || geometry.type !== "Polygon" || !geometry.coordinates) {
            return null;
        }

        try {
            // Only use the first ring (outer ring), ignore inner rings
            const vertices = geometry.coordinates[0].map((coord: number[]) => {
                return new GeoCoordinates(
                    coord[1], // latitude
                    coord[0], // longitude
                    coord[2] || 0 // altitude
                );
            });

            return new DrawPolygon(this.mapView, vertices);
        } catch (error) {
            console.error("Error creating DrawPolygon from geometry:", error);
            return null;
        }
    }

    /**
     * Add GeoJSON data to drawing controls
     * @param geoJson GeoJSON data
     * @returns Number of successfully added objects
     */
    public addGeoJSON(geoJson: GeoJson): number {
        const objects = this.createObjectsFromGeoJSON(geoJson);
        this.addObjects(objects);
        return objects.length;
    }

    /**
     * Update existing objects with GeoJSON data
     * @param geoJson GeoJSON data
     * @returns Number of successfully updated objects
     */
    public updateGeoJSON(geoJson: GeoJson): number {
        let updateCount = 0;

        if (!geoJson) {
            return updateCount;
        }

        // Handle different types of GeoJSON data
        const features: Feature[] = [];
        if (this.isFeatureCollection(geoJson)) {
            features.push(...geoJson.features);
        } else if (this.isFeature(geoJson)) {
            features.push(geoJson);
        }

        features.forEach((feature: Feature) => {
            try {
                if (feature.id !== undefined) {
                    // Find existing object with the same ID
                    const existingObject = this.getObjects().find(
                        obj => obj.userData.featureId === feature.id
                    );

                    if (existingObject) {
                        // Update existing object
                        this.updateObjectFromGeometry(existingObject, feature.geometry);
                        updateCount++;
                    }
                }
            } catch (error) {
                console.error("Error updating object from Feature:", error);
            }
        });

        return updateCount;
    }

    /**
     * Update existing object based on geometry data
     * @param object Existing object
     * @param geometry Geometry data
     */
    private updateObjectFromGeometry(object: DrawableObject, geometry: any): void {
        try {
            switch (geometry.type) {
                case "Point":
                    if (object instanceof PointObject && geometry.coordinates) {
                        const coordinates = geometry.coordinates;
                        const newPosition = new GeoCoordinates(
                            coordinates[1], // latitude
                            coordinates[0], // longitude
                            coordinates[2] || 0 // altitude
                        );
                        object.moveTo(newPosition);
                    }
                    break;
                case "LineString":
                    if (object instanceof DrawLine && geometry.coordinates) {
                        const vertices = geometry.coordinates.map((coord: number[]) => {
                            return new GeoCoordinates(
                                coord[1], // latitude
                                coord[0], // longitude
                                coord[2] || 0 // altitude
                            );
                        });
                        object.setVertices(vertices);
                    }
                    break;
                case "Polygon":
                    if (object instanceof DrawPolygon && geometry.coordinates) {
                        // Only use the first ring (outer ring), ignore inner rings
                        const vertices = geometry.coordinates[0].map((coord: number[]) => {
                            return new GeoCoordinates(
                                coord[1], // latitude
                                coord[0], // longitude
                                coord[2] || 0 // altitude
                            );
                        });
                        object.setVertices(vertices);
                    }
                    break;
            }
        } catch (error) {
            console.error("Error updating object from geometry:", error);
        }
    }
}
