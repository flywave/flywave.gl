/* Copyright (C) 2025 flywave.gl contributors */

import {
    type BoreholeData,
    type BoreholeStratum,
    type CollapsePillarData,
    type ExtensionHeader,
    type FaultProfileData,
    type Material,
    type Metadata,
    type SectionLineData
} from "./types";

// 扩展ID常量
const STRATUM_MESH_MATERIALS_EXTENSION_ID = 1;
const STRATUM_MESH_METADATA_EXTENSION_ID = 2;
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
        materials?: Material[];
        faultProfiles?: FaultProfileData[];
        boreholes?: BoreholeData[];
        collapsePillars?: CollapsePillarData[];
        sectionLines?: SectionLineData[];
        stratumLithology?: Record<string, string>; // 新增类型
    };
    extensionsEndPosition: number;
} {
    const extensions: {
        metadata?: Metadata;
        materials?: Material[];
        faultProfiles?: FaultProfileData[];
        boreholes?: BoreholeData[];
        collapsePillars?: CollapsePillarData[];
        sectionLines?: SectionLineData[];
        stratumLithology?: Record<string, string>;
    } = {};
    let pos = offset;

    while (pos < dataView.byteLength) {
        // 读取扩展头
        const header: ExtensionHeader = {
            extensionId: dataView.getUint8(pos),
            extensionLength: dataView.getUint32(pos + 1, true)
        };
        pos += 5; // 1 byte for id + 4 bytes for length

        if (header.extensionLength == 0) {
            continue;
        }

        const extensionData = new Uint8Array(dataView.buffer, dataView.byteOffset + pos);

        switch (header.extensionId) {
            case STRATUM_MESH_METADATA_EXTENSION_ID: {
                const { metadata, length } = readMetadata(extensionData);
                extensions.metadata = metadata;
                pos += length;
                break;
            }
            case STRATUM_MESH_MATERIALS_EXTENSION_ID: {
                const { materials, length } = readMaterials(extensionData);
                extensions.materials = materials;
                pos += length;
                break;
            }
            case STRATUM_MESH_FAULT_EXTENSION_ID: {
                const { faultProfiles, length } = readFaultProfiles(extensionData);
                extensions.faultProfiles = faultProfiles;
                pos += length;
                break;
            }
            case STRATUM_MESH_BOREHOLE_EXTENSION_ID: {
                const { boreholes, length } = readBoreholes(extensionData);
                extensions.boreholes = boreholes;
                pos += length;
                break;
            }
            case STRATUM_MESH_SECTION_EXTENSION_ID: {
                const { sectionLines, length } = readSectionLines(extensionData);
                extensions.sectionLines = sectionLines;
                pos += length;
                break;
            }
            case STRATUM_MESH_COLLAPSE_EXTENSION_ID: {
                const { collapsePillars, length } = readCollapsePillars(extensionData);
                extensions.collapsePillars = collapsePillars;
                pos += length;
                break;
            }
            case STRATUM_MESH_LITHOLOGY_EXTENSION_ID: {
                const { lithologyMap, length } = readStratumLithology(extensionData);
                extensions.stratumLithology = lithologyMap;
                pos += length;
                break;
            }
        }
    }

    return {
        extensions,
        extensionsEndPosition: pos
    };
}

function readMetadata(data: Uint8Array): { metadata: Metadata; length: number } {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const jsonLength = dataView.getUint32(pos, true);
    pos += 4;

    const jsonStr = new TextDecoder().decode(data.slice(pos, pos + jsonLength));
    const json = JSON.parse(jsonStr);

    return {
        metadata: {
            jsonLength,
            json
        },
        length: jsonLength + 4
    };
}

function readMaterials(data: Uint8Array): { materials: Material[]; length: number } {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    // 读取材料数量
    const count = dataView.getInt32(pos, true);
    pos += 4;

    const materials: Material[] = [];
    for (let i = 0; i < count; i++) {
        // 读取颜色 (4 个 uint8)
        const r = dataView.getUint8(pos);
        const g = dataView.getUint8(pos + 1);
        const b = dataView.getUint8(pos + 2);
        const a = dataView.getUint8(pos + 3);
        pos += 4;

        // 读取纹理矩形 (4 个 int32)
        const x0 = dataView.getInt32(pos, true);
        const y0 = dataView.getInt32(pos + 4, true);
        const x1 = dataView.getInt32(pos + 8, true);
        const y1 = dataView.getInt32(pos + 12, true);
        pos += 16;

        materials.push({
            color: { r, g, b, a },
            uvTransform: [x0, y0, x1, y1]
        });
    }

    return {
        materials,
        length: pos
    };
}

