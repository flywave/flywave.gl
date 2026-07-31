export function classifyPart(name: any, z: any): {
    id: string;
    name: string;
    namePatterns: RegExp[];
    zRange: number[];
    info: {
        subsystemId: string;
        name: string;
        manufacturer: string;
        model: string;
        installDate: string;
        operatingHours: number;
        status: string;
        lastMaintenance: string;
        nextMaintenance: string;
        temperature: number;
        vibration: number;
        power: number;
        description: string;
    };
} | {
    id: string;
    name: string;
    namePatterns: RegExp[];
    info: {
        subsystemId: string;
        name: string;
        manufacturer: string;
        model: string;
        installDate: string;
        operatingHours: number;
        status: string;
        lastMaintenance: string;
        nextMaintenance: string;
        temperature: number;
        vibration: number;
        power: number;
        description: string;
    };
    zRange?: undefined;
};
export function getPartInfo(name: any, z: any): {
    name: any;
    subsystemId: string;
    manufacturer: string;
    model: string;
    installDate: string;
    operatingHours: number;
    status: string;
    lastMaintenance: string;
    nextMaintenance: string;
    temperature: number;
    vibration: number;
    power: number;
    description: string;
};
export function getStatusLabel(status: any): "正常运行" | "预警" | "故障";
export function getStatusColor(status: any): "#00ff88" | "#ffab00" | "#ff4444";
export namespace MACHINE_METRICS {
    namespace advanceRate {
        let label: string;
        let value: string;
        let unit: string;
    }
    namespace cutterRPM {
        let label_1: string;
        export { label_1 as label };
        let value_1: string;
        export { value_1 as value };
        let unit_1: string;
        export { unit_1 as unit };
    }
    namespace thrustForce {
        let label_2: string;
        export { label_2 as label };
        let value_2: string;
        export { value_2 as value };
        let unit_2: string;
        export { unit_2 as unit };
    }
    namespace torque {
        let label_3: string;
        export { label_3 as label };
        let value_3: string;
        export { value_3 as value };
        let unit_3: string;
        export { unit_3 as unit };
    }
    namespace totalAdvance {
        let label_4: string;
        export { label_4 as label };
        let value_4: string;
        export { value_4 as value };
        let unit_4: string;
        export { unit_4 as unit };
    }
    namespace chamberPressure {
        let label_5: string;
        export { label_5 as label };
        let value_5: string;
        export { value_5 as value };
        let unit_5: string;
        export { unit_5 as unit };
    }
}
export namespace MACHINE_INFO {
    let name: string;
    let model: string;
    let manufacturer: string;
    let projectId: string;
    let station: string;
    let diameter: string;
    let totalLength: string;
    let weight: string;
}
