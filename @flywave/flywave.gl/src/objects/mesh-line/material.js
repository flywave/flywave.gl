import { ShaderMaterial } from "three";
import "./shader";

class MeshLineMaterial extends ShaderMaterial {
  type = "MeshLineMaterial";

  constructor() {
    super({
      uniforms: Object.assign({}, THREE.UniformsLib.fog, {
        lineWidth: { value: 1 },
        map: { value: null },
        useMap: { value: 0 },
        alphaMap: { value: null },
        useAlphaMap: { value: 0 },
        color: { value: new THREE.Color(0xffffff) },
        opacity: { value: 1 },
        resolution: { value: new THREE.Vector2(1, 1) },
        sizeAttenuation: { value: 1 },
        near: { value: 1 },
        far: { value: 1 },
        dashArray: { value: 0 },
        dashOffset: { value: 0 },
        dashRatio: { value: 0.5 },
        useDash: { value: 0 },
        visibility: { value: 1 },
        alphaTest: { value: 0 },
        repeat: { value: new THREE.Vector2(1, 1) },
      }),

      vertexShader: THREE.ShaderChunk.meshline_vert,

      fragmentShader: THREE.ShaderChunk.meshline_frag,
    });

    Object.defineProperties(this, {
      lineWidth: {
        enumerable: true,
        get: function () {
          return this.uniforms.lineWidth.value;
        },
        set: function (value) {
          this.uniforms.lineWidth.value = value;
        },
      },
      map: {
        enumerable: true,
        get: function () {
          return this.uniforms.map.value;
        },
        set: function (value) {
          this.uniforms.map.value = value;
        },
      },
      useMap: {
        enumerable: true,
        get: function () {
          return this.uniforms.useMap.value;
        },
        set: function (value) {
          this.uniforms.useMap.value = value;
        },
      },
      alphaMap: {
        enumerable: true,
        get: function () {
          return this.uniforms.alphaMap.value;
        },
        set: function (value) {
          this.uniforms.alphaMap.value = value;
        },
      },
      useAlphaMap: {
        enumerable: true,
        get: function () {
          return this.uniforms.useAlphaMap.value;
        },
        set: function (value) {
          this.uniforms.useAlphaMap.value = value;
        },
      },
      color: {
        enumerable: true,
        get: function () {
          return this.uniforms.color.value;
        },
        set: function (value) {
          this.uniforms.color.value = value;
        },
      },
      opacity: {
        enumerable: true,
        get: function () {
          return this.uniforms.opacity.value;
        },
        set: function (value) {
          this.uniforms.opacity.value = value;
        },
      },
      resolution: {
        enumerable: true,
        get: function () {
          return this.uniforms.resolution.value;
        },
        set: function (value) {
          this.uniforms.resolution.value.copy(value);
        },
      },
      sizeAttenuation: {
        enumerable: true,
        get: function () {
          return this.uniforms.sizeAttenuation.value;
        },
        set: function (value) {
          this.uniforms.sizeAttenuation.value = value;
        },
      },
      near: {
        enumerable: true,
        get: function () {
          return this.uniforms.near.value;
        },
        set: function (value) {
          this.uniforms.near.value = value;
        },
      },
      far: {
        enumerable: true,
        get: function () {
          return this.uniforms.far.value;
        },
        set: function (value) {
          this.uniforms.far.value = value;
        },
      },
      dashArray: {
        enumerable: true,
        get: function () {
          return this.uniforms.dashArray.value;
        },
        set: function (value) {
          this.uniforms.dashArray.value = value;
          this.useDash = value !== 0 ? 1 : 0;
        },
      },
      dashOffset: {
        enumerable: true,
        get: function () {
          return this.uniforms.dashOffset.value;
        },
        set: function (value) {
          this.uniforms.dashOffset.value = value;
        },
      },
      dashRatio: {
        enumerable: true,
        get: function () {
          return this.uniforms.dashRatio.value;
        },
        set: function (value) {
          this.uniforms.dashRatio.value = value;
        },
      },
      useDash: {
        enumerable: true,
        get: function () {
          return this.uniforms.useDash.value;
        },
        set: function (value) {
          this.uniforms.useDash.value = value;
        },
      },
      visibility: {
        enumerable: true,
        get: function () {
          return this.uniforms.visibility.value;
        },
        set: function (value) {
          this.uniforms.visibility.value = value;
        },
      },
      alphaTest: {
        enumerable: true,
        get: function () {
          return this.uniforms.alphaTest.value;
        },
        set: function (value) {
          this.uniforms.alphaTest.value = value;
        },
      },
      repeat: {
        enumerable: true,
        get: function () {
          return this.uniforms.repeat.value;
        },
        set: function (value) {
          this.uniforms.repeat.value.copy(value);
        },
      },
    });
  }
  isMeshLineMaterial = true;

  copy(source) {
    super.copy(source);
    this.lineWidth = source.lineWidth;
    this.map = source.map;
    this.useMap = source.useMap;
    this.alphaMap = source.alphaMap;
    this.useAlphaMap = source.useAlphaMap;
    this.color.copy(source.color);
    this.opacity = source.opacity;
    this.resolution.copy(source.resolution);
    this.sizeAttenuation = source.sizeAttenuation;
    this.near = source.near;
    this.far = source.far;
    this.dashArray.copy(source.dashArray);
    this.dashOffset.copy(source.dashOffset);
    this.dashRatio.copy(source.dashRatio);
    this.useDash = source.useDash;
    this.visibility = source.visibility;
    this.alphaTest = source.alphaTest;
    this.repeat.copy(source.repeat);

    return this;
  }
}

export default MeshLineMaterial;
