export type PartStatus = "normal" | "warning" | "fault";

export interface PartInfo {
    subsystemId: string;
    name: string;
    manufacturer: string;
    model: string;
    installDate: string;
    operatingHours: number;
    status: PartStatus;
    lastMaintenance: string;
    nextMaintenance: string;
    temperature: number;
    vibration: number;
    power: number;
    description: string;
}

interface SubsystemDef {
    id: string;
    name: string;
    namePatterns: RegExp[];
    zRange?: [number, number];
    info: PartInfo;
}

const SUBSYSTEMS: SubsystemDef[] = [
    {
        id: "cutterhead",
        name: "刀盘系统",
        namePatterns: [/^封顶\s*1/, /^平滑\s*1/],
        zRange: [-1681, -1300],
        info: {
            subsystemId: "cutterhead",
            name: "刀盘系统",
            manufacturer: "中铁装备集团",
            model: "TBM-6280-C",
            installDate: "2024-03-15",
            operatingHours: 4320,
            status: "normal",
            lastMaintenance: "2025-05-20",
            nextMaintenance: "2025-08-20",
            temperature: 42.3,
            vibration: 2.1,
            power: 1200,
            description:
                "刀盘是盾构机的前端切割机构，配备盘形滚刀和刮刀，用于破碎和切削岩土体。刀盘直径6.28m，最大扭矩8500kN·m。"
        }
    },
    {
        id: "front_shield",
        name: "前盾体",
        namePatterns: [/平滑细分/],
        zRange: [-1300, -800],
        info: {
            subsystemId: "front_shield",
            name: "前盾体",
            manufacturer: "中铁装备集团",
            model: "SH-6280-F",
            installDate: "2024-03-15",
            operatingHours: 4320,
            status: "normal",
            lastMaintenance: "2025-06-01",
            nextMaintenance: "2025-09-01",
            temperature: 38.7,
            vibration: 1.5,
            power: 0,
            description:
                "前盾体是刀盘后方的主承载结构，内部集成土仓、推进油缸和螺旋输送机接口。采用高强度钢板焊接结构。"
        }
    },
    {
        id: "middle_shield",
        name: "中盾体",
        namePatterns: [/^封顶\s*2/],
        zRange: [-800, -200],
        info: {
            subsystemId: "middle_shield",
            name: "中盾体",
            manufacturer: "中铁装备集团",
            model: "SH-6280-M",
            installDate: "2024-03-15",
            operatingHours: 4320,
            status: "warning",
            lastMaintenance: "2025-04-10",
            nextMaintenance: "2025-07-10",
            temperature: 41.2,
            vibration: 3.8,
            power: 0,
            description:
                "中盾体连接前盾与盾尾，内设人员仓、液压泵站和配电系统。当前振动值偏高，建议检查连接螺栓。"
        }
    },
    {
        id: "shield_tail",
        name: "盾尾",
        namePatterns: [/^平滑\s*2/],
        zRange: [-200, 400],
        info: {
            subsystemId: "shield_tail",
            name: "盾尾",
            manufacturer: "中铁装备集团",
            model: "SH-6280-T",
            installDate: "2024-03-15",
            operatingHours: 4320,
            status: "normal",
            lastMaintenance: "2025-05-28",
            nextMaintenance: "2025-08-28",
            temperature: 35.6,
            vibration: 1.2,
            power: 0,
            description:
                "盾尾位于中盾体后方，设有盾尾密封和同步注浆管路。盾尾密封采用三道钢丝刷密封结构。"
        }
    },
    {
        id: "thrust_system",
        name: "推进系统",
        namePatterns: [/^挤压\s*NURBS/],
        zRange: [-1200, -100],
        info: {
            subsystemId: "thrust_system",
            name: "推进系统",
            manufacturer: "力士乐(Rexroth)",
            model: "TH-32x200-4",
            installDate: "2024-03-20",
            operatingHours: 4280,
            status: "normal",
            lastMaintenance: "2025-05-15",
            nextMaintenance: "2025-08-15",
            temperature: 52.1,
            vibration: 2.3,
            power: 450,
            description:
                "推进系统由32根液压油缸组成，单缸推力2000kN，总推力32000kN。油缸行程2000mm，推进速度0-80mm/min可调。"
        }
    },
    {
        id: "screw_conveyor",
        name: "螺旋输送机",
        namePatterns: [/^扫描\s*NURBS/],
        zRange: [-1000, 1200],
        info: {
            subsystemId: "screw_conveyor",
            name: "螺旋输送机",
            manufacturer: "海瑞克(Herrenknecht)",
            model: "SC-900-L12",
            installDate: "2024-04-01",
            operatingHours: 4100,
            status: "normal",
            lastMaintenance: "2025-06-05",
            nextMaintenance: "2025-09-05",
            temperature: 36.8,
            vibration: 4.2,
            power: 350,
            description:
                "螺旋输送机用于排出土仓内切削土体。直径900mm，长度12m，转速0-22rpm可调，最大排土能力450m³/h。"
        }
    },
    {
        id: "erector",
        name: "管片拼装机",
        namePatterns: [],
        zRange: [400, 900],
        info: {
            subsystemId: "erector",
            name: "管片拼装机",
            manufacturer: "中铁装备集团",
            model: "ER-6-Robot",
            installDate: "2024-04-10",
            operatingHours: 3950,
            status: "normal",
            lastMaintenance: "2025-05-25",
            nextMaintenance: "2025-08-25",
            temperature: 28.4,
            vibration: 0.8,
            power: 200,
            description:
                "管片拼装机采用六自由度机器人结构，可抓取管片并进行精确拼装。最大载荷120kN，旋转角度±200°。"
        }
    },
    {
        id: "hydraulic",
        name: "液压管路系统",
        namePatterns: [/^管道/],
        info: {
            subsystemId: "hydraulic",
            name: "液压管路系统",
            manufacturer: "Parker汉尼汾",
            model: "HP-28-4200",
            installDate: "2024-03-22",
            operatingHours: 4300,
            status: "warning",
            lastMaintenance: "2025-04-18",
            nextMaintenance: "2025-07-18",
            temperature: 48.9,
            vibration: 3.1,
            power: 0,
            description:
                "液压管路系统负责推进、铰接、拼装机等执行机构的动力传输。工作压力28MPa，管路总长约4200m。部分管路存在渗漏风险。"
        }
    },
    {
        id: "backup",
        name: "后配套系统",
        namePatterns: [/^盾构机/],
        zRange: [900, 1700],
        info: {
            subsystemId: "backup",
            name: "后配套系统",
            manufacturer: "中铁装备集团",
            model: "BK-6280-8C",
            installDate: "2024-05-01",
            operatingHours: 3800,
            status: "normal",
            lastMaintenance: "2025-06-02",
            nextMaintenance: "2025-09-02",
            temperature: 25.3,
            vibration: 0.6,
            power: 800,
            description:
                "后配套系统包含8节台车，集成皮带输送机、通风系统、供电系统、冷却系统和操控室等辅助设备。"
        }
    }
];

