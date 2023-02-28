import { defined } from "./utils";
import DeveloperError from "../../util/developer-error";  

/**
 * Constants for WebGL index datatypes.  These corresponds to the
 * <code>type</code> parameter of {@link http://www.khronos.org/opengles/sdk/docs/man/xhtml/glDrawElements.xml|drawElements}.
 *
 * @enum {Number}
 */

const SIXTY_FOUR_KILOBYTES = 64 * 1024;

var IndexDatatype = { 
};
 

/**
 * Creates a typed array that will store indices, using either <code><Uint16Array</code>
 * or <code>Uint32Array</code> depending on the number of vertices.
 *
 * @param {Number} numberOfVertices Number of vertices that the indices will reference.
 * @param {Number|Array} indicesLengthOrArray Passed through to the typed array constructor.
 * @returns {Uint16Array|Uint32Array} A <code>Uint16Array</code> or <code>Uint32Array</code> constructed with <code>indicesLengthOrArray</code>.
 *
 * @example
 * this.indices = Cesium.IndexDatatype.createTypedArray(positions.length / 3, numberOfIndices);
 */
IndexDatatype.createTypedArray = function (
    numberOfVertices,
    indicesLengthOrArray
) {
    //>>includeStart('debug', pragmas.debug);
    if (!defined(numberOfVertices)) {
        throw new DeveloperError("numberOfVertices is required.");
    }
    //>>includeEnd('debug');

    if (numberOfVertices >= SIXTY_FOUR_KILOBYTES) {
        return new Uint32Array(indicesLengthOrArray);
    }

    return new Uint16Array(indicesLengthOrArray);
};

/**
 * Creates a typed array from a source array buffer.  The resulting typed array will store indices, using either <code><Uint16Array</code>
 * or <code>Uint32Array</code> depending on the number of vertices.
 *
 * @param {Number} numberOfVertices Number of vertices that the indices will reference.
 * @param {ArrayBuffer} sourceArray Passed through to the typed array constructor.
 * @param {Number} byteOffset Passed through to the typed array constructor.
 * @param {Number} length Passed through to the typed array constructor.
 * @returns {Uint16Array|Uint32Array} A <code>Uint16Array</code> or <code>Uint32Array</code> constructed with <code>sourceArray</code>, <code>byteOffset</code>, and <code>length</code>.
 *
 */

 

IndexDatatype.createTypedArrayFromArrayBuffer = function (
    numberOfVertices,
    sourceArray,
    byteOffset,
    length
) {
    //>>includeStart('debug', pragmas.debug);
    if (!defined(numberOfVertices)) {
        throw new DeveloperError("numberOfVertices is required.");
    }
    if (!defined(sourceArray)) {
        throw new DeveloperError("sourceArray is required.");
    }
    if (!defined(byteOffset)) {
        throw new DeveloperError("byteOffset is required.");
    }
    //>>includeEnd('debug');

    if (numberOfVertices >= SIXTY_FOUR_KILOBYTES) {
        return new Uint32Array(sourceArray, byteOffset, length);
    }

    return new Uint16Array(sourceArray, byteOffset, length);
};

export default Object.freeze(IndexDatatype);
