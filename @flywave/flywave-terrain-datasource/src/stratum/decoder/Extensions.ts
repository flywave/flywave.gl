import {
    Borehole,
    BoreholeStratum,
    CollapsePillar,
    EmbeddedBodyData,
    ExtensionHeader,
    Extensions,
    FaultProfile,
    Material,
    Metadata,
    SectionLine,
    SeismicCubeData,
    StratumLayer
} from "./Types";

// 扩展ID常量
const STRATUM_MESH_METADATA_EXTENSION_ID = 1;
const STRATUM_MESH_MATERIALS_EXTENSION_ID = 2;
const STRATUM_MESH_FAULT_EXTENSION_ID = 3;
const STRATUM_MESH_BOREHOLE_EXTENSION_ID = 4;
const STRATUM_MESH_COLLAPSE_EXTENSION_ID = 5;
const STRATUM_MESH_SECTION_EXTENSION_ID = 6;
const STRATUM_MESH_LITHOLOGY_EXTENSION_ID = 7;
const STRATUM_MESH_SEISMIC_EXTENSION_ID = 8;
const STRATUM_MESH_EMBEDDED_EXTENSION_ID = 9;

export function decodeExtensions(
    dataView: DataView<ArrayBuffer>,
    offset: number = 0
): {
    extensions: Extensions;
    extensionsEndPosition: number;
} {
    const extensions: any = {};
    let pos = offset;

    // v1 TLV: uint32 count, then per-ext (uint8 id + uint32 len + data).
    const extCount = dataView.getUint32(pos, true);
    pos += 4;

    for (let i = 0; i < extCount; i++) {
        const header: ExtensionHeader = {
            extensionId: dataView.getUint8(pos),
            extensionLength: dataView.getUint32(pos + 1, true)
        };
        pos += 5; // 1 byte for id + 4 bytes for length

        if (header.extensionLength === 0) continue;

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
            case STRATUM_MESH_MATERIALS_EXTENSION_ID:
                extensions.materials = readMaterials(extensionData);
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
            case STRATUM_MESH_SEISMIC_EXTENSION_ID:
                extensions.seismicCubes = readSeismicCubes(extensionData);
                break;
            case STRATUM_MESH_EMBEDDED_EXTENSION_ID:
                extensions.embeddedBodies = readEmbeddedBodies(extensionData);
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

function readMaterials(data: Uint8Array): Material[] {
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
            texture: [x0, y0, x1, y1]
        });
    }

    return materials;
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

// ====== 地震数据扩展 (ExtId=8) ======

function readSeismicCubes(data: Uint8Array): SeismicCubeData[] {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const count = dataView.getInt32(pos, true);
    pos += 4;

    const cubes: SeismicCubeData[] = [];
    for (let i = 0; i < count; i++) {
        const [id, idOffset] = readString(dataView, pos);
        pos += 4 + idOffset;

        const [name, nameOffset] = readString(dataView, pos);
        pos += 4 + nameOffset;

        const inlineCount = dataView.getInt32(pos, true);
        const crosslineCount = dataView.getInt32(pos + 4, true);
        const sampleCount = dataView.getInt32(pos + 8, true);
        const sampleInterval = dataView.getFloat64(pos + 12, true);
        pos += 20;

        const inlineMin = dataView.getInt32(pos, true);
        const inlineMax = dataView.getInt32(pos + 4, true);
        const crosslineMin = dataView.getInt32(pos + 8, true);
        const crosslineMax = dataView.getInt32(pos + 12, true);
        pos += 16;

        const timeMin = dataView.getFloat64(pos, true);
        const timeMax = dataView.getFloat64(pos + 8, true);
        pos += 16;

        const cornerTL: [number, number, number] = [
            dataView.getFloat64(pos, true),
            dataView.getFloat64(pos + 8, true),
            dataView.getFloat64(pos + 16, true)
        ];
        const cornerTR: [number, number, number] = [
            dataView.getFloat64(pos + 24, true),
            dataView.getFloat64(pos + 32, true),
            dataView.getFloat64(pos + 40, true)
        ];
        const cornerBL: [number, number, number] = [
            dataView.getFloat64(pos + 48, true),
            dataView.getFloat64(pos + 56, true),
            dataView.getFloat64(pos + 64, true)
        ];
        const cornerBR: [number, number, number] = [
            dataView.getFloat64(pos + 72, true),
            dataView.getFloat64(pos + 80, true),
            dataView.getFloat64(pos + 88, true)
        ];
        pos += 96;

        const azimuth = dataView.getFloat64(pos, true);
        const minAmplitude = dataView.getFloat64(pos + 8, true);
        const maxAmplitude = dataView.getFloat64(pos + 16, true);
        const meanAmplitude = dataView.getFloat64(pos + 24, true);
        const rmsAmplitude = dataView.getFloat64(pos + 32, true);
        pos += 40;

        const sourceFormat = dataView.getInt32(pos, true);
        pos += 4;

        const isMigrated = dataView.getUint8(pos) !== 0;
        const isStack = dataView.getUint8(pos + 1) !== 0;
        pos += 2;

        cubes.push({
            id, name, inlineCount, crosslineCount, sampleCount, sampleInterval,
            inlineMin, inlineMax, crosslineMin, crosslineMax,
            timeMin, timeMax, cornerTL, cornerTR, cornerBL, cornerBR,
            azimuth, minAmplitude, maxAmplitude, meanAmplitude, rmsAmplitude,
            sourceFormat, isMigrated, isStack
        });
    }
    return cubes;
}

// ====== 嵌入体扩展 (ExtId=9) ======

function readEmbeddedBodies(data: Uint8Array): EmbeddedBodyData[] {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    const count = dataView.getInt32(pos, true);
    pos += 4;

    const bodies: EmbeddedBodyData[] = [];
    for (let i = 0; i < count; i++) {
        const [id, idOffset] = readString(dataView, pos);
        pos += 4 + idOffset;

        const [name, nameOffset] = readString(dataView, pos);
        pos += 4 + nameOffset;

        const [lithology, lithologyOffset] = readString(dataView, pos);
        pos += 4 + lithologyOffset;

        const [stratumId, stratumIdOffset] = readString(dataView, pos);
        pos += 4 + stratumIdOffset;

        bodies.push({ id, name, lithology, stratumId });
    }
    return bodies;
}
