
export function defaultValue(a, b) {
    return a || b;
}

export function defined(value) {
    return value !== undefined && value !== null;
}

export function formatUrl(url, templateValues, queryParam) {
    const { version, z, x, y } = templateValues;
    var q = [];
    for (var i in queryParam) {
        q.push(`${i}=${queryParam[i]}`);
    }
    var url = url.replace("{x}", x).replace("{y}", y).replace("{z}", z).replace("{version}", version);

    return `${url}?${q.join('&')}`;
}