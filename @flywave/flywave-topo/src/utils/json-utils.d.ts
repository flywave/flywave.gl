/** Utility functions for converting from JSON objects, with default values.
 * @public
 */
export declare namespace JsonUtils {
    /** Get a value as a boolean.
     * @param json the input JSON object
     * @param defaultVal default value if json cannot be converted to boolean
     * @returns the value of json as a boolean, or default value
     */
    function asBool(json: any, defaultVal?: boolean): boolean;
    /** Get a value as an integer.
     * @param json the input JSON object
     * @param defaultVal default value if json cannot be converted to integer
     * @returns the value of json as an integer, or default value
     */
    function asInt(json: any, defaultVal?: number): number;
    /** Get a value as a double.
     * @param json the input JSON object
     * @param defaultVal default value if json cannot be converted to double
     * @returns the value of json as a double, or default value
     */
    function asDouble(json: any, defaultVal?: number): number;
    /** Get a value as a string.
     * @param json the input JSON object
     * @param defaultVal default value if json cannot be converted to string
     * @returns the value of json as a string, or default value
     */
    function asString(json: any, defaultVal?: string): string;
    /** Get a value as an array.
     * @param json the input JSON object
     * @returns the input JSON object if it is an array, otherwise undefined
     */
    function asArray(json: any): any;
    /** Get a value as an object.
     * @param json the input JSON object
     * @returns the input JSON object if it is an object, otherwise undefined
     */
    function asObject(json: any): any;
    /** Set or remove a number on a json object, given a key name, a value, and a default value. Sets `json[key] = val` if val is *not* equal to the default,
     * otherwise `delete json[key]`. This is used to omit values from JSON strings that are of known defaults.
     * @param json the JSON object to affect
     * @param key the name of the member to set or remove
     * @param val the value to set
     * @param defaultVal the default value.
     */
    function setOrRemoveNumber(json: any, key: string, val: number, defaultVal: number): void;
    /** Set or remove a boolean on a json object, given a key name, a value, and a default value. Sets `json[key] = val` if val is *not* equal to the default,
     * otherwise `delete json[key]`. This is used to omit values from JSON strings that are of known defaults.
     * @param json the JSON object to affect
     * @param key the name of the member to set or remove
     * @param val the value to set
     * @param defaultVal the default value.
     */
    function setOrRemoveBoolean(json: any, key: string, val: boolean, defaultVal: boolean): void;
    /** Determine if a Javascript object is equivalent to `{}`.
     * @param json The JSON object to test.
     * @returns true if `json` is an Object with no keys.
     */
    function isEmptyObject(json: any): boolean;
    /** Determine if the input is undefined or an empty Javascript object.
     * @param json The JSON object to test.
     * @returns true if `json` is undefined or is an Object with no keys (equivalent to `{}`).
     */
    function isEmptyObjectOrUndefined(json: any): boolean;
    /** Determine if the input is a non-empty Javascript object.
     * @param value The value to test.
     * @returns true if `value` is an Object with at least one key.
     */
    function isNonEmptyObject(value: any): value is Object;
    /**
     * Convert the input object into a "pure" JavaScript object, with only instances of "object" or primitives in the returned value.
     * Works recursively for object members, and over arrays entries. Calls "toJSON" on any members that implement it.
     */
    function toObject(val: any): any;
}
