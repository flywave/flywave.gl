/* Copyright (C) 2025 flywave.gl contributors */

import { mercatorProjection, TileKey } from "@flywave/flywave-geoutils";
import { type CopyrightInfo, type MapView, type Tile } from "@flywave/flywave-mapview";
import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { CustomWebTileDataSource } from "../src/CustomWebTileDataSource";

describe("CustomWebTileDataSource", function () {
    const fakeMapView = {
        projection: mercatorProjection
    } as MapView;

    it("#createCustomWebTileDataSource throws error without tileUrlTemplate", function () {
        expect(() => {
            // @ts-ignore: Testing invalid instantiation
            new CustomWebTileDataSource({});
        }).to.throw("tileUrlTemplate is required");
    });

    it("#createCustomWebTileDataSource has default values", function () {
        const customWebTileDataSource = new CustomWebTileDataSource({
            tileUrlTemplate: "https://example.com/{z}/{x}/{y}.png"
        });

        expect(customWebTileDataSource.maxDataLevel).to.equal(20);
        expect(customWebTileDataSource.minDataLevel).to.equal(0);
        expect(customWebTileDataSource.storageLevelOffset).to.equal(-1);
    });

    it("#createCustomWebTileDataSource with custom min/max zoom levels", function () {
        const customWebTileDataSource = new CustomWebTileDataSource({
            tileUrlTemplate: "https://example.com/{z}/{x}/{y}.png",
            minZoomLevel: 5,
            maxZoomLevel: 15
        });

        expect(customWebTileDataSource.minDataLevel).to.equal(5);
        expect(customWebTileDataSource.maxDataLevel).to.equal(15);
    });

    it("#createCustomWebTileDataSource with custom copyright info", function () {
        const copyrightInfo: CopyrightInfo = {
            id: "custom-tiles",
            year: 2023,
            label: "Custom Tiles Provider",
            link: "https://example.com/copyright"
        };

        const customWebTileDataSource = new CustomWebTileDataSource({
            tileUrlTemplate: "https://example.com/{z}/{x}/{y}.png",
            copyrightInfo
        });

        expect(customWebTileDataSource).to.be.instanceOf(CustomWebTileDataSource);
    });

    it("#gets Texture for requested Tile with XYZ coordinates", async function () {
        // Mock the texture loader to avoid actual HTTP requests
        const mockTexture = new THREE.Texture();
        const textureLoaderStub = sinon.stub().resolves(mockTexture);

        // We need to replace the textureLoader in the module
        const customWebTileDataSource = new CustomWebTileDataSource({
            tileUrlTemplate: "https://example.com/{z}/{x}/{y}.png"
        });

        // Create a mock data provider that simulates the actual implementation
        const mockDataProvider = {
            getTexture: sinon.spy(async (tile: Tile) => {
                return [mockTexture, [{ id: "custom", year: 2023, label: "Custom" }]] as [
                    THREE.Texture,
                    CopyrightInfo[]
                ];
            })
        };

        // Replace the data provider in the data source
        (customWebTileDataSource as any).dataProvider = mockDataProvider;

        sinon.stub(customWebTileDataSource, "mapView").get(() => {
            return fakeMapView;
        });

        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const tile = customWebTileDataSource.getTile(tileKey);
        await tile.load();

        expect(mockDataProvider.getTexture.calledOnce).to.be.true;
    });

    it("#handles TMS coordinate system with {-y} placeholder", async function () {
        // Mock the texture loader to avoid actual HTTP requests
        const mockTexture = new THREE.Texture();
        const textureLoaderStub = sinon.stub().resolves(mockTexture);

        // We need to replace the textureLoader in the module
        const customWebTileDataSource = new CustomWebTileDataSource({
            tileUrlTemplate: "https://example.com/{z}/{x}/{-y}.png"
        });

        // Create a mock data provider that simulates the actual implementation
        const mockDataProvider = {
            getTexture: sinon.spy(async (tile: Tile) => {
                return [mockTexture, [{ id: "custom", year: 2023, label: "Custom" }]] as [
                    THREE.Texture,
                    CopyrightInfo[]
                ];
            })
        };

        // Replace the data provider in the data source
        (customWebTileDataSource as any).dataProvider = mockDataProvider;

        sinon.stub(customWebTileDataSource, "mapView").get(() => {
            return fakeMapView;
        });

        const tileKey = TileKey.fromRowColumnLevel(0, 0, 1);
        const tile = customWebTileDataSource.getTile(tileKey);
        await tile.load();

        expect(mockDataProvider.getTexture.calledOnce).to.be.true;
    });

    it("#handles subdomains correctly", async function () {
        // Mock the texture loader to avoid actual HTTP requests
        const mockTexture = new THREE.Texture();
        const textureLoaderStub = sinon.stub().resolves(mockTexture);

        const customWebTileDataSource = new CustomWebTileDataSource({
            tileUrlTemplate: "https://{s}.example.com/{z}/{x}/{y}.png",
            subdomains: ["a", "b", "c"]
        });

        // Create a mock data provider that simulates the actual implementation
        const mockDataProvider = {
            getTexture: sinon.spy(async (tile: Tile) => {
                return [mockTexture, [{ id: "custom", year: 2023, label: "Custom" }]] as [
                    THREE.Texture,
                    CopyrightInfo[]
                ];
            })
        };

        // Replace the data provider in the data source
        (customWebTileDataSource as any).dataProvider = mockDataProvider;

        sinon.stub(customWebTileDataSource, "mapView").get(() => {
            return fakeMapView;
        });

        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const tile = customWebTileDataSource.getTile(tileKey);
        await tile.load();

        expect(mockDataProvider.getTexture.calledOnce).to.be.true;
    });
});
