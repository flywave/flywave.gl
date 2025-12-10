/* Copyright (C) 2025 flywave.gl contributors */
export class GroundModificationModule {
    constructor(monitor) {
        this.monitor = monitor;
        // 通过正确的类型获取 mapView
        this.mapView = monitor.mapView;
    }
    getName() {
        return "GroundModification";
    }
    getData() {
        // 获取当前地形源中的 kriging 配置
        const terrainSource = this.getTerrainSource();
        if (terrainSource) {
            const options = terrainSource.getGroundModificationManager().krigingOptions;
            return {
                model: options.model || "exponential",
                sigma2: options.sigma2 !== undefined ? options.sigma2 : 20,
                alpha: options.alpha !== undefined ? options.alpha : 0.05,
                numPoints: options.numPoints !== undefined ? options.numPoints : 100
            };
        }
        // 默认值
        return {
            model: "exponential",
            sigma2: 20,
            alpha: 0.05,
            numPoints: 100
        };
    }
    getDefaultData() {
        return {
            model: "exponential",
            sigma2: 20,
            alpha: 0.05,
            numPoints: 100
        };
    }
    updateData(data) {
        // 更新地形源中的 kriging 配置
        const terrainSource = this.getTerrainSource();
        if (terrainSource) {
            const options = {
                model: data.model,
                sigma2: data.sigma2,
                alpha: data.alpha,
                numPoints: data.numPoints
            };
            terrainSource.getGroundModificationManager().krigingOptions = options;
            // 触发地图更新
            this.mapView.update();
        }
    }
    /**
     * Synchronize the latest values from the map to the provided data object
     * This ensures UI controls reflect the current state of the map
     */
    syncWithMap(data) {
        const terrainSource = this.getTerrainSource();
        if (terrainSource) {
            const options = terrainSource.getGroundModificationManager().krigingOptions;
            if (options) {
                data.model = options.model || data.model;
                data.sigma2 = options.sigma2 !== undefined ? options.sigma2 : data.sigma2;
                data.alpha = options.alpha !== undefined ? options.alpha : data.alpha;
                data.numPoints = options.numPoints !== undefined ? options.numPoints : data.numPoints;
            }
        }
    }
    /**
     * Helper method to get the terrain source from the map view
     */
    getTerrainSource() {
        // 遍历所有数据源查找地形源
        for (const dataSource of this.mapView.dataSources) {
            if (this.isTerrainSource(dataSource)) {
                return dataSource;
            }
        }
        return undefined;
    }
    /**
     * Type guard to check if a data source is a terrain source
     */
    isTerrainSource(dataSource) {
        return (dataSource &&
            typeof dataSource === "object" &&
            "getGroundModificationManager" in dataSource &&
            typeof dataSource.getGroundModificationManager === "function");
    }
}
//# sourceMappingURL=GroundModificationModule.js.map