import icon from "./icons8-drill.png";

var defaultStyles = {
    styles: {
        "stratum-drill": [
            {
                when: ["==", ["geometry-type"], "Point"],
                technique: "labeled-icon",
                text: ["get", "name"],
                priority: 10000, // Displace other labels
                size: 12,
                imageTexture: "farm-15",
                screenHeight: 32,
                iconScale: 0.5,
                distanceScale: 1,
                iconYOffset: 20
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
