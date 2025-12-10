/*
 * Copyright (C) 2025 flywave.gl contributors.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ContextualArabicConverter, FontCatalog, FontStyle, FontUnit, FontVariant, TextCanvas, TextRenderStyle } from "@flywave/flywave.gl";
import { GUI } from "dat.gui";
import * as THREE from "three";
/**
 * This example showcases how [[TextCanvas]] can handle dynamic loading of multiple [[FontCatalog]]
 * assets, as well as dynamic real-time text styling.
 */
export var TextStylingDynamicExample;
(function (TextStylingDynamicExample) {
    // Configuration constants
    const CONFIG = {
        CANVAS_ELEMENT_ID: "mapCanvas",
        FONT_CATALOG_PATH: "resources/fonts/Default_FontCatalog.json",
        INITIAL_TEXT: "Type to start...",
        CHARACTER_COUNT: 256,
        INITIAL_FONT_SIZE: 64.0,
        INITIAL_BACKGROUND_SIZE: 8.0,
        INITIAL_FONT_COLOR: 0xff0000,
        INITIAL_BACKGROUND_COLOR: 0x000000,
        INITIAL_BACKGROUND_OPACITY: 1.0,
        GRID_COLOR: 0x999999,
        BOUNDS_COLOR: 0xff0000,
        BOUNDS_OPACITY: 0.2,
        SPHERE_GEOMETRY_RADIUS: 4,
        SPHERE_GEOMETRY_WIDTH_SEGMENTS: 4,
        SPHERE_GEOMETRY_HEIGHT_SEGMENTS: 4
    };
    // GUI configuration object
    const gui = new GUI({ hideable: false });
    const guiOptions = {
        input: CONFIG.INITIAL_TEXT,
        fontName: "",
        gridEnabled: true,
        boundsEnabled: true,
        color: {
            r: 0.0,
            g: 0.0,
            b: 0.0
        },
        backgroundColor: {
            r: 0.0,
            g: 0.0,
            b: 0.0
        }
    };
    // Three.js renderer and camera
    let webglRenderer;
    let camera;
    // Text rendering related
    let textCanvas;
    let textRenderStyle;
    let assetsLoaded = false;
    // Text and position related
    let textSample = guiOptions.input;
    const penPosition = new THREE.Vector3(Math.floor(-window.innerWidth / 4.0), 0, 0);
    // Text bounds related
    const textBounds = new THREE.Box2(new THREE.Vector2(), new THREE.Vector2());
    const characterBounds = [];
    let boundsScene;
    let boundsVertexBuffer;
    let boundsGeometry;
    let boundsObject;
    const boundsPosition = penPosition.clone();
    // Grid related
    let gridScene;
    let penObject;
    let upperCase = false;
    /**
     * Add GUI controls
     */
    function addGUIControls() {
        guiOptions.color.r = textRenderStyle.color.r * 255.0;
        guiOptions.color.g = textRenderStyle.color.g * 255.0;
        guiOptions.color.b = textRenderStyle.color.b * 255.0;
        guiOptions.backgroundColor.r = textRenderStyle.backgroundColor.r * 255.0;
        guiOptions.backgroundColor.g = textRenderStyle.backgroundColor.g * 255.0;
        guiOptions.backgroundColor.b = textRenderStyle.backgroundColor.b * 255.0;
        gui.add(guiOptions, "input").onFinishChange((value) => {
            textSample = ContextualArabicConverter.instance.convert(value);
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        });
        gui.add(guiOptions, "gridEnabled");
        gui.add(guiOptions, "boundsEnabled");
        gui.add(textRenderStyle.fontSize, "unit", {
            Em: FontUnit.Em,
            Pixel: FontUnit.Pixel,
            Point: FontUnit.Point,
            Percent: FontUnit.Percent
        }).onChange((value) => {
            textRenderStyle.fontSize.unit = Number(value);
        });
        gui.add(textRenderStyle.fontSize, "size", 0.1, 100, 0.1);
        gui.add(textRenderStyle.fontSize, "backgroundSize", 0.0, 100, 0.1);
        gui.addColor(guiOptions, "color").onChange(() => {
            textRenderStyle.color.r = guiOptions.color.r / 255.0;
            textRenderStyle.color.g = guiOptions.color.g / 255.0;
            textRenderStyle.color.b = guiOptions.color.b / 255.0;
        });
        gui.add(textRenderStyle, "opacity", 0.0, 1.0, 0.01);
        gui.addColor(guiOptions, "backgroundColor").onChange(() => {
            textRenderStyle.backgroundColor.r = guiOptions.backgroundColor.r / 255.0;
            textRenderStyle.backgroundColor.g = guiOptions.backgroundColor.g / 255.0;
            textRenderStyle.backgroundColor.b = guiOptions.backgroundColor.b / 255.0;
        });
        gui.add(textRenderStyle, "backgroundOpacity", 0.0, 1.0, 0.1);
        gui.add(guiOptions, "fontName").onFinishChange((value) => {
            textRenderStyle.fontName = value;
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        });
        gui.add(textRenderStyle, "fontStyle", {
            Regular: FontStyle.Regular,
            Bold: FontStyle.Bold,
            Italic: FontStyle.Italic,
            BoldItalic: FontStyle.BoldItalic
        }).onChange((value) => {
            textRenderStyle.fontStyle = Number(value);
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        });
        gui.add(textRenderStyle, "fontVariant", {
            Regular: FontVariant.Regular,
            AllCaps: FontVariant.AllCaps,
            SmallCaps: FontVariant.SmallCaps
        }).onChange((value) => {
            textRenderStyle.fontVariant = Number(value);
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        });
    }
    /**
     * Initialize debug grid
     */
    function initDebugGrid() {
        gridScene = new THREE.Scene();
        gridScene.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.PlaneGeometry(window.innerWidth - 1, window.innerHeight - 1, Math.floor(window.innerWidth / 16), Math.floor(window.innerHeight / 16))), new THREE.LineBasicMaterial({
            color: CONFIG.GRID_COLOR,
            depthWrite: false,
            depthTest: false
        })), new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.PlaneGeometry(window.innerWidth - 1, window.innerHeight - 1, 2, 2)), new THREE.LineBasicMaterial({
            color: CONFIG.BOUNDS_COLOR,
            depthWrite: false,
            depthTest: false
        })));
        penObject = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.SPHERE_GEOMETRY_RADIUS, CONFIG.SPHERE_GEOMETRY_WIDTH_SEGMENTS, CONFIG.SPHERE_GEOMETRY_HEIGHT_SEGMENTS), new THREE.MeshBasicMaterial({ color: CONFIG.BOUNDS_COLOR }));
        gridScene.add(penObject);
    }
    /**
     * Initialize debug bounds
     */
    function initDebugBounds() {
        boundsScene = new THREE.Scene();
        boundsVertexBuffer = new THREE.BufferAttribute(new Float32Array(32 * 4 * CONFIG.CHARACTER_COUNT), 4);
        boundsVertexBuffer.setUsage(THREE.DynamicDrawUsage);
        boundsGeometry = new THREE.BufferGeometry();
        boundsGeometry.setAttribute("position", boundsVertexBuffer);
        boundsObject = new THREE.Line(boundsGeometry, new THREE.LineBasicMaterial({
            color: CONFIG.BOUNDS_COLOR,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: CONFIG.BOUNDS_OPACITY
        }));
        boundsScene.add(boundsObject);
    }
    /**
     * Update debug bounds
     * @param position Position vector
     */
    function updateDebugBounds(position) {
        const vertexArray = boundsVertexBuffer.array;
        let arrayIdx = 0;
        vertexArray[arrayIdx++] = textBounds.min.x;
        vertexArray[arrayIdx++] = textBounds.min.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.min.x;
        vertexArray[arrayIdx++] = textBounds.max.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.max.x;
        vertexArray[arrayIdx++] = textBounds.max.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.max.x;
        vertexArray[arrayIdx++] = textBounds.min.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.min.x;
        vertexArray[arrayIdx++] = textBounds.min.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        for (const bounds of characterBounds) {
            vertexArray[arrayIdx++] = bounds.min.x;
            vertexArray[arrayIdx++] = bounds.min.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.min.x;
            vertexArray[arrayIdx++] = bounds.max.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.max.x;
            vertexArray[arrayIdx++] = bounds.max.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.max.x;
            vertexArray[arrayIdx++] = bounds.min.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.min.x;
            vertexArray[arrayIdx++] = bounds.min.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
        }
        boundsVertexBuffer.needsUpdate = true;
        boundsVertexBuffer.addUpdateRange(0, arrayIdx);
        boundsGeometry.setDrawRange(0, arrayIdx / 4);
        boundsObject.position.x = position.x;
        boundsObject.position.y = position.y;
    }
    /**
     * Handle window resize event
     */
    function onWindowResize() {
        webglRenderer.setSize(window.innerWidth, window.innerHeight);
        camera.left = -window.innerWidth / 2.0;
        camera.right = window.innerWidth / 2.0;
        camera.bottom = -window.innerHeight / 2.0;
        camera.top = window.innerHeight / 2.0;
        camera.updateProjectionMatrix();
    }
    /**
     * Handle keyboard key release event
     */
    function onKeyUp(event) {
        const key = event.keyCode || event.which;
        if (key === 16) {
            upperCase = false;
        }
    }
    /**
     * Handle keyboard key event
     */
    function onKeyDown(event) {
        const key = event.keyCode || event.which;
        // Handle backspace key
        if (key === 8) {
            textSample = textSample.slice(0, textSample.length - 1);
        }
        else if (key === 16) {
            upperCase = true;
        }
        else {
            const char = upperCase
                ? String.fromCharCode(key)
                : String.fromCharCode(key).toLowerCase();
            textSample += char;
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(char, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        }
    }
    /**
     * Animation loop function
     */
    function animate() {
        requestAnimationFrame(animate);
        webglRenderer.clear();
        if (guiOptions.gridEnabled) {
            penObject.position.set(penPosition.x, penPosition.y, -4.0);
            webglRenderer.render(gridScene, camera);
        }
        penPosition.set(Math.floor(-window.innerWidth / 4.0), 0, 0);
        boundsPosition.copy(penPosition);
        if (assetsLoaded) {
            textCanvas.clear();
            textCanvas.textRenderStyle = textRenderStyle;
            if (guiOptions.boundsEnabled) {
                textCanvas.measureText(textSample, textBounds, {
                    outputCharacterBounds: characterBounds
                });
            }
            textCanvas.addText(textSample, penPosition, { updatePosition: true });
            textCanvas.render(camera);
        }
        if (guiOptions.boundsEnabled) {
            updateDebugBounds(boundsPosition);
            webglRenderer.render(boundsScene, camera);
        }
    }
    /**
     * Main initialization function
     */
    function main() {
        // Initialize Three.JS, enable backward compatibility for three.js <= 0.117
        const WebGL1Renderer = THREE.WebGL1Renderer;
        webglRenderer = new (WebGL1Renderer ?? THREE.WebGLRenderer)({
            canvas: document.getElementById(CONFIG.CANVAS_ELEMENT_ID)
        });
        webglRenderer.domElement.addEventListener("contextmenu", e => e.preventDefault());
        webglRenderer.autoClear = false;
        webglRenderer.setClearColor(0xffffff);
        webglRenderer.setPixelRatio(window.devicePixelRatio);
        webglRenderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(webglRenderer.domElement);
        window.addEventListener("resize", onWindowResize);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        camera = new THREE.OrthographicCamera(-window.innerWidth / 2.0, window.innerWidth / 2.0, window.innerHeight / 2.0, -window.innerHeight / 2.0);
        camera.position.z = 1.0;
        camera.near = 0.0;
        camera.updateProjectionMatrix();
        // Initialize TextCanvas
        textRenderStyle = new TextRenderStyle({
            fontSize: {
                unit: FontUnit.Pixel,
                size: CONFIG.INITIAL_FONT_SIZE,
                backgroundSize: CONFIG.INITIAL_BACKGROUND_SIZE
            },
            color: new THREE.Color(CONFIG.INITIAL_FONT_COLOR),
            backgroundColor: new THREE.Color(CONFIG.INITIAL_BACKGROUND_COLOR),
            backgroundOpacity: CONFIG.INITIAL_BACKGROUND_OPACITY
        });
        FontCatalog.load(CONFIG.FONT_CATALOG_PATH, 2048).then((loadedFontCatalog) => {
            textCanvas = new TextCanvas({
                renderer: webglRenderer,
                fontCatalog: loadedFontCatalog,
                minGlyphCount: 16,
                maxGlyphCount: CONFIG.CHARACTER_COUNT
            });
            loadedFontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        });
        // Initialize debug visualization
        initDebugBounds();
        initDebugGrid();
        addGUIControls();
        // Animation loop
        animate();
    }
    main();
})(TextStylingDynamicExample || (TextStylingDynamicExample = {}));
