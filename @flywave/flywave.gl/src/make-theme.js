import config from "./config";

export function makeMapTheme(baseStyle, properties) {
    if (!baseStyle) {
        return { ...properties };
    }
    return {
        extends: `${config.RESOURCE_BASE_URL}/${baseStyle}.json`,
        ...properties
    };
}
