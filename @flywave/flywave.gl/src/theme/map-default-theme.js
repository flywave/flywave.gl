import config from "../config"

export default function makeMapDefaultTheme() {
    return {
        extends: `${config.RESOURCE_BASE_URL}/berlin_tilezen_base_globe.json`,
        fog: {
            color: "#ffffff",
            startRatio: 0.8,
        },
        lights: [
            {
                type: "ambient",
                color: "#ffffff",
                name: "ambientLight",
                intensity: 0.9,
            },
            {
                type: "directional",
                color: "#CCCBBB",
                name: "light1",
                intensity: 0.8,
                direction: {
                    x: 1,
                    y: 5,
                    z: 0.5,
                },
            },
            {
                type: "directional",
                color: "#F4DB9C",
                name: "light2",
                intensity: 0.8,
                direction: {
                    x: -1,
                    y: -3,
                    z: 1,
                },
                castShadow: true,
            },
        ],
        definitions: {
            defaultBuildingColor: { value: "#EDE7E1FF" },
        },
    }
}