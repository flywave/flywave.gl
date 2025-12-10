/* Copyright (C) 2025 flywave.gl contributors */

import {
    type ShaderTechnique,
    type SolidLineTechnique,
    type StandardTechnique,
    type Technique,
    type TextureProperties,
    Expr,
    getPropertyValue,
    MapEnv
} from "@flywave/flywave-datasource-protocol";
import { TileKey } from "@flywave/flywave-geoutils";
import { type SolidLineMaterial, MapMeshStandardMaterial } from "@flywave/flywave-materials";
import { assertLogsSync } from "@flywave/flywave-test-utils";
import { LoggerManager } from "@flywave/flywave-utils";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
import * as THREE from "three";

chai.use(chaiAsPromised);

// Needed for using assert.isFulfilled for example
const { expect, assert } = chai;

import { DisplacedMesh } from "../src/geometry/DisplacedMesh";
import { toTextureFilter, toWrappingMode } from "../src/ThemeHelpers";
import {
    applyBaseColorToMaterial,
    buildObject,
    createMaterial,
    evaluateColorProperty,
    usesObject3D
} from "./../src/DecodedTileHelpers";
import { Tile } from "./../src/Tile";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

const itBrowserOnly = typeof Blob !== "undefined" ? it : xit;

function assertLogsError(testCode: () => void, errorMessagePattern: string | RegExp) {
    assertLogsSync(testCode, LoggerManager.instance.channel, "error", errorMessagePattern);
}

