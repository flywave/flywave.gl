import {
    Borehole,
    BoreholeStratum,
    CollapsePillar,
    ColorMap,
    ExtensionHeader,
    FaultProfile,
    Metadata,
    SectionLine,
    StratumLayer
} from "./Types";

// 扩展ID常量
const STRATUM_MESH_METADATA_EXTENSION_ID = 1;
const STRATUM_MESH_COLORMAP_EXTENSION_ID = 2;
const STRATUM_MESH_FAULT_EXTENSION_ID = 3;
const STRATUM_MESH_BOREHOLE_EXTENSION_ID = 4;
const STRATUM_MESH_COLLAPSE_EXTENSION_ID = 5;
const STRATUM_MESH_SECTION_EXTENSION_ID = 6;
const STRATUM_MESH_LITHOLOGY_EXTENSION_ID = 7;

export function decodeExtensions(
    dataView: DataView<ArrayBuffer>,
    offset: number = 0
): {
    extensions: {
        metadata?: Metadata;
        colorMap?: ColorMap;
        faultProfiles?: FaultProfile[];
        boreholes?: Borehole[];
        stratumLayers?: StratumLayer[];
        collapsePillars?: CollapsePillar[];
        sectionLines?: SectionLine[];
        stratumLithology?: Record<string, string>; // 新增类型
    };
    extensionsEndPosition: number;
} {
    const extensions: any = {};
    let pos = offset;

    while (pos < dataView.byteLength) {
        // 读取扩展头
        const header: ExtensionHeader = {
            extensionId: dataView.getUint8(pos),
            extensionLength: dataView.getUint32(pos + 1, true)
        };
        pos += 5; // 1 byte for id + 4 bytes for length

        const extensionData = new Uint8Array(
            dataView.buffer,
            dataView.byteOffset + pos,
            header.extensionLength
        );
        pos += header.extensionLength;

        switch (header.extensionId) {
            case STRATUM_MESH_METADATA_EXTENSION_ID:
                extensions.metadata = readMetadata(extensionData);
                break;
            case STRATUM_MESH_COLORMAP_EXTENSION_ID:
                extensions.colorMap = readColorMap(extensionData);
                break;
            case STRATUM_MESH_FAULT_EXTENSION_ID:
                extensions.faultProfiles = readFaultProfiles(extensionData);
                break;
            case STRATUM_MESH_BOREHOLE_EXTENSION_ID:
                extensions.boreholes = readBoreholes(extensionData);
                break;
            case STRATUM_MESH_SECTION_EXTENSION_ID:
                extensions.sectionLines = readSectionLines(extensionData);
                break;
            case STRATUM_MESH_COLLAPSE_EXTENSION_ID:
                extensions.collapsePillars = readCollapsePillars(extensionData);
                break;
            case STRATUM_MESH_LITHOLOGY_EXTENSION_ID:
                extensions.stratumLithology = readStratumLithology(extensionData);
                break;
        }
    }

    return {
        extensions,
        extensionsEndPosition: pos
    };
}

function readMetadata(data: Uint8Array): Metadata {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const jsonLength = dataView.getUint32(pos, true);
    pos += 4;

    const jsonStr = new TextDecoder().decode(data.slice(pos, pos + jsonLength));
    const json = JSON.parse(jsonStr);

    return {
        jsonLength,
        json
    };
}

