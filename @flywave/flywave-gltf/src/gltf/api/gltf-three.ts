/* Copyright (C) 2025 flywave.gl contributors */

import { SplatMesh } from "@flywave/flywave-splats";
import {
    type Camera,
    type InstancedBufferAttribute,
    type Object3D,
    AnimationClip,
    Bone,
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    DynamicDrawUsage,
    FrontSide,
    Group,
    InstancedMesh,
    InterpolateDiscrete,
    InterpolateLinear,
    InterpolateSmooth,
    LinearFilter,
    LinearMipmapLinearFilter,
    LinearMipmapNearestFilter,
    LineBasicMaterial,
    LineSegments,
    Material,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    NearestMipmapLinearFilter,
    NearestMipmapNearestFilter,
    NumberKeyframeTrack,
    OrthographicCamera,
    PerspectiveCamera,
    Quaternion,
    QuaternionKeyframeTrack,
    RepeatWrapping,
    Scene,
    Skeleton,
    SkinnedMesh,
    Texture,
    Vector2,
    Vector3,
    VectorKeyframeTrack
} from "three";

import type {
    AnimationChannel,
    GLTFAccessorPostprocessed,
    GLTFAnimationPostprocessed,
    GLTFMaterialPostprocessed,
    GLTFMeshPrimitivePostprocessed,
    GLTFNodePostprocessed,
    GLTFPostprocessed
} from "../types/gltf-postprocessed-schema";

interface ConversionOptions {
    preserveHierarchy?: boolean;
    includeInvisible?: boolean;
    createMaterial?: (
        gltfMaterial: GLTFMaterialPostprocessed,
        textureMap: Map<string, Texture>
    ) => Material;
}

const DEFAULT_OPTIONS: Required<ConversionOptions> = {
    preserveHierarchy: true,
    includeInvisible: false,
    createMaterial: undefined as any
};

function createThreeSceneFromGLTF(
    gltf: GLTFPostprocessed,
    options: ConversionOptions = {}
): {
    scene: Scene;
    animations: AnimationClip[];
    nodes: Map<string, Object3D>;
} {
    if (!gltf) throw new Error("GLTF data is required");
    if (!gltf.scenes) throw new Error("GLTF must contain scenes");

    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const scene = new Scene();
    const animations: AnimationClip[] = [];
    const nodeMap = new Map<string, Object3D>();

    // Resource processing
    const textureMap = processTextures(gltf);
    const materialMap = processMaterials(gltf, textureMap, mergedOptions.createMaterial);
    const meshMap = processMeshes(gltf, materialMap);
    const cameraMap = processCameras(gltf);

    // Node processing
    processNodes(gltf, { meshMap, cameraMap, nodeMap }, mergedOptions);

    // Scene setup
    setupScene(gltf, scene, nodeMap);

    // Post-processing
    processSkins(gltf, nodeMap);
    processAnimations(gltf, animations, nodeMap);

    return { scene, animations, nodes: nodeMap };
}

// Texture processing
function processTextures(gltf: GLTFPostprocessed): Map<string, Texture> {
    const textureMap = new Map<string, Texture>();
    if (!gltf.textures) return textureMap;

    for (const gltfTexture of gltf.textures) {
        const texture = new Texture();
        if (gltfTexture.source?.image) {
            texture.image = gltfTexture.source.image.data;
            texture.needsUpdate = true;
        }

        applySamplerParameters(gltfTexture, texture);
        textureMap.set(gltfTexture.id, texture);
    }

    return textureMap;
}

function applySamplerParameters(gltfTexture: any, texture: Texture): void {
    if (!gltfTexture.sampler) return;

    const { magFilter, minFilter, wrapS, wrapT } = gltfTexture.sampler.parameters;

    texture.magFilter = magFilter || LinearFilter;
    texture.minFilter = minFilter || LinearMipmapLinearFilter;
    texture.wrapS = wrapS !== undefined ? wrapS : RepeatWrapping;
    texture.wrapT = wrapT !== undefined ? wrapT : RepeatWrapping;

    const mipmapFilters = [
        LinearMipmapLinearFilter,
        LinearMipmapNearestFilter,
        NearestMipmapLinearFilter,
        NearestMipmapNearestFilter
    ];

    if (mipmapFilters.includes(texture.minFilter as any)) {
        texture.generateMipmaps = true;
    }
}

