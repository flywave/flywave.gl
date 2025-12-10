/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Finds an item in a sorted array.
 *
 * @function
 * @param {Array} array The sorted array to search.
 * @param {*} itemToFind The item to find in the array.
 * @param {binarySearchComparator} comparator The function to use to compare the item to
 *        elements in the array.
 * @returns {Number} The index of <code>itemToFind</code> in the array, if it exists.  If <code>itemToFind</code>
 *        does not exist, the return value is a negative number which is the bitwise complement (~)
 *        of the index before which the itemToFind should be inserted in order to maintain the
 *        sorted order of the array.
 *
 * @example
 * // Create a comparator function to search through an array of numbers.
 * function comparator(a, b) {
 *     return a - b;
 * };
 * var numbers = [0, 2, 4, 6, 8];
 * var index = Cesium.binarySearch(numbers, 6, comparator); // 3
 */
type BinarySearchComparator<T, C> = (a: T, b: C) => number;

function binarySearch<T, C>(
    array: T[],
    itemToFind: C,
    comparator: BinarySearchComparator<T, C>
): number {
    let low = 0;
    let high = array.length - 1;

    while (low <= high) {
        const i = ~~((low + high) / 2);
        const comparison = comparator(array[i], itemToFind);
        if (comparison < 0) {
            low = i + 1;
        } else if (comparison > 0) {
            high = i - 1;
        } else {
            return i;
        }
    }
    return ~(high + 1);
}

export { binarySearch };
