import { createMBMaterial } from './materials/index';

export class MBMaterialFactory {
    static create(
        layerType: any,
        paint: Record<string, any>,
    ) {
        return createMBMaterial(layerType, paint);
    }
}