// Material processing
function processMaterials(
    gltf: GLTFPostprocessed,
    textureMap: Map<string, Texture>,
    createMaterial?: ConversionOptions["createMaterial"]
): Map<string, Material> {
    const materialMap = new Map<string, Material>();
    if (!gltf.materials) return materialMap;

    for (const gltfMaterial of gltf.materials) {
        const material =
            createMaterial?.(gltfMaterial, textureMap) ||
            createDefaultMaterial(gltfMaterial, textureMap);
        materialMap.set(gltfMaterial.id, material);
    }

    return materialMap;
}

function createDefaultMaterial(
    gltfMaterial: GLTFMaterialPostprocessed,
    textureMap: Map<string, Texture>
): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
        name: gltfMaterial.name || "",
        side: gltfMaterial.doubleSided ? DoubleSide : FrontSide,
        transparent: gltfMaterial.alphaMode === "BLEND",
        alphaTest: gltfMaterial.alphaMode === "MASK" ? gltfMaterial.alphaCutoff || 0.5 : 0,
        depthWrite: gltfMaterial.alphaMode !== "BLEND",
        roughness: 1.0,
        metalness: 1.0
    });

    applyPbrProperties(gltfMaterial, material, textureMap);
    applyNormalProperties(gltfMaterial, material, textureMap);
    applyEmissiveProperties(gltfMaterial, material, textureMap);
    applyOcclusionProperties(gltfMaterial, material, textureMap);

    material.userData.gltfMaterial = gltfMaterial;
    return material;
}

function applyPbrProperties(
    gltfMaterial: GLTFMaterialPostprocessed,
    material: MeshStandardMaterial,
    textureMap: Map<string, Texture>
): void {
    if (!gltfMaterial.pbrMetallicRoughness) return;

    const pbr = gltfMaterial.pbrMetallicRoughness;

    if (pbr.baseColorFactor) {
        material.color.fromArray(pbr.baseColorFactor);
        material.opacity = pbr.baseColorFactor[3] ?? material.opacity;
    }

    if (pbr.baseColorTexture) {
        const texture = textureMap.get(pbr.baseColorTexture.texture.id);
        if (texture) {
            material.map = texture;
            if (gltfMaterial.alphaMode === "MASK") {
                material.alphaMap = texture;
            }
        }
    }

    material.metalness = pbr.metallicFactor ?? material.metalness;
    material.roughness = pbr.roughnessFactor ?? material.roughness;

    if (pbr.metallicRoughnessTexture) {
        const tex = textureMap.get(pbr.metallicRoughnessTexture.texture.id);
        if (tex) {
            material.metalnessMap = tex;
            material.roughnessMap = tex;
        }
    }
}

function applyNormalProperties(
    gltfMaterial: GLTFMaterialPostprocessed,
    material: MeshStandardMaterial,
    textureMap: Map<string, Texture>
): void {
    if (!gltfMaterial.normalTexture) return;

    const tex = textureMap.get(gltfMaterial.normalTexture.texture.id);
    if (tex) {
        material.normalMap = tex;
        material.normalScale = new Vector2(
            gltfMaterial.normalTexture.scale ?? 1.0,
            gltfMaterial.normalTexture.scale ?? 1.0
        );
    }
}

function applyEmissiveProperties(
    gltfMaterial: GLTFMaterialPostprocessed,
    material: MeshStandardMaterial,
    textureMap: Map<string, Texture>
): void {
    if (gltfMaterial.emissiveTexture) {
        const tex = textureMap.get(gltfMaterial.emissiveTexture.texture.id);
        if (tex) material.emissiveMap = tex;
    }

    if (gltfMaterial.emissiveFactor) {
        material.emissive.fromArray(gltfMaterial.emissiveFactor);
        material.emissiveIntensity = 1.0;
    } else if (gltfMaterial.emissiveTexture) {
        material.emissive.set(0xffffff);
        material.emissiveIntensity = 1.0;
    }
}

function applyOcclusionProperties(
    gltfMaterial: GLTFMaterialPostprocessed,
    material: MeshStandardMaterial,
    textureMap: Map<string, Texture>
): void {
    if (!gltfMaterial.occlusionTexture) return;

    const tex = textureMap.get(gltfMaterial.occlusionTexture.texture.id);
    if (tex) {
        material.aoMap = tex;
        material.aoMapIntensity = gltfMaterial.occlusionTexture.strength ?? 1.0;
    }
}

