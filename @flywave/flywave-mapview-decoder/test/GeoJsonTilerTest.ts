/* Copyright (C) 2025 flywave.gl contributors */

import { type FeatureCollection } from "@flywave/flywave-datasource-protocol";
import { TileKey } from "@flywave/flywave-geoutils";
import { expect } from "chai";

import { GeoJsonTiler } from "../src/GeoJsonTiler";

const featureCollectionWithIds: FeatureCollection = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            id: "point id",
            properties: {},

            geometry: {
                type: "Point",
                coordinates: [1, 2]
            }
        },
        {
            type: "Feature",
            id: "line id",
            properties: {},

            geometry: {
                type: "LineString",
                coordinates: [
                    [1, 2],
                    [3, 4]
                ]
            }
        },
        {
            type: "Feature",
            id: "polygon id",
            properties: {},

            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [1, 2],
                        [3, 4],
                        [5, 6]
                    ]
                ]
            }
        }
    ]
};

const featureCollectionWithoutIds: FeatureCollection = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: {},

            geometry: {
                type: "Point",
                coordinates: [1, 2]
            }
        },
        {
            type: "Feature",
            properties: {},

            geometry: {
                type: "LineString",
                coordinates: [
                    [1, 2],
                    [3, 4]
                ]
            }
        },
        {
            type: "Feature",
            properties: {},

            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [1, 2],
                        [3, 4],
                        [5, 6]
                    ]
                ]
            }
        }
    ]
};

describe("GeoJsonTiler", function () {
    let tiler: GeoJsonTiler;

    beforeEach(function () {
        tiler = new GeoJsonTiler();
    });

    it("returns features with their original geojson ids", async function () {
        const indexId = "dummy";
        await tiler.registerIndex(indexId, featureCollectionWithIds);

        const tile = (await tiler.getTile(indexId, new TileKey(0, 0, 1))) as any;

        expect(tile.features).has.lengthOf(3);
        const expectedFeatureIds = featureCollectionWithIds.features.map(feature => feature.id);
        const actualFeatureIds: string[] = tile.features.map(
            (feature: { id: string }) => feature.id
        );
        expect(actualFeatureIds).has.members(expectedFeatureIds);
    });

    it("generates feature ids if input geojson doesn't have them", async function () {
        const indexId = "dummy";
        await tiler.registerIndex(indexId, featureCollectionWithoutIds);

        const tile = (await tiler.getTile(indexId, new TileKey(0, 0, 1))) as any;

        expect(tile.features).has.lengthOf(3);
        const actualFeatureIds: Array<number | undefined> = tile.features.map(
            (feature: { id: number }) => feature.id
        );
        expect(actualFeatureIds).to.not.include(undefined);
    });
});
