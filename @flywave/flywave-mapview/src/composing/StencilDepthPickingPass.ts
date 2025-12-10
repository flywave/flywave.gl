import { DepthCopyMaterial, DepthCopyMode, DepthPickingPass } from "postprocessing";
import { 
  BasicDepthPacking, 
  FloatType, 
  KeepStencilOp, 
  NeverStencilFunc, 
  RGBADepthPacking,
  WebGLRenderer,
  WebGLRenderTarget
} from "three"; 

/**
 * A depth picking pass with stencil test support.
 * Only picks depth from pixels that pass the stencil test.
 */

export class DepthPickingWithStencilPass extends DepthPickingPass {

  /**
   * Constructs a new depth picking pass with stencil test.
   *
   * @param {Object} [options] - The options.
   * @param {DepthPackingStrategies} [options.depthPacking=RGBADepthPacking] - The depth packing.
   * @param {Number} [options.mode=DepthCopyMode.SINGLE] - The depth copy mode.
   * @param {Number} [options.stencilRef=1] - The stencil reference value.
   * @param {Number} [options.stencilFunc=512] - The stencil function (EQUAL by default).
   * @param {Number} [options.stencilMask=0xFF] - The stencil mask.
   */

  constructor({ 
    depthPacking = RGBADepthPacking, 
    mode = DepthCopyMode.SINGLE,
    stencilRef = 10000,
    stencilFunc = NeverStencilFunc, 
  } = {}) {

    super({ depthPacking, mode });

    this.name = "DepthPickingWithStencilPass";
    
    // Configure stencil test on the fullscreen material
    const material = this.fullscreenMaterial as DepthCopyMaterial;
    
    material.stencilWrite = true;
    material.stencilRef = stencilRef;
    material.stencilFunc = NeverStencilFunc; 
    material.stencilZPass = KeepStencilOp;
    material.stencilZFail = KeepStencilOp;
  }

  setStencilRef(stencilRef: number) {
    // this.fullscreenMaterial.stencilRef = stencilRef;
  }
}