function readFaultProfiles(data: Uint8Array): {
    faultProfiles: FaultProfileData[];
    length: number;
} {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const count = dataView.getInt32(pos, true);
    pos += 4;

    const faults: FaultProfileData[] = [];
    for (let i = 0; i < count; i++) {
        // 动态读取字符串字段
        const [id, idOffset] = readString(dataView, pos);
        pos += idOffset;

        const [name, nameOffset] = readString(dataView, pos);
        pos += nameOffset;

        const [type, typeOffset] = readString(dataView, pos);
        pos += typeOffset;

        const fault: FaultProfileData = {
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

    return {
        faultProfiles: faults,
        length: pos
    };
}

function readBoreholes(data: Uint8Array): { boreholes: BoreholeData[]; length: number } {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const count = dataView.getInt32(pos, true);
    pos += 4;

    const boreholes: BoreholeData[] = [];
    for (let i = 0; i < count; i++) {
        // 读取钻孔ID
        const [id, idOffset] = readString(dataView, pos);
        pos += idOffset;

        // 读取位置坐标
        const location: [number, number, number] = [
            dataView.getFloat64(pos, true),
            dataView.getFloat64(pos + 8, true),
            dataView.getFloat64(pos + 16, true)
        ];
        pos += 24;

        const borehole: BoreholeData = {
            id,
            location,
            depth: dataView.getFloat64(pos, true),
            azimuth: dataView.getFloat64(pos + 8, true),
            inclination: dataView.getFloat64(pos + 16, true),
            trajectory: [],
            stratums: []
        };
        pos += 24;

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
            pos += stratumIdOffset;

            const [lithology, lithologyOffset] = readString(dataView, pos);
            pos += lithologyOffset;

            const top = dataView.getFloat64(pos, true);
            const base = dataView.getFloat64(pos + 8, true);
            pos += 16;

            stratums.push({ id: stratumId, lithology, top, base });
        }

        borehole.stratums = stratums;

        boreholes.push(borehole);
    }

    return {
        boreholes,
        length: pos
    };
}

function readCollapsePillars(data: Uint8Array): {
    collapsePillars: CollapsePillarData[];
    length: number;
} {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;
    const collapses: CollapsePillarData[] = [];

    const count = dataView.getInt32(pos, true);
    pos += 4;

    for (let i = 0; i < count; i++) {
        // 动态读取每个字段（按Go的写入顺序）
        const [id, idOffset] = readString(dataView, pos);
        pos += idOffset;

        const [name, nameOffset] = readString(dataView, pos);
        pos += nameOffset;

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

        collapses.push({
            id,
            name,
            topCenter,
            baseCenter,
            topRadius,
            baseRadius,
            height,
            stratumId,
            lithology
        });
    }
    return {
        collapsePillars: collapses,
        length: pos
    };
}

function readSectionLines(data: Uint8Array): {
    sectionLines: SectionLineData[];
    length: number;
} {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const count = dataView.getInt32(pos, true);
    pos += 4;

    const sections: SectionLineData[] = [];
    for (let i = 0; i < count; i++) {
        // 读取ID和名称
        const [id, idOffset] = readString(dataView, pos);
        pos += idOffset;

        const [name, nameOffset] = readString(dataView, pos);
        pos += nameOffset;

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

    return {
        sectionLines: sections,
        length: pos
    };
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
function readStratumLithology(data: Uint8Array): {
    lithologyMap: Record<string, string>;
    length: number;
} {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const lithologyMap: Record<string, string> = {};

    // 读取地层数量
    const count = dataView.getInt32(pos, true);
    pos += 4;

    for (let i = 0; i < count; i++) {
        // 读取地层ID
        const [id, idOffset] = readString(dataView, pos);
        pos += idOffset; // 4字节长度 + 字符串内容

        // 读取岩性名称
        const [lithology, lithologyOffset] = readString(dataView, pos);
        pos += lithologyOffset;

        lithologyMap[id] = lithology;
    }

    return {
        lithologyMap,
        length: pos
    };
}