describe("DecodedTileHelpers", function () {
    const env = new MapEnv({ $zoom: 10, $pixelToMeters: 2 });
    const rendererCapabilities = { isWebGL2: false } as any;
    const sandbox = sinon.createSandbox();
    const wait = (ms: number = 0) => new Promise(res => setTimeout(res, ms));

    afterEach(function () {
        sandbox.restore();
    });

    describe("createMaterial", function () {
        it("supports #rgba in base material colors", function () {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "#f0f7"
            };
            const material = createMaterial(rendererCapabilities, {
                technique,
                env
            })! as SolidLineMaterial;
            expect(assert.exists(material));

            assert.approximately(material.opacity, 7 / 15, 0.00001);
            assert.equal(material.blending, THREE.CustomBlending);
            assert.equal(material.color.getHex(), 0xff00ff);
            assert.equal(material.transparent, false);
        });
        it("ignores alpha when applying #rgba to secondary colors", function () {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "#f0f",
                secondaryColor: "#f0f7"
            };
            const material = createMaterial(rendererCapabilities, {
                technique,
                env
            })! as SolidLineMaterial;
            expect(assert.exists(material));

            assert.equal(material.opacity, 1);
            assert.equal(material.blending, THREE.CustomBlending);
            assert.equal(material.color.getHex(), 0xff00ff);
            assert.equal(material.transparent, false);
        });
        it("ignores invalid colors", function () {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "not-a-color"
            };
            assertLogsError(() => {
                const material = createMaterial(rendererCapabilities, {
                    technique,
                    env
                })! as SolidLineMaterial;
                expect(assert.exists(material));
            }, /Unsupported color format/);
        });

        it("disables depthTest for solid lines by default", function () {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "#f0f7"
            };
            const material = createMaterial(rendererCapabilities, {
                technique,
                env
            })! as SolidLineMaterial;
            expect(assert.exists(material));
            expect(assert.isFalse(material.depthTest));
        });

        it("enables depthTest for solid lines if specified in the technique", function () {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "#f0f7",
                depthTest: true
            };
            const material = createMaterial(rendererCapabilities, {
                technique,
                env
            })! as SolidLineMaterial;
            expect(assert.exists(material));
            expect(assert.isTrue(material.depthTest));
        });

        it("ShaderTechnique", function () {
            const tile = new Tile(new FakeOmvDataSource({ name: "omv" }), new TileKey(0, 0, 0));
            const technique: ShaderTechnique = {
                name: "shader",
                primitive: "line",
                params: {
                    clipping: true,
                    uniforms: {
                        lineColor: { value: new THREE.Color("#f00") }
                    },
                    vertexShader: "",
                    fragmentShader: ""
                },
                renderOrder: 0
            };
            const env = new MapEnv({ $zoom: 14 });
            const shaderMaterial = createMaterial(rendererCapabilities, { technique, env });
            expect(
                assert.isTrue(
                    shaderMaterial instanceof THREE.ShaderMaterial,
                    "expected a THREE.ShaderMaterial"
                )
            );
            if (shaderMaterial instanceof THREE.ShaderMaterial) {
                assert.isObject(
                    shaderMaterial.uniforms.lineColor,
                    "expected a uniform named lineColor"
                );
                expect(
                    assert.isTrue(
                        shaderMaterial.uniforms.lineColor.value instanceof THREE.Color,
                        "expected a uniform of type THREE.Color"
                    )
                );
                assert.isString(shaderMaterial.vertexShader);
                assert.isString(shaderMaterial.fragmentShader);
                expect(assert.isTrue(shaderMaterial.clipping));
            }
            expect(assert.isTrue(usesObject3D(technique)));
            const object = buildObject(
                technique,
                new THREE.BufferGeometry(),
                new THREE.Material(),
                tile,
                false
            );
            expect(assert.isTrue(object instanceof THREE.Line, "expected a THREE.Line object"));
        });

        it("creates texture from url", async function () {
            const fakeImageElement: HTMLImageElement = {} as any;
            const technique: StandardTechnique = {
                name: "standard",
                renderOrder: 0,
                map: "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDIyLjEuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHdpZHRoPSI0OHB4IiBoZWlnaHQ9IjQ4cHgiIHZlcnNpb249IjEuMSIgaWQ9Imx1aS1pY29uLWRlc3RpbmF0aW9ucGluLW9uZGFyay1zb2xpZC1sYXJnZSIKCSB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIgdmlld0JveD0iMCAwIDQ4IDQ4IgoJIGVuYWJsZS1iYWNrZ3JvdW5kPSJuZXcgMCAwIDQ4IDQ4IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPGc+Cgk8ZyBpZD0ibHVpLWljb24tZGVzdGluYXRpb25waW4tb25kYXJrLXNvbGlkLWxhcmdlLWJvdW5kaW5nLWJveCIgb3BhY2l0eT0iMCI+CgkJPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTQ3LDF2NDZIMVYxSDQ3IE00OCwwSDB2NDhoNDhWMEw0OCwweiIvPgoJPC9nPgoJPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGZpbGw9IiNmZmZmZmYiIGQ9Ik0yNCwyQzEzLjg3MDgsMiw1LjY2NjcsMTAuMTU4NCw1LjY2NjcsMjAuMjIzMwoJCWMwLDUuMDMyNSwyLjA1MzMsOS41ODg0LDUuMzcxNywxMi44ODgzTDI0LDQ2bDEyLjk2MTctMTIuODg4M2MzLjMxODMtMy4zLDUuMzcxNy03Ljg1NTgsNS4zNzE3LTEyLjg4ODMKCQlDNDIuMzMzMywxMC4xNTg0LDM0LjEyOTIsMiwyNCwyeiBNMjQsMjVjLTIuNzY1LDAtNS0yLjIzNS01LTVzMi4yMzUtNSw1LTVzNSwyLjIzNSw1LDVTMjYuNzY1LDI1LDI0LDI1eiIvPgo8L2c+Cjwvc3ZnPgo="
            };

            const callbackSpy = sandbox.spy();
            let onImageLoad: ((image: HTMLImageElement) => void) | undefined;
            sandbox
                .stub(THREE.ImageLoader.prototype, "load")
                .callsFake((url, onLoad?, _onProgress?, _onError?) => {
                    assert.equal(url, technique.map);
                    onImageLoad = onLoad;
                    return fakeImageElement;
                });

            const material = createMaterial(
                rendererCapabilities,
                {
                    technique,
                    env
                },
                callbackSpy
            ) as MapMeshStandardMaterial;
            expect(assert.isDefined(onImageLoad));
            expect(assert.isTrue(callbackSpy.called));

            // Check that texture promised is not yet resolved.
            let textureLoaded = false;
            const texturePromise = callbackSpy.firstCall.args[0].then(() => {
                textureLoaded = true;
            });

            await wait();
            expect(assert.isFalse(textureLoaded));
            expect(assert.exists(material));
            expect(assert.notExists(material!.map));

            // Call image load callback, promise must now be resolved and texture set in material.
            onImageLoad!(fakeImageElement);
            expect(await assert.isFulfilled(texturePromise));
            expect(assert.isTrue(textureLoaded));
            expect(assert.exists(material!.map));
            assert.strictEqual(material!.map!.image, fakeImageElement);
        });

        it("creates texture from raw texture buffer", function () {
            const callbackSpy = sinon.spy();
            const technique: StandardTechnique = {
                name: "standard",
                renderOrder: 0,
                map: {
                    buffer: new ArrayBuffer(1),
                    type: "image/raw",
                    dataTextureProperties: {
                        width: 1,
                        height: 1
                    }
                }
            };
            const material = createMaterial(
                rendererCapabilities,
                {
                    technique,
                    env
                },
                callbackSpy
            ) as MapMeshStandardMaterial;
            expect(assert.exists(material));
            expect(assert.exists(material.map));
            expect(assert.isTrue(callbackSpy.called));
            const texturePromise = callbackSpy.firstCall.args[0];
            return assert.isFulfilled(texturePromise);
        });

        it("rejects texture promise if raw texture buffer does not have properties", function () {
            const callbackSpy = sinon.spy();
            const technique: StandardTechnique = {
                name: "standard",
                renderOrder: 0,
                map: {
                    buffer: new ArrayBuffer(1),
                    type: "image/raw"
                }
            };
            const material = createMaterial(
                rendererCapabilities,
                {
                    technique,
                    env
                },
                callbackSpy
            ) as MapMeshStandardMaterial;
            expect(assert.exists(material));
            expect(assert.notExists(material.map));
            expect(assert.isTrue(callbackSpy.called));
            const texturePromise = callbackSpy.firstCall.args[0];
            return assert.isRejected(texturePromise);
        });

        it("inits texture properties with values from technique", function () {
            const technique: StandardTechnique = {
                name: "standard",
                renderOrder: 0,
                map: {
                    buffer: new ArrayBuffer(1),
                    type: "image/raw",
                    dataTextureProperties: {
                        width: 1,
                        height: 1
                    }
                },
                mapProperties: {
                    wrapS: "mirror",
                    wrapT: "repeat",
                    magFilter: "nearest",
                    minFilter: "linear",
                    flipY: true,
                    repeatU: 3,
                    repeatV: 2
                }
            };
            const material = createMaterial(rendererCapabilities, {
                technique,
                env
            }) as MapMeshStandardMaterial;
            expect(assert.exists(material?.map));
            const map = material!.map!;
            const expectedProps = technique.mapProperties! as TextureProperties;
            assert.equal(map.wrapS, toWrappingMode(expectedProps.wrapS!));
            assert.equal(map.magFilter, toTextureFilter(expectedProps.magFilter!));
            assert.equal(map.minFilter, toTextureFilter(expectedProps.minFilter!));
            assert.equal(map.flipY, expectedProps.flipY);
            assert.equal(map.repeat.x, expectedProps.repeatU);
            assert.equal(map.repeat.y, expectedProps.repeatV);
        });

        itBrowserOnly("creates texture from png texture buffer", function () {
            const fakeImageElement: HTMLImageElement = {} as any;
            const callbackSpy = sinon.spy();
            const technique: StandardTechnique = {
                name: "standard",
                renderOrder: 0,
                map: {
                    buffer: new ArrayBuffer(1),
                    type: "image/png",
                    dataTextureProperties: {
                        width: 1,
                        height: 1
                    }
                }
            };
            let objectURL: string | undefined;
            sandbox
                .stub(THREE.ImageLoader.prototype, "load")
                .callsFake((url, onLoad?, _onProgress?, _onError?) => {
                    objectURL = url;
                    onLoad?.(fakeImageElement);
                    return fakeImageElement;
                });
            const revokeObjectURLSpy = sandbox.spy(URL, "revokeObjectURL");
            const material = createMaterial(
                rendererCapabilities,
                {
                    technique,
                    env
                },
                callbackSpy
            ) as MapMeshStandardMaterial;

            expect(assert.exists(material));
            expect(assert.exists(material.map));
            expect(assert.isTrue(callbackSpy.called));
            expect(assert.isDefined(objectURL));
            material.map?.dispose();
            expect(assert.isTrue(revokeObjectURLSpy.calledWith(objectURL)));
        });

        it("creates texture from dynamic property with HTML element", function () {
            const env = new MapEnv({ image: { nodeName: "IMG" } });
            const callbackSpy = sinon.spy();
            const technique: StandardTechnique = {
                name: "standard",
                renderOrder: 0,
                map: Expr.fromJSON(["get", "image", ["dynamic-properties"]])
            };
            const material = createMaterial(
                rendererCapabilities,
                {
                    technique,
                    env
                },
                callbackSpy
            ) as MapMeshStandardMaterial;
            expect(assert.exists(material));
            expect(assert.exists(material.map));
            expect(assert.isTrue(callbackSpy.called));
        });

        it("creates default texture when dynamic property evaluates to null", function () {
            const env = new MapEnv({ image: null });
            const callbackSpy = sinon.spy();
            const technique: StandardTechnique = {
                name: "standard",
                renderOrder: 0,
                map: Expr.fromJSON(["get", "image", ["dynamic-properties"]])
            };
            const material = createMaterial(
                rendererCapabilities,
                {
                    technique,
                    env
                },
                callbackSpy
            ) as MapMeshStandardMaterial;
            expect(assert.exists(material));
            expect(assert.exists(material.map));
            expect(assert.isTrue(callbackSpy.called));
        });
    });
    it("applyBaseColorToMaterial toggles opacity with material", function () {
        const material = new THREE.MeshBasicMaterial();
        assert.equal(material.blending, THREE.NormalBlending);
        const technique: SolidLineTechnique = {
            name: "solid-line",
            lineWidth: 10,
            renderOrder: 0,
            color: "#f0f7"
        };
        applyBaseColorToMaterial(material, material.color, technique, technique.color, env);

        assert.approximately(material.opacity, 7 / 15, 0.00001);
        assert.equal(material.blending, THREE.CustomBlending);
        assert.equal(material.color.getHex(), 0xff00ff);
        assert.equal(material.transparent, false);

        technique.color = "#f0f";
        applyBaseColorToMaterial(material, material.color, technique, technique.color, env);

        assert.equal(material.opacity, 1);
        assert.equal(material.blending, THREE.NormalBlending);
        assert.equal(material.color.getHex(), 0xff00ff);
        assert.equal(material.transparent, false);
    });
    describe("evaluateColorProperty", function () {
        it("leaves numbers untouched", function () {
            assert.strictEqual(evaluateColorProperty(0, env), 0);
            assert.strictEqual(evaluateColorProperty(0xff00ff, env), 0xff00ff);
            assert.strictEqual(evaluateColorProperty(0x7aff00ff, env), 0x7aff00ff);
        });
        it("converts invalid inputs to undefined", function () {
            assertLogsError(() => {
                assert.strictEqual(evaluateColorProperty("aa", env), undefined);
            }, /Unsupported color format/);
            assertLogsError(() => {
                assert.strictEqual(evaluateColorProperty("#fffff", env), undefined);
            }, /Unsupported color format/);
            assertLogsError(() => {
                assert.strictEqual(evaluateColorProperty(false, env), undefined);
            }, /Unsupported color format/);

            assertLogsError(() => {
                assert.strictEqual(evaluateColorProperty(true, env), undefined);
            }, /Unsupported color format/);
        });
        it("evaluates string encoded numerals", function () {
            assert.strictEqual(evaluateColorProperty("#ff00ff", env), 0xff00ff);
            assert.strictEqual(evaluateColorProperty("rgb(255, 0, 0)", env), 0xff0000);
            assert.strictEqual(evaluateColorProperty("rgba(255, 0, 0, 0.5)", env), -2130771968);
        });
    });

    describe("getPropertyValue", function () {
        it("returns literals untouched", function () {
            assert.equal(getPropertyValue(0, env), 0);
            assert.equal(getPropertyValue("a", env), "a");
            assert.equal(getPropertyValue(true, env), true);
            assert.equal(getPropertyValue(false, env), false);
            assert.equal(getPropertyValue(null, env), null);
            assert.deepEqual(getPropertyValue({ foo: "bar" }, env), { foo: "bar" });
        });
        it("flattens null & undefiled to null", function () {
            assert.equal(getPropertyValue(undefined, env), null);
        });
        it("evaluates basic expressions", function () {
            assert.equal(getPropertyValue(Expr.fromJSON(null), env), null);
            assert.equal(getPropertyValue(Expr.fromJSON(["+", 2, 2]), env), 4);
            assert.equal(getPropertyValue(Expr.fromJSON(["get", "$zoom"]), env), 10);
        });
        it("evaluates errorneous expressions to null", function () {
            assertLogsError(() => {
                assert.equal(getPropertyValue(Expr.fromJSON(["-", 2, "not-a-number"]), env), null);
            }, /failed to evaluate expression/);
        });
        it("evaluates string encoded numerals", function () {
            assert.equal(getPropertyValue("2m", env), 2);
            assert.equal(getPropertyValue("2px", env), 4);
            assert.strictEqual(getPropertyValue("#ff00ff", env), 0xff00ff);
            assert.strictEqual(getPropertyValue("rgb(255, 0, 0)", env), 0xff0000);
            assert.strictEqual(getPropertyValue("rgba(255, 0, 0, 0.5)", env), -2130771968);
        });
    });

    describe("buildObject", function () {
        const tests: Array<{ technique: Technique; object: any; elevation: boolean }> = [
            {
                technique: {
                    name: "extruded-line",
                    color: "#f00",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Mesh
            },
            {
                technique: { name: "standard", renderOrder: 0 },
                elevation: false,
                object: THREE.Mesh
            },
            {
                technique: {
                    name: "extruded-polygon",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Mesh
            },
            { technique: { name: "fill", renderOrder: 0 }, elevation: false, object: THREE.Mesh },
            {
                technique: { name: "squares", renderOrder: 0 },
                elevation: false,
                object: THREE.Points
            },
            {
                technique: {
                    name: "line",
                    color: "#f00",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Line
            },
            {
                technique: {
                    name: "segments",
                    color: "#f00",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.LineSegments
            },
            {
                technique: {
                    name: "shader",
                    primitive: "point",
                    params: {},
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Points
            },
            {
                technique: {
                    name: "shader",
                    primitive: "line",
                    params: {},
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Line
            },
            {
                technique: {
                    name: "shader",
                    primitive: "mesh",
                    params: {},
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Mesh
            },
            { technique: { name: "text", renderOrder: 0 }, object: undefined, elevation: false },
            {
                technique: {
                    name: "extruded-polygon",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: true,
                object: DisplacedMesh
            },
            {
                technique: { name: "standard", renderOrder: 0 },
                elevation: true,
                object: DisplacedMesh
            },
            {
                technique: {
                    name: "extruded-line",
                    color: "#f00",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: true,
                object: DisplacedMesh
            },
            {
                technique: { name: "fill", renderOrder: 0 },
                elevation: true,
                object: DisplacedMesh
            }
        ];

        for (const test of tests) {
            const name =
                "primitive" in test.technique
                    ? `${test.technique.name}(${test.technique.primitive})`
                    : test.technique.name;
            const elevation = test.elevation ? "elevation" : "no elevation";
            const testName = `buildObject builds proper obj for ${name} technique with ${elevation}`;
            it(testName, function () {
                const tile = new Tile(new FakeOmvDataSource({ name: "omv" }), new TileKey(0, 0, 0));
                const geometry = new THREE.BufferGeometry();
                const material = new MapMeshStandardMaterial();

                const technique = test.technique;
                const objClass = test.object;
                if (objClass === undefined) {
                    expect(assert.isFalse(usesObject3D(technique)));
                } else {
                    expect(assert.isTrue(usesObject3D(technique)));
                    const obj = buildObject(technique, geometry, material, tile, test.elevation);
                    expect(obj).to.be.instanceOf(objClass);
                }
            });
        }
    });
});
