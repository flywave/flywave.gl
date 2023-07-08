import config from "./config";

export function makeMapTheme(baseStyle, properties) {
    return {
        extends: `${config.RESOURCE_BASE_URL}/${baseStyle}.json`,
        ...properties
    };
}
