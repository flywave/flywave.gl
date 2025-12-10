/* Copyright (C) 2025 flywave.gl contributors */
export class FogModule {
    constructor(monitor) {
        this.monitor = monitor;
        // 通过正确的类型获取 mapView
        this.mapView = monitor.mapView;
    }
    getName() {
        return "Fog";
    }
    getData() {
        // 获取当前主题中的雾配置
        const theme = this.mapView.theme;
        const fogConfig = theme?.fog;
        if (fogConfig) {
            return {
                enabled: this.mapView.fog.enabled,
                color: fogConfig.color || "#ffffff",
                ratio: fogConfig.ratio !== undefined ? fogConfig.ratio : 0.00005,
                range: fogConfig.range !== undefined ? fogConfig.range : 10000
            };
        }
        // 默认值
        return {
            enabled: false,
            color: "#ffffff",
            ratio: 0.00005,
            range: 10000
        };
    }
    getDefaultData() {
        return {
            enabled: false,
            color: "#ffffff",
            ratio: 0.00005,
            range: 10000
        };
    }
    updateData(data) {
        // 更新雾效启用状态
        this.mapView.fog.enabled = data.enabled;
        // 更新主题中的雾配置
        const theme = this.mapView.theme;
        if (!theme.fog) {
            theme.fog = {
                color: data.color,
                ratio: data.ratio,
                range: data.range
            };
        }
        else {
            theme.fog.color = data.color;
            theme.fog.ratio = data.ratio;
            theme.fog.range = data.range;
        }
        // 重置雾效配置
        this.mapView.fog.reset(theme.fog);
        // 触发地图更新
        this.mapView.update();
    }
    /**
     * Synchronize the latest values from the map to the provided data object
     * This ensures UI controls reflect the current state of the map
     */
    syncWithMap(data) {
        const theme = this.mapView.theme;
        const fogConfig = theme?.fog;
        if (fogConfig) {
            data.enabled = this.mapView.fog.enabled;
            data.color = fogConfig.color || data.color;
            data.ratio = fogConfig.ratio !== undefined ? fogConfig.ratio : data.ratio;
            data.range = fogConfig.range !== undefined ? fogConfig.range : data.range;
        }
    }
}
//# sourceMappingURL=FogModule.js.map