function readColorMap(data: Uint8Array): ColorMap {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const colorMap: ColorMap = {
        textureSize: dataView.getInt32(pos, true),
        stratumColor: {},
        stratumTexture: {},
        defaultStratum: { r: 0, g: 0, b: 0, a: 0 },
        faultColor: {},
        faultHighlight: { r: 0, g: 0, b: 0, a: 0 },
        defaultFault: { r: 0, g: 0, b: 0, a: 0 },
        collapseColor: {},
        defaultCollapse: { r: 0, g: 0, b: 0, a: 0 }
    };
    pos += 4;

    // 读取地层颜色
    const stratumCount = dataView.getInt32(pos, true);
    pos += 4;
    for (let i = 0; i < stratumCount; i++) {
        const idLen = dataView.getInt32(pos, true);
        pos += 4;
        const id = new TextDecoder().decode(data.slice(pos, pos + idLen));
        pos += idLen;

        colorMap.stratumColor[id] = {
            r: dataView.getUint8(pos),
            g: dataView.getUint8(pos + 1),
            b: dataView.getUint8(pos + 2),
            a: dataView.getUint8(pos + 3)
        };
        pos += 4;
    }

    // 读取默认地层颜色
    colorMap.defaultStratum = {
        r: dataView.getUint8(pos),
        g: dataView.getUint8(pos + 1),
        b: dataView.getUint8(pos + 2),
        a: dataView.getUint8(pos + 3)
    };
    pos += 4;

    // 读取断层颜色
    const faultCount = dataView.getInt32(pos, true);
    pos += 4;
    for (let i = 0; i < faultCount; i++) {
        const idLen = dataView.getInt32(pos, true);
        pos += 4;
        const id = new TextDecoder().decode(data.slice(pos, pos + idLen));
        pos += idLen;

        colorMap.faultColor[id] = {
            r: dataView.getUint8(pos),
            g: dataView.getUint8(pos + 1),
            b: dataView.getUint8(pos + 2),
            a: dataView.getUint8(pos + 3)
        };
        pos += 4;
    }

    // 读取高亮和默认断层颜色
    colorMap.faultHighlight = {
        r: dataView.getUint8(pos),
        g: dataView.getUint8(pos + 1),
        b: dataView.getUint8(pos + 2),
        a: dataView.getUint8(pos + 3)
    };
    pos += 4;

    colorMap.defaultFault = {
        r: dataView.getUint8(pos),
        g: dataView.getUint8(pos + 1),
        b: dataView.getUint8(pos + 2),
        a: dataView.getUint8(pos + 3)
    };
    pos += 4;

    // 读取陷落体颜色
    const collapseCount = dataView.getInt32(pos, true);
    pos += 4;
    for (let i = 0; i < collapseCount; i++) {
        const idLen = dataView.getInt32(pos, true);
        pos += 4;
        const id = new TextDecoder().decode(data.slice(pos, pos + idLen));
        pos += idLen;

        colorMap.collapseColor[id] = {
            r: dataView.getUint8(pos),
            g: dataView.getUint8(pos + 1),
            b: dataView.getUint8(pos + 2),
            a: dataView.getUint8(pos + 3)
        };
        pos += 4;
    }

    // 读取默认陷落体颜色
    colorMap.defaultCollapse = {
        r: dataView.getUint8(pos),
        g: dataView.getUint8(pos + 1),
        b: dataView.getUint8(pos + 2),
        a: dataView.getUint8(pos + 3)
    };
    pos += 4;

    // 读取纹理数据
    const textureCount = dataView.getInt32(pos, true);
    pos += 4;
    for (let i = 0; i < textureCount; i++) {
        const idLen = dataView.getInt32(pos, true);
        pos += 4;
        const id = new TextDecoder().decode(data.slice(pos, pos + idLen));
        pos += idLen;

        const length = dataView.getInt32(pos, true);
        const strBytes = new Uint8Array(dataView.buffer, dataView.byteOffset + pos + 4, length);
        colorMap.stratumTexture[id] = new TextDecoder().decode(strBytes);
        pos += length + 4;
    }

    return colorMap;
}

function readFaultProfiles(data: Uint8Array): FaultProfile[] {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const count = dataView.getInt32(pos, true);
    pos += 4;

    const faults: FaultProfile[] = [];
    for (let i = 0; i < count; i++) {
        // 动态读取字符串字段
        const [id, idOffset] = readString(dataView, pos);
        pos += 4 + idOffset;

        const [name, nameOffset] = readString(dataView, pos);
        pos += 4 + nameOffset;

        const [type, typeOffset] = readString(dataView, pos);
        pos += 4 + typeOffset;

        const fault: FaultProfile = {
            id,
            name,
            type,
            strike: dataView.getFloat64(pos, true),
            dip: dataView.getFloat64(pos + 8, true),
            throw: dataView.getFloat64(pos + 16, true),
            points: []
        };
        pos += 24;

        const pointsCount = dataView.getInt32(pos, true);
        pos += 4;

        fault.points = new Array(pointsCount);
        for (let j = 0; j < pointsCount; j++) {
            fault.points[j] = {
                x: dataView.getFloat64(pos, true),
                y: dataView.getFloat64(pos + 8, true),
                z: dataView.getFloat64(pos + 16, true)
            };
            pos += 24;
        }

        faults.push(fault);
    }

    return faults;
}

function readBoreholes(data: Uint8Array): Borehole[] {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const count = dataView.getInt32(pos, true);
    pos += 4;

    const boreholes: Borehole[] = [];
    for (let i = 0; i < count; i++) {
        // 读取钻孔ID
        const [id, idOffset] = readString(dataView, pos);
        pos += 4 + idOffset;

        // 读取位置坐标
        const location: [number, number, number] = [
            dataView.getFloat64(pos, true),
            dataView.getFloat64(pos + 8, true),
            dataView.getFloat64(pos + 16, true)
        ];
        pos += 24;

        const borehole: Borehole = {
            id,
            location,
            depth: dataView.getFloat64(pos + 24, true),
            azimuth: dataView.getFloat64(pos + 32, true),
            inclination: dataView.getFloat64(pos + 40, true),
            trajectory: [],
            stratums: []
        };
        pos += 48;

        // 读取轨迹点
        const trajCount = dataView.getInt32(pos, true);
        pos += 4;
        borehole.trajectory = new Array(trajCount);
        for (let j = 0; j < trajCount; j++) {
            borehole.trajectory[j] = {
                depth: dataView.getFloat64(pos, true),
                x: dataView.getFloat64(pos + 8, true),
                y: dataView.getFloat64(pos + 16, true),
                z: dataView.getFloat64(pos + 24, true),
                azimuth: dataView.getFloat64(pos + 32, true),
                inclination: dataView.getFloat64(pos + 40, true)
            };
            pos += 48;
        }

        // 读取地层信息
        const stratumCount = dataView.getInt32(pos, true);
        pos += 4;
        const stratums: BoreholeStratum[] = [];
        for (let j = 0; j < stratumCount; j++) {
            const [stratumId, stratumIdOffset] = readString(dataView, pos);
            pos += 4 + stratumIdOffset;

            const [lithology, lithologyOffset] = readString(dataView, pos);
            pos += 4 + lithologyOffset;

            const top = dataView.getFloat64(pos, true);
            const base = dataView.getFloat64(pos + 8, true);
            pos += 16;

            stratums.push({ id: stratumId, lithology, top, base });
        }

        borehole.stratums = stratums;

        boreholes.push(borehole);
    }

    return boreholes;
}