// Mesh processing
function processMeshes(
    gltf: GLTFPostprocessed,
    materialMap: Map<string, Material>
): Map<string, Object3D> {
    const meshMap = new Map<string, Object3D>();
    if (!gltf.meshes) return meshMap;

    for (const gltfMesh of gltf.meshes) {
        const group = new Group();
        group.name = gltfMesh.name || "";

        for (const primitive of gltfMesh.primitives) {
            const geometry = createPrimitiveGeometry(primitive);
            const material = primitive.material
                ? materialMap.get(primitive.material?.id) || new MeshStandardMaterial()
                : new MeshStandardMaterial();

            const mesh = createMeshForPrimitive(gltf, primitive, geometry, material, gltfMesh);
            group.add(mesh);
        }

        meshMap.set(gltfMesh.id, group);
    }

    return meshMap;
}

const ATTRIBUTES = {
    POSITION: "position",
    NORMAL: "normal",
    TANGENT: "tangent",
    TEXCOORD_0: "uv",
    TEXCOORD_1: "uv1",
    TEXCOORD_2: "uv2",
    TEXCOORD_3: "uv3",
    COLOR_0: "color",
    WEIGHTS_0: "skinWeight",
    JOINTS_0: "skinIndex"
};
function createPrimitiveGeometry(primitive: GLTFMeshPrimitivePostprocessed): BufferGeometry {
    const geometry = new BufferGeometry();

    // Set attributes
    for (const [name, accessor] of Object.entries(primitive.attributes)) {
        geometry.setAttribute(
            ATTRIBUTES[name.toUpperCase() as keyof typeof ATTRIBUTES] || name,
            createBufferAttribute(accessor)
        );
    }

    // Set indices
    if (primitive.indices) {
        geometry.setIndex(createBufferAttribute(primitive.indices));
    }

    // Compute necessary data
    if (geometry.attributes.position) {
        geometry.computeBoundingSphere();
    }

    if (!geometry.attributes.normal && geometry.attributes.position) {
        geometry.computeVertexNormals();
    }

    return geometry;
}

function createMeshForPrimitive(
    gltf: GLTFPostprocessed,
    primitive: GLTFMeshPrimitivePostprocessed,
    geometry: BufferGeometry,
    material: Material,
    gltfMesh: any
): Object3D {
    if (!!primitive.extras?.isGaussianSplatting) {
        return createSplatMesh(gltf, primitive, geometry);
    }

    if (primitive.mode === 1) {
        const rawmaterial = material as MeshStandardMaterial;
        const lineMaterial = new LineBasicMaterial();
        Material.prototype.copy.call(lineMaterial, material);
        lineMaterial.color.copy(rawmaterial.color);
        lineMaterial.map = rawmaterial.map;

        return new LineSegments(geometry, lineMaterial);
    }

    // Check if geometry has vertex colors and set material property accordingly
    if (geometry.attributes.color) {
        if (material instanceof MeshStandardMaterial || material instanceof LineBasicMaterial) {
            material.vertexColors = true;
        }
    }

    const isSkinned = primitive.attributes.JOINTS_0 && primitive.attributes.WEIGHTS_0;
    const mesh = isSkinned
        ? new SkinnedMesh(geometry, material as MeshStandardMaterial)
        : new Mesh(geometry, material as MeshStandardMaterial);

    // Handle morph targets
    if (primitive.targets?.length > 0) {
        applyMorphTargets(gltf, primitive, geometry);
        if (gltfMesh.weights) {
            mesh.morphTargetInfluences = [...gltfMesh.weights];
        }
    }

    return mesh;
}

function createSplatMesh(
    gltf: GLTFPostprocessed,
    primitive: GLTFMeshPrimitivePostprocessed,
    geometry: BufferGeometry
): Object3D {
    const setSplatAttribute = (
        name: string,
        attributeName: string,
        itemSize: number,
        normalized = false
    ) => {
        const accessor = primitive.attributes[attributeName];
        if (!accessor) {
            throw new Error(`Missing required attribute for splat: ${attributeName}`);
        }
        splatGeometry.setAttribute(name, new BufferAttribute(accessor.value, itemSize, normalized));
    };

    let splatGeometry: BufferGeometry = new BufferGeometry();
    setSplatAttribute("position", "POSITION", 3);
    setSplatAttribute("scale", "_SCALE", 3);
    setSplatAttribute("rotation", "_ROTATION", 4);
    setSplatAttribute("color", "COLOR_0", 4, true);
    geometry.copy(splatGeometry)

    const splatMesh = new SplatMesh();

    splatMesh.updateDataFromGeometry(geometry);
    splatMesh.userData.gltfPrimitive = primitive;

    return splatMesh;
}

