import { defined, IndexDatatype } from "@flywave/flywave-utils";

const SIXTY_FOUR_KILOBYTES = 64 * 1024;

const FOUR_GIGABYTES = 4 * 1024 * 1024 * 1024;

/**
 * 添加裙边索引到索引数组中
 * @private
 * @param westIndicesSouthToNorth 西边从南到北的索引数组
 * @param southIndicesEastToWest 南边从东到西的索引数组
 * @param eastIndicesNorthToSouth 东边从北到南的索引数组
 * @param northIndicesWestToEast 北边从西到东的索引数组
 * @param vertexCount 顶点总数
 * @param indices 索引数组
 * @param offset 起始偏移量
 * @returns 更新后的偏移量
 */
export function addSkirtIndices(
    westIndicesSouthToNorth: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>,
    southIndicesEastToWest: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>,
    eastIndicesNorthToSouth: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>,
    northIndicesWestToEast: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>,
    vertexCount: number,
    indices: Uint16Array | Uint32Array,
    offset: number
): number {
    let vertexIndex = vertexCount;
    offset = _addSkirtEdgeIndices(westIndicesSouthToNorth, vertexIndex, indices, offset);
    vertexIndex += westIndicesSouthToNorth.length;
    offset = _addSkirtEdgeIndices(southIndicesEastToWest, vertexIndex, indices, offset);
    vertexIndex += southIndicesEastToWest.length;
    offset = _addSkirtEdgeIndices(eastIndicesNorthToSouth, vertexIndex, indices, offset);
    vertexIndex += eastIndicesNorthToSouth.length;
    offset = _addSkirtEdgeIndices(northIndicesWestToEast, vertexIndex, indices, offset);
    return offset;
}

/**
 * 内部使用的单个边裙边索引添加函数
 * @param edgeIndices 边缘索引数组
 * @param vertexIndex 顶点起始索引
 * @param indices 索引数组
 * @param offset 起始偏移量
 * @returns 更新后的偏移量
 */
function _addSkirtEdgeIndices(
    edgeIndices: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>,
    vertexIndex: number,
    indices: Uint16Array | Uint32Array,
    offset: number
): number {
    let previousIndex = edgeIndices[0];
    const length = edgeIndices.length;

    for (let i = 1; i < length; ++i) {
        const index = edgeIndices[i];

        indices[offset++] = previousIndex;
        indices[offset++] = index;
        indices[offset++] = vertexIndex;

        indices[offset++] = vertexIndex;
        indices[offset++] = index;
        indices[offset++] = vertexIndex + 1;

        previousIndex = index;
        ++vertexIndex;
    }

    return offset;
}

interface EdgeIndices {
    westIndicesSouthToNorth: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>;
    southIndicesEastToWest: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>;
    eastIndicesNorthToSouth: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>;
    northIndicesWestToEast: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>;
}

/**
 * 获取网格边缘的索引数组
 * @param width 网格宽度(顶点数)
 * @param height 网格高度(顶点数)
 * @returns 包含四个边缘索引数组的对象
 */
function getEdgeIndices(width: number, height: number): EdgeIndices {
    const westIndicesSouthToNorth = new Uint32Array(height);
    const southIndicesEastToWest = new Uint32Array(width);
    const eastIndicesNorthToSouth = new Uint32Array(height);
    const northIndicesWestToEast = new Uint32Array(width);

    for (let i = 0; i < width; ++i) {
        northIndicesWestToEast[i] = i;
        southIndicesEastToWest[i] = width * height - 1 - i;
    }

    for (let i = 0; i < height; ++i) {
        eastIndicesNorthToSouth[i] = (i + 1) * width - 1;
        westIndicesSouthToNorth[i] = (height - i - 1) * width;
    }

    return {
        westIndicesSouthToNorth,
        southIndicesEastToWest,
        eastIndicesNorthToSouth,
        northIndicesWestToEast
    };
}

interface IndicesAndEdges {
    indices: Uint16Array | Uint32Array;
    westIndicesSouthToNorth: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>;
    southIndicesEastToWest: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>;
    eastIndicesNorthToSouth: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>;
    northIndicesWestToEast: Uint16Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>;
    indexCountWithoutSkirts: number;
}

