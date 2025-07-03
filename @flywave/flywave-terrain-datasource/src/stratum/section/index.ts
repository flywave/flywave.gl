import { StratumProfile } from "../tile";
import { CollapseProfile } from "../tile/Collapse";

export interface SectionProfile {
    stratumProfiles: StratumProfile[];
    collapseProfiles: CollapseProfile[];
}
