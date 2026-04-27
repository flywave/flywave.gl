import { type BoreholeData, type CollapsePillarData, type FaultProfileData, type Material, type Metadata, type SectionLineData } from "./types";
export declare function decodeExtensions(dataView: DataView<ArrayBuffer>, offset?: number): {
    extensions: {
        metadata?: Metadata;
        materials?: Material[];
        faultProfiles?: FaultProfileData[];
        boreholes?: BoreholeData[];
        collapsePillars?: CollapsePillarData[];
        sectionLines?: SectionLineData[];
        stratumLithology?: Record<string, string>;
    };
    extensionsEndPosition: number;
};
