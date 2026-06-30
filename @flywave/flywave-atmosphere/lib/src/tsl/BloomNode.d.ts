import { TempNode, NodeMaterial } from 'three/webgpu';
/**
 * Post processing node for creating a bloom effect.
 * ```js
 * const renderPipeline = new THREE.RenderPipeline( renderer );
 *
 * const scenePass = pass( scene, camera );
 * const scenePassColor = scenePass.getTextureNode( 'output' );
 *
 * const bloomPass = bloom( scenePassColor );
 *
 * renderPipeline.outputNode = scenePassColor.add( bloomPass );
 * ```
 * By default, the node affects the entire image. For a selective bloom,
 * use the `emissive` material property to control which objects should
 * contribute to bloom or not. This can be achieved via MRT.
 * ```js
 * const renderPipeline = new THREE.RenderPipeline( renderer );
 *
 * const scenePass = pass( scene, camera );
 * scenePass.setMRT( mrt( {
 * 	output,
 * 	emissive
 * } ) );
 *
 * const scenePassColor = scenePass.getTextureNode( 'output' );
 * const emissivePass = scenePass.getTextureNode( 'emissive' );
 *
 * const bloomPass = bloom( emissivePass );
 * renderPipeline.outputNode = scenePassColor.add( bloomPass );
 * ```
 * @augments TempNode
 * @three_import import { bloom } from 'three/addons/tsl/display/BloomNode.js';
 */
declare class BloomNode extends TempNode {
    static get type(): string;
    /**
     * Constructs a new bloom node.
     *
     * @param {Node<vec4>} inputNode - The node that represents the input of the effect.
     * @param {number} [strength=1] - The strength of the bloom.
     * @param {number} [radius=0] - The radius of the bloom.
     * @param {number} [threshold=0] - The luminance threshold limits which bright areas contribute to the bloom effect.
     */
    constructor(inputNode: any, strength?: number, radius?: number, threshold?: number);
    /**
     * Returns the result of the effect as a texture node.
     *
     * @return {PassTextureNode} A texture node that represents the result of the effect.
     */
    getTextureNode(): any;
    /**
     * Sets the size of the effect.
     *
     * @param {number} width - The width of the effect.
     * @param {number} height - The height of the effect.
     */
    setSize(width: any, height: any): void;
    /**
     * This method is used to render the effect once per frame.
     *
     * @param {NodeFrame} frame - The current node frame.
     */
    updateBefore(frame: any): void;
    /**
     * This method is used to setup the effect's TSL code.
     *
     * @param {NodeBuilder} builder - The current node builder.
     * @return {PassTextureNode}
     */
    setup(builder: any): any;
    /**
     * Frees internal resources. This method should be called
     * when the effect is no longer required.
     */
    dispose(): void;
    /**
     * Create a separable blur material for the given kernel radius.
     *
     * @private
     * @param {NodeBuilder} builder - The current node builder.
     * @param {number} kernelRadius - The kernel radius.
     * @return {NodeMaterial}
     */
    _getSeparableBlurMaterial(builder: any, kernelRadius: any): NodeMaterial;
}
/**
 * TSL function for creating a bloom effect.
 *
 * @tsl
 * @function
 * @param {Node<vec4>} node - The node that represents the input of the effect.
 * @param {number} [strength=1] - The strength of the bloom.
 * @param {number} [radius=0] - The radius of the bloom.
 * @param {number} [threshold=0] - The luminance threshold limits which bright areas contribute to the bloom effect.
 * @returns {BloomNode}
 */
export declare const bloom: (node: any, strength: any, radius: any, threshold: any) => BloomNode;
export default BloomNode;
