export default {
    styles: {
        geojson: [
            // {
            //     when: "$geometryType == 'polygon'",
            //     technique: "fill",
            //     renderOrder: 0,
            //     attr: {
            //         color: "#333333", 
            //         opacity: 0.8,
            //         lineWidth: 1,
            //         lineColor: "#003344"
            //     }
            // },
            // {
            //     when: "$geometryType == 'polygon'",
            //     technique: "solid-line",
            //     renderOrder: 1,
            //     attr: {
            //         color: "#000", 
            //         metricUnit: "Pixel",
            //         lineWidth: 1
            //     }
            // },
            // {
            //     when: "$geometryType == 'polygon'",
            //     technique: "text",
            //     renderOrder: 10000, 
            //     text: ["get", "highway"],
            //     constantHeight:true,
            //     attr: {
            //         "color": "#000",
            //         backgroundColor:"#ffffff",
            //         backgroundSize:10,
            //         fontStyle: "Bold",
            //         size: 16, 
            //     }
            // },
            // {
            //     when: "$geometryType == 'point'",
            //     technique: "circles",
            //     renderOrder: 20000,
            //     constantHeight: true,
            //     attr: {
            //         size: 20,
            //         color: "#ff00ff"
            //     }
            // },
            {
                when: "$geometryType == 'polygon'",
                technique: "text",
                renderOrder: 10000,
                text: ["get", "name"],
                constantHeight: true,
                attr: {
                    "color": "#000",
                    backgroundColor: "#ffffff",
                    backgroundSize: 10,
                    fontStyle: "Bold",
                    size: 16,
                }
            },
            {
                when: "$geometryType == 'point'",
                technique: "text",
                renderOrder: 10000,
                text: ["get", "name"],
                constantHeight: true,
                attr: {
                    "color": "#000",
                    backgroundColor: "#ffffff",
                    backgroundSize: 10,
                    fontStyle: "Bold",
                    size: 16,
                }
            },
            // {
            //     when: "$geometryType == 'line'",
            //     technique: "solid-line",
            //     renderOrder: 3,
            //     attr: {
            //         color: "#000",
            //         metricUnit: "Pixel",
            //         lineWidth: 5
            //     }
            // },
            // {
            //     when: "$geometryType == 'line'",
            //     technique: "solid-line",
            //     renderOrder: 4,
            //     attr: {
            //         color: "#003344",
            //         metricUnit: "Pixel",
            //         lineWidth: 4
            //     }
            // },
            {
                when: "$geometryType == 'line'",
                technique: "text",
                renderOrder: 100000,
                text: ["get", "name"],
                constantHeight: true,
                attr: {
                    "color": "#000",
                    backgroundColor: "#ffffff",
                    backgroundSize: 10,
                    // fontStyle: "Bold",
                    size: 12,
                }
            },
            //GeoJsonDataAdapter.js line 63 
        ]
    }
}