function applyMorphTargets(
    gltf: GLTFPostprocessed,
    primitive: GLTFMeshPrimitivePostprocessed,
    geometry: BufferGeometry
): void {
    const morphAttributes: Record<string, BufferAttribute[]> = {};

    for (let i = 0; i < primitive.targets.length; i++) {
        const target = primitive.targets[i];

        for (const [attributeName, accessor] of Object.entries(target)) {
            if (!morphAttributes[attributeName]) {
                morphAttributes[attributeName] = [];
            }

            morphAttributes[attributeName][i] = createBufferAttribute(gltf.accessors[accessor]);
        }
    }

    for (const [attributeName, attributes] of Object.entries(morphAttributes)) {
        geometry.morphAttributes[attributeName] = attributes;
    }

    if (geometry.morphAttributes.position) {
        geometry.morphTargetsRelative = true;
    }
}

function createBufferAttribute(accessor: GLTFAccessorPostprocessed): BufferAttribute {
    const componentSizeMap = {
        SCALAR: 1,
        VEC2: 2,
        VEC3: 3,
        VEC4: 4,
        MAT2: 4,
        MAT3: 9,
        MAT4: 16
    };

    const componentSize = componentSizeMap[accessor.type] || 1;
    const attribute = new BufferAttribute(
        accessor.value,
        componentSize,
        accessor.normalized || false
    );

    attribute.setUsage(35044); // STATIC_DRAW
    return attribute;
}

// Camera processing
function processCameras(gltf: GLTFPostprocessed): Map<string, Camera> {
    const cameraMap = new Map<string, Camera>();
    if (!gltf.cameras) return cameraMap;

    for (const gltfCamera of gltf.cameras) {
        let camera: Camera;

        if (gltfCamera.type === "perspective" && gltfCamera.perspective) {
            const { yfov, aspectRatio, znear, zfar } = gltfCamera.perspective;
            camera = new PerspectiveCamera(
                yfov * (180 / Math.PI),
                aspectRatio || 1.0,
                znear,
                zfar || Infinity
            );
        } else if (gltfCamera.type === "orthographic" && gltfCamera.orthographic) {
            const { xmag, ymag, znear, zfar } = gltfCamera.orthographic;
            camera = new OrthographicCamera(-xmag, xmag, ymag, -ymag, znear, zfar);
        } else {
            camera = new PerspectiveCamera();
        }

        camera.name = gltfCamera.name || "";
        camera.userData.gltfCamera = gltfCamera;
        cameraMap.set(gltfCamera.name, camera);
    }

    return cameraMap;
}

// Node processing
function processNodes(
    gltf: GLTFPostprocessed,
    dependencies: {
        meshMap: Map<string, Object3D>;
        cameraMap: Map<string, Camera>;
        nodeMap: Map<string, Object3D>;
    },
    options: ConversionOptions
): void {
    if (!gltf.nodes) return;

    // First pass: create nodes
    for (const gltfNode of gltf.nodes) {
        dependencies.nodeMap.set(gltfNode.id, createNode(gltfNode, dependencies));
    }

    // Second pass: build hierarchy and apply transforms
    for (const gltfNode of gltf.nodes) {
        const node = dependencies.nodeMap.get(gltfNode.id);
        if (!node) continue;

        applyTransform(gltfNode, node);

        // Add children
        if (gltfNode.children) {
            for (const childId of gltfNode.children) {
                const childNode = dependencies.nodeMap.get(childId.toString());
                if (childNode) node.add(childNode);
            }
        }
    }
}

function createNode(
    gltfNode: GLTFNodePostprocessed,
    dependencies: {
        meshMap: Map<string, Object3D>;
        cameraMap: Map<string, Camera>;
    }
): Object3D {
    const instanceAttributes = gltfNode.userData?.instance;
    const hasInstancing = instanceAttributes && Object.keys(instanceAttributes).length > 0;

    if (hasInstancing && gltfNode.mesh) {
        return createInstancedNodeGroup(gltfNode, dependencies.meshMap);
    }

    if (gltfNode.mesh) {
        return dependencies.meshMap.get(gltfNode.mesh.id)?.clone() || new Group();
    }

    if (gltfNode.camera) {
        return dependencies.cameraMap.get(gltfNode.camera.name)?.clone() || new Group();
    }

    return new Group();
}