/**
 * 添加规则网格索引到索引数组中
 * @param width 网格宽度(顶点数)
 * @param height 网格高度(顶点数)
 * @param indices 索引数组
 * @param offset 起始偏移量
 */
function addRegularGridIndices(
    width: number,
    height: number,
    indices: Uint16Array | Uint32Array,
    offset: number
): void {
    let index = 0;
    for (let j = 0; j < height - 1; ++j) {
        for (let i = 0; i < width - 1; ++i) {
            const upperLeft = index;
            const lowerLeft = upperLeft + width;
            const lowerRight = lowerLeft + 1;
            const upperRight = upperLeft + 1;

            indices[offset++] = upperLeft;
            indices[offset++] = lowerLeft;
            indices[offset++] = upperRight;
            indices[offset++] = upperRight;
            indices[offset++] = lowerLeft;
            indices[offset++] = lowerRight;

            ++index;
        }
        ++index;
    }
}

var regularGridAndSkirtAndEdgeIndicesCache = [];

var regularGridIndicesCache = [];

/**
 * 获取规则网格的索引数组
 * @param width 网格宽度(顶点数)
 * @param height 网格高度(顶点数)
 * @returns 索引数组(Uint16Array或Uint32Array)
 */
export function getRegularGridIndices(width: number, height: number): Uint16Array | Uint32Array {
    if (width * height >= FOUR_GIGABYTES) {
        throw new Error(
            "The total number of vertices (width * height) must be less than 4,294,967,296."
        );
    }

    let byWidth = regularGridIndicesCache[width];
    if (!defined(byWidth)) {
        regularGridIndicesCache[width] = byWidth = [];
    }

    let indices = byWidth[height];
    if (!defined(indices)) {
        if (width * height < SIXTY_FOUR_KILOBYTES) {
            indices = byWidth[height] = new Uint16Array((width - 1) * (height - 1) * 6);
        } else {
            indices = byWidth[height] = new Uint32Array((width - 1) * (height - 1) * 6);
        }
        addRegularGridIndices(width, height, indices, 0);
    }

    return indices;
}

/**
 * 获取带有裙边和边缘索引的规则网格索引
 * @private
 * @param width 网格宽度(顶点数)
 * @param height 网格高度(顶点数)
 * @returns 包含索引和边缘信息的对象
 */
export function getRegularGridAndSkirtIndicesAndEdgeIndices(
    width: number,
    height: number
): IndicesAndEdges {
    if (width * height >= FOUR_GIGABYTES) {
        throw new Error(
            "The total number of vertices (width * height) must be less than 4,294,967,296."
        );
    }

    let byWidth = regularGridAndSkirtAndEdgeIndicesCache[width];
    if (!defined(byWidth)) {
        regularGridAndSkirtAndEdgeIndicesCache[width] = byWidth = [];
    }

    let indicesAndEdges = byWidth[height];
    if (!defined(indicesAndEdges)) {
        const gridVertexCount = width * height;
        const gridIndexCount = (width - 1) * (height - 1) * 6;
        const edgeVertexCount = width * 2 + height * 2;
        const edgeIndexCount = Math.max(0, edgeVertexCount - 4) * 6;
        const vertexCount = gridVertexCount + edgeVertexCount;
        const indexCount = gridIndexCount + edgeIndexCount;

        const edgeIndices = getEdgeIndices(width, height);
        const indices = IndexDatatype.createTypedArray(vertexCount, indexCount);

        addRegularGridIndices(width, height, indices, 0);
        addSkirtIndices(
            edgeIndices.westIndicesSouthToNorth,
            edgeIndices.southIndicesEastToWest,
            edgeIndices.eastIndicesNorthToSouth,
            edgeIndices.northIndicesWestToEast,
            gridVertexCount,
            indices,
            gridIndexCount
        );

        indicesAndEdges = byWidth[height] = {
            indices: indices,
            westIndicesSouthToNorth: edgeIndices.westIndicesSouthToNorth,
            southIndicesEastToWest: edgeIndices.southIndicesEastToWest,
            eastIndicesNorthToSouth: edgeIndices.eastIndicesNorthToSouth,
            northIndicesWestToEast: edgeIndices.northIndicesWestToEast,
            indexCountWithoutSkirts: gridIndexCount
        };
    }

    return indicesAndEdges;
}