const DEFAULT_INFO: PartInfo = {
    subsystemId: "other",
    name: "其他部件",
    manufacturer: "通用",
    model: "STD",
    installDate: "2024-03-15",
    operatingHours: 4320,
    status: "normal",
    lastMaintenance: "2025-05-01",
    nextMaintenance: "2025-08-01",
    temperature: 30.0,
    vibration: 0.5,
    power: 0,
    description: "通用零部件"
};

export function classifyPart(name: string, z: number): SubsystemDef | null {
    for (const sub of SUBSYSTEMS) {
        for (const pattern of sub.namePatterns) {
            if (pattern.test(name)) return sub;
        }
    }

    for (const sub of SUBSYSTEMS) {
        if (sub.zRange && z >= sub.zRange[0] && z < sub.zRange[1]) return sub;
    }

    return null;
}

export function getPartInfo(name: string, z: number): PartInfo {
    const sub = classifyPart(name, z);
    if (!sub) return { ...DEFAULT_INFO, name };
    return { ...sub.info };
}

export function getStatusLabel(status: PartStatus): string {
    switch (status) {
        case "normal":
            return "正常运行";
        case "warning":
            return "预警";
        case "fault":
            return "故障";
    }
}

export function getStatusColor(status: PartStatus): string {
    switch (status) {
        case "normal":
            return "#00ff88";
        case "warning":
            return "#ffab00";
        case "fault":
            return "#ff4444";
    }
}

export const MACHINE_METRICS = {
    advanceRate: { label: "掘进速度", value: "12.3", unit: "mm/min" },
    cutterRPM: { label: "刀盘转速", value: "2.3", unit: "rpm" },
    thrustForce: { label: "总推力", value: "31,580", unit: "kN" },
    torque: { label: "刀盘扭矩", value: "8,420", unit: "kN·m" },
    totalAdvance: { label: "累计掘进", value: "1,234.5", unit: "m" },
    chamberPressure: { label: "土仓压力", value: "1.82", unit: "bar" }
};

export const MACHINE_INFO = {
    name: "土压平衡盾构机",
    model: "EPB-6280",
    manufacturer: "中铁工程装备集团",
    projectId: "深圳地铁16号线二期工程",
    station: "深大站～塘朗站区间",
    diameter: "6.28m",
    totalLength: "96m",
    weight: "520t"
};