function readCollapsePillars(data: Uint8Array): CollapsePillar[] {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;
    const collapses: CollapsePillar[] = [];

    const count = dataView.getInt32(pos, true);
    pos += 4;

    for (let i = 0; i < count; i++) {
        // 动态读取每个字段（按Go的写入顺序）
        const [id, idOffset] = readString(dataView, pos);
        pos += 4 + idOffset;

        const [name, nameOffset] = readString(dataView, pos);
        pos += 4 + nameOffset;

        const topCenter: [number, number, number] = [
            dataView.getFloat64(pos, true),
            dataView.getFloat64(pos + 8, true),
            dataView.getFloat64(pos + 16, true)
        ];
        pos += 24;

        const baseCenter: [number, number, number] = [
            dataView.getFloat64(pos, true),
            dataView.getFloat64(pos + 8, true),
            dataView.getFloat64(pos + 16, true)
        ];
        pos += 24;

        const topRadius = dataView.getFloat64(pos, true);
        const baseRadius = dataView.getFloat64(pos + 8, true);
        const height = dataView.getFloat64(pos + 16, true);
        pos += 24;

        const [stratumId, stratumIdOffset] = readString(dataView, pos);
        pos += 4 + stratumIdOffset;

        const [lithology, lithologyOffset] = readString(dataView, pos);
        pos += 4 + lithologyOffset;

        const bbox: [[number, number, number], [number, number, number]] = [
            [
                dataView.getFloat64(pos, true),
                dataView.getFloat64(pos + 8, true),
                dataView.getFloat64(pos + 16, true)
            ],
            [
                dataView.getFloat64(pos + 24, true),
                dataView.getFloat64(pos + 32, true),
                dataView.getFloat64(pos + 40, true)
            ]
        ];
        pos += 48;

        collapses.push({
            id,
            name,
            topCenter,
            baseCenter,
            topRadius,
            baseRadius,
            height,
            stratumId,
            lithology,
            bbox
        });
    }
    return collapses;
}

function readSectionLines(data: Uint8Array): SectionLine[] {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const count = dataView.getInt32(pos, true);
    pos += 4;

    const sections: SectionLine[] = [];
    for (let i = 0; i < count; i++) {
        // 读取ID和名称
        const [id, idOffset] = readString(dataView, pos);
        pos += 4 + idOffset;

        const [name, nameOffset] = readString(dataView, pos);
        pos += 4 + nameOffset;

        // 读取坐标点
        const pointsCount = dataView.getInt32(pos, true);
        pos += 4;

        const lineString = [];
        for (let j = 0; j < pointsCount; j++) {
            lineString.push([
                dataView.getFloat64(pos, true),
                dataView.getFloat64(pos + 8, true),
                dataView.getFloat64(pos + 16, true)
            ]);
            pos += 24;
        }

        sections.push({ id, name, lineString });
    }

    return sections;
}

// 辅助函数：读取字符串
function readString(dataView: DataView, startPos: number): [string, number] {
    const length = dataView.getInt32(startPos, true);
    const strBytes = new Uint8Array(dataView.buffer, dataView.byteOffset + startPos + 4, length);
    return [
        new TextDecoder().decode(strBytes),
        4 + length // 总字节数 = 4字节长度 + 字符串内容长度
    ];
}

// 新增岩性解析函数
function readStratumLithology(data: Uint8Array): Record<string, string> {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const lithologyMap: Record<string, string> = {};

    // 读取地层数量
    const count = dataView.getInt32(pos, true);
    pos += 4;

    for (let i = 0; i < count; i++) {
        // 读取地层ID
        const [id, idOffset] = readString(dataView, pos);
        pos += 4 + idOffset; // 4字节长度 + 字符串内容

        // 读取岩性名称
        const [lithology, lithologyOffset] = readString(dataView, pos);
        pos += 4 + lithologyOffset;

        lithologyMap[id] = lithology;
    }

    return lithologyMap;
}