function createInstancedNodeGroup(
    gltfNode: GLTFNodePostprocessed,
    meshMap: Map<string, Object3D>
): Object3D {
    const group = new Group();
    group.name = gltfNode.name || "";
    const instanceAttributes = gltfNode.userData?.instance;

    if (!gltfNode.mesh || !instanceAttributes) return group;

    const mesh = meshMap.get(gltfNode.mesh.id);
    if (!mesh) return group;

    // Traverse to find all meshes in the group
    mesh.traverse(child => {
        if (child instanceof Mesh && child.geometry instanceof BufferGeometry) {
            const instancedMesh = createInstancedMesh(child, instanceAttributes);
            group.add(instancedMesh);
        }
    });

    return group;
}

function createInstancedMesh(
    sourceMesh: Mesh,
    instanceAttributes: Record<string, InstancedBufferAttribute>
): InstancedMesh {
    const instanceCount = Object.values(instanceAttributes).reduce(
        (count, attr) => Math.max(count, attr.count),
        0
    );

    if (instanceCount === 0) return new InstancedMesh(sourceMesh.geometry, sourceMesh.material, 0);

    const geometry = sourceMesh.geometry.clone();
    const material = sourceMesh.material;
    const instancedMesh = new InstancedMesh(geometry, material, instanceCount);

    // Apply instance matrices
    const matrices = calculateInstanceMatrices(instanceAttributes, instanceCount);
    for (let i = 0; i < instanceCount; i++) {
        instancedMesh.setMatrixAt(i, matrices[i]);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;

    // Apply other instance attributes
    for (const [name, attr] of Object.entries(instanceAttributes)) {
        if (name === "TRANSLATION" || name === "ROTATION" || name === "SCALE") continue;

        geometry.setAttribute(name, attr);
        attr.setUsage(DynamicDrawUsage);
    }

    return instancedMesh;
}

function calculateInstanceMatrices(
    attributes: Record<string, InstancedBufferAttribute>,
    instanceCount: number
): Matrix4[] {
    const matrices = new Array<Matrix4>(instanceCount);
    const tempPosition = new Vector3();
    const tempRotation = new Quaternion();
    const tempScale = new Vector3(1, 1, 1);
    const matrix = new Matrix4();

    const translationAttr = attributes.TRANSLATION;
    const rotationAttr = attributes.ROTATION;
    const scaleAttr = attributes.SCALE;

    for (let i = 0; i < instanceCount; i++) {
        if (translationAttr) tempPosition.fromBufferAttribute(translationAttr, i);
        if (rotationAttr) tempRotation.fromBufferAttribute(rotationAttr, i);
        if (scaleAttr) tempScale.fromBufferAttribute(scaleAttr, i);

        matrix.compose(tempPosition, tempRotation, tempScale);
        matrices[i] = matrix.clone();
    }

    return matrices;
}

function applyTransform(gltfNode: GLTFNodePostprocessed, node: Object3D): void {
    if (gltfNode.matrix) {
        const matrix = new Matrix4().fromArray(gltfNode.matrix);
        matrix.decompose(node.position, node.quaternion, node.scale);
    } else {
        if (gltfNode.translation) node.position.fromArray(gltfNode.translation);
        if (gltfNode.rotation) node.quaternion.fromArray(gltfNode.rotation);
        if (gltfNode.scale) node.scale.fromArray(gltfNode.scale);
    }

    node.name = gltfNode.name || "";
    node.userData.gltfNode = gltfNode;
    if (gltfNode.extras) node.userData.extras = gltfNode.extras;
}

// Scene setup
function setupScene(gltf: GLTFPostprocessed, scene: Scene, nodeMap: Map<string, Object3D>): void {
    if (!gltf.scene) return;

    const defaultScene = gltf.scene;
    scene.name = defaultScene.name || "";

    if (defaultScene.extras) {
        scene.userData.extras = defaultScene.extras;
    }

    for (const nodeId of defaultScene.nodes || []) {
        const node = nodeMap.get(nodeId.id.toString());
        if (node) scene.add(node);
    }
}

// Skin processing
function processSkins(gltf: GLTFPostprocessed, nodeMap: Map<string, Object3D>): void {
    if (!gltf.skins) return;

    for (const gltfSkin of gltf.skins) {
        const joints = collectJoints(gltfSkin, nodeMap);
        if (joints.length === 0) continue;

        const inverseBindMatrices = createInverseBindMatrices(gltfSkin);
        const skeleton = new Skeleton(joints, inverseBindMatrices);
        skeleton.uuid = gltfSkin.name || "";

        bindSkeletonToMeshes(gltf, gltfSkin, skeleton, nodeMap);
    }
}

function collectJoints(gltfSkin: any, nodeMap: Map<string, Object3D>): Bone[] {
    const joints: Bone[] = [];

    for (const jointId of gltfSkin.joints) {
        const jointNode = nodeMap.get(jointId.toString());

        if (jointNode instanceof Bone) {
            joints.push(jointNode);
        } else if (jointNode) {
            const bone = convertNodeToBone(jointNode);
            joints.push(bone);
            nodeMap.set(jointId.toString(), bone);
        }
    }

    return joints;
}

function convertNodeToBone(node: Object3D): Bone {
    const bone = new Bone();
    bone.name = node.name;
    bone.position.copy(node.position);
    bone.quaternion.copy(node.quaternion);
    bone.scale.copy(node.scale);
    bone.userData = { ...node.userData };

    const parent = node.parent;
    if (parent) {
        parent.remove(node);
        parent.add(bone);
    }

    while (node.children.length > 0) {
        bone.add(node.children[0]);
    }

    return bone;
}

function createInverseBindMatrices(gltfSkin: any): Matrix4[] | null {
    if (!gltfSkin.inverseBindMatrices?.value) return null;

    const matrices: Matrix4[] = [];
    const rawMatrices = gltfSkin.inverseBindMatrices.value;

    for (let i = 0; i < gltfSkin.joints.length; i++) {
        const matrix = new Matrix4().fromArray(rawMatrices, i * 16);
        matrices.push(matrix);
    }

    return matrices;
}

function bindSkeletonToMeshes(
    gltf: GLTFPostprocessed,
    gltfSkin: any,
    skeleton: Skeleton,
    nodeMap: Map<string, Object3D>
): void {
    for (const gltfNode of gltf.nodes || []) {
        if (gltfNode.skin?.id === gltfSkin.id) {
            const node = nodeMap.get(gltfNode.id);
            node?.traverse(child => {
                if (child instanceof SkinnedMesh && !child.skeleton) {
                    child.bind(skeleton, child.bindMatrix || new Matrix4());
                    child.skeleton = skeleton;
                }
            });
        }
    }
}

// Animation processing
function processAnimations(
    gltf: GLTFPostprocessed,
    animations: AnimationClip[],
    nodeMap: Map<string, Object3D>
): void {
    if (!gltf.animations) return;

    for (const gltfAnimation of gltf.animations) {
        const tracks = [];

        for (const channel of gltfAnimation.channels) {
            const track = createAnimationTrack(gltf, channel, gltfAnimation, nodeMap);
            if (track) tracks.push(track);
        }

        if (tracks.length > 0) {
            const clip = new AnimationClip(gltfAnimation.name || "animation", -1, tracks);
            (clip as any).userData.gltfAnimation = gltfAnimation;
            animations.push(clip);
        }
    }
}

function createAnimationTrack(
    gltf: GLTFPostprocessed,
    channel: AnimationChannel,
    gltfAnimation: GLTFAnimationPostprocessed,
    nodeMap: Map<string, Object3D>
): any {
    const targetNode = nodeMap.get(channel.target.node?.toString() || "");
    if (!targetNode) return null;

    const sampler = gltfAnimation.samplers[channel.sampler];
    if (!sampler) return null;

    const inputAccessor = gltf.accessors[sampler.input];
    const outputAccessor = gltf.accessors[sampler.output];
    if (!inputAccessor || !outputAccessor) return null;

    const times = inputAccessor.value;
    const values = outputAccessor.value;
    const path = channel.target.path;

    let track;
    switch (path) {
        case "translation":
            track = new VectorKeyframeTrack(`${targetNode.uuid}.position`, times, values);
            break;
        case "rotation":
            track = new QuaternionKeyframeTrack(`${targetNode.uuid}.quaternion`, times, values);
            break;
        case "scale":
            track = new VectorKeyframeTrack(`${targetNode.uuid}.scale`, times, values);
            break;
        case "weights":
            track = new NumberKeyframeTrack(
                `${targetNode.uuid}.morphTargetInfluences`,
                times,
                values
            );
            break;
        default:
            return null;
    }

    track.setInterpolation(
        sampler.interpolation === "STEP"
            ? InterpolateDiscrete
            : sampler.interpolation === "CUBICSPLINE"
                ? InterpolateSmooth
                : InterpolateLinear
    );

    return track;
}

export { createThreeSceneFromGLTF, type ConversionOptions };
