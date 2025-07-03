import { CollapseProfile } from "./Collapse";
import { StratumProfile } from "./Tile";

export interface SectionProfile {
    stratumProfiles: StratumProfile[];
    collapseProfiles: CollapseProfile[];
}
