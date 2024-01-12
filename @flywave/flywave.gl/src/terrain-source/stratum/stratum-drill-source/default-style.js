import icon from "./icons8-drill.png";

var defaultStyles = {
    styles: {
        geojson: [
            {
                when: "$geometryType == 'point'",
                technique: "text",
                renderOrder: 10000,
                text: ["get", "name"],
                attr: {
                    constantHeight: true,
                    "color": "#000",
                    backgroundColor: "#ffffff",
                    backgroundSize: 10,
                    fontStyle: "Bold",
                    size: 16,
                }
            }
        ]
    },
    images: {
        "stratum-icon": {
            url: icon,
            preload: true
        }
    },
    imageTextures: [
        {
            name: "stratum-icon",
            image: "stratum-icon"
        }
    ]
};

export default defaultStyles;
