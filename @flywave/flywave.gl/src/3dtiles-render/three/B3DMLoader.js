import { B3DMLoaderBase } from '../base/B3DMLoaderBase.js';
import { DefaultLoadingManager, Matrix4, Mesh, BufferAttribute, BufferGeometry, LineSegments } from 'three';
import GLTFLoader from '../../loaders/gltf-loader';

const EXTENSIONS = {
	KHR_BINARY_GLTF: 'KHR_binary_glTF',
	KHR_DRACO_MESH_COMPRESSION: 'KHR_draco_mesh_compression',
	KHR_LIGHTS_PUNCTUAL: 'KHR_lights_punctual',
	KHR_MATERIALS_CLEARCOAT: 'KHR_materials_clearcoat',
	KHR_MATERIALS_IOR: 'KHR_materials_ior',
	KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS: 'KHR_materials_pbrSpecularGlossiness',
	KHR_MATERIALS_SHEEN: 'KHR_materials_sheen',
	KHR_MATERIALS_SPECULAR: 'KHR_materials_specular',
	KHR_MATERIALS_TRANSMISSION: 'KHR_materials_transmission',
	KHR_MATERIALS_UNLIT: 'KHR_materials_unlit',
	KHR_MATERIALS_VOLUME: 'KHR_materials_volume',
	KHR_TEXTURE_BASISU: 'KHR_texture_basisu',
	KHR_TEXTURE_TRANSFORM: 'KHR_texture_transform',
	KHR_MESH_QUANTIZATION: 'KHR_mesh_quantization',
	EXT_TEXTURE_WEBP: 'EXT_texture_webp',
	EXT_MESHOPT_COMPRESSION: 'EXT_meshopt_compression'
};

export class B3DMLoader extends B3DMLoaderBase {

	constructor(manager = DefaultLoadingManager, tile) {

		super();
		this.manager = manager;
		this.adjustmentTransform = new Matrix4();
		this.tile = tile;

	}


	createAttributesKey(attributes) {
		let attributesKey = '';
		const keys = Object.keys(attributes).sort();

		for (let i = 0, il = keys.length; i < il; i++) {
			attributesKey += keys[i] + ':' + attributes[keys[i]] + ';';
		}

		return attributesKey;
	}

	createPrimitiveKey(primitiveDef) {

		const dracoExtension = primitiveDef.extensions && primitiveDef.extensions[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION];
		let geometryKey;

		if (dracoExtension) {

			geometryKey = 'draco:' + dracoExtension.bufferView + ':' + dracoExtension.indices + ':' + this.createAttributesKey(dracoExtension.attributes);

		} else {

			geometryKey = primitiveDef.material + ':' + this.createAttributesKey(primitiveDef.attributes) + ':' + primitiveDef.mode;

		}

		return geometryKey;

	}

	parse(buffer) {

		const b3dm = super.parse(buffer);
		const gltfBuffer = b3dm.glbBytes.slice().buffer;
		return new Promise((resolve, reject) => {

			const manager = this.manager;
			const fetchOptions = this.fetchOptions;
			const loader = manager.getHandler('path.gltf') || new GLTFLoader(manager);

			if (fetchOptions.credentials === 'include' && fetchOptions.mode === 'cors') {

				loader.setCrossOrigin('use-credentials');

			}

			if ('credentials' in fetchOptions) {

				loader.setWithCredentials(fetchOptions.credentials === 'include');

			}

			if (fetchOptions.headers) {

				loader.setRequestHeader(fetchOptions.headers);

			}

			// GLTFLoader assumes the working path ends in a slash
			let workingPath = this.workingPath;
			if (! /[\\/]$/.test(workingPath) && workingPath.length) {

				workingPath += '/';

			}

			const adjustmentTransform = this.adjustmentTransform;

			loader.parse(gltfBuffer, workingPath, model => {

				const { batchTable, featureTable } = b3dm;
				var { scene } = model;

				var meshMap = new Map();
				var indexBuffer = new Map();
				scene.traverse(e => {
					if (e.isMesh || e.isLine) {
						var key = this.createPrimitiveKey(e.primitive);
						if (!indexBuffer.has(key)) {
							indexBuffer.set(key, []);
						}
						var buffers = indexBuffer.get(key);
						buffers.push(e.geometry.index.array);
					}
				})

				var removedMeshes = [];
				scene.traverse(e => {
					if (e.isMesh || e.isLine) {
						var key = this.createPrimitiveKey(e.primitive);
						if (!meshMap.has(key)) {
							var newGeometry = new BufferGeometry();
							if (e.geometry.attributes.normal)
								newGeometry.setAttribute("normal", e.geometry.attributes.normal);
							newGeometry.setAttribute("position", e.geometry.attributes.position);
							if (e.geometry.attributes.uv)
								newGeometry.setAttribute("uv", e.geometry.attributes.uv);
							if (e.geometry.attributes._batchid) {
								e.geometry.attributes._batchid.array = new Float32Array(e.geometry.attributes._batchid.array)
								newGeometry.setAttribute("_batchid", e.geometry.attributes._batchid);
							}

							var mesh = e.isLine ? new LineSegments(newGeometry, e.material.clone()) : new Mesh(newGeometry, e.material.clone());
							mesh.castShadow = true;
							mesh.tile = this.tile;
							mesh.batchTable = batchTable;
							if (e.geometry.attributes._batchid)
								mesh._batchid = e.geometry.attributes._batchid.array;
							mesh.type = "b3dm";
							// if( e.isLine){
							// 	if(mesh.material.color.getHex()==0){
							// 		mesh.material.color.setHex(0xff00ff)
							// }
							// }
							e.parent.add(mesh);
							meshMap.set(key, mesh);
						}
						removedMeshes.push(e);
					}
				});

				removedMeshes.forEach(e => e.removeFromParent())

				meshMap.forEach((mesh, key) => {
					const { geometry } = mesh;
					var indexs = indexBuffer.get(key);
					var index = new Uint32Array(indexs.reduce((a, b) => a + b.length, 0));
					geometry.index = new BufferAttribute(index, 1);

					var offset = 0;
					indexs.forEach((buffer) => {
						index.set(buffer, offset);
						offset += buffer.length;
					})
				});


				// scene = d[0];
				// model.scene = scene;

				const rtcCenter = featureTable.getData('RTC_CENTER');
				if (rtcCenter) {

					scene.position.x += rtcCenter[0];
					scene.position.y += rtcCenter[1];
					scene.position.z += rtcCenter[2];

				}

				model.scene.updateMatrix();
				model.scene.matrix.multiply(adjustmentTransform);
				model.scene.matrix.decompose(model.scene.position, model.scene.quaternion, model.scene.scale);

				model.batchTable = batchTable;
				model.featureTable = featureTable;

				scene.batchTable = batchTable;
				scene.featureTable = featureTable;

				resolve(model);

			}, reject);

		});

	}

}