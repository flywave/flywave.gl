export function assert(
    condition: boolean | (() => boolean),
    message?: string | (() => string)
): asserts condition {
    if (typeof condition !== "boolean") condition = condition();

    if (condition) return;

    message = message ?? "Programmer Error";
    if (typeof message !== "string") message = message();

    throw new Error(`Assert: ${message}`);
}
