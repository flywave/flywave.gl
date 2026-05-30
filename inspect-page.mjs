import WebSocket from "/Users/wh/github/flywave.gl/node_modules/.pnpm/ws@8.19.0/node_modules/ws/index.js";

const CDP_URL = "ws://127.0.0.1:9222/devtools/browser/98d02202-1ee3-4ddb-957f-6b10fa7fc0e5";
const TARGET_URL = "http://127.0.0.1:8080/getting-started-basic-config.html";

function send(ws, msg) {
    return new Promise((resolve, reject) => {
        ws.send(JSON.stringify(msg));
        const handler = data => {
            const resp = JSON.parse(data.toString());
            if (resp.id === msg.id) {
                ws.removeListener("message", handler);
                resolve(resp);
            }
        };
        ws.on("message", handler);
        setTimeout(() => reject(new Error("Timeout waiting for response")), 10000);
    });
}

async function connect(url) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.on("open", () => resolve(ws));
        ws.on("error", reject);
        setTimeout(() => reject(new Error("WebSocket connection timeout")), 10000);
    });
}

async function main() {
    // Connect to browser
    const browser = await connect(CDP_URL);
    console.log("Connected to browser");

    // Get target ID for the browser
    const { result: targetResult } = await send(browser, {
        id: 1,
        method: "Target.getTargets"
    });
    console.log("Targets count:", targetResult.targetInfos.length);

    // Check if our target page already exists
    let existingTarget = targetResult.targetInfos.find(
        t => t.url === TARGET_URL || t.title === "flywave"
    );

    let page;
    let targetId;

    if (existingTarget) {
        targetId = existingTarget.targetId;
        console.log("Found existing target:", targetId);
        page = await connect(`ws://127.0.0.1:9222/devtools/page/${targetId}`);
    } else {
        // Create a new target
        const { result: createResult } = await send(browser, {
            id: 2,
            method: "Target.createTarget",
            params: {
                url: "about:blank",
                newWindow: false
            }
        });
        targetId = createResult.targetId;
        console.log("Created new target:", targetId);

        page = await connect(`ws://127.0.0.1:9222/devtools/page/${targetId}`);

        // Navigate to the URL
        const navResult = await send(page, {
            id: 1,
            method: "Page.navigate",
            params: { url: TARGET_URL }
        });
        console.log("Navigated, frameId:", navResult?.result?.frameId);

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Enable Console domain
    await send(page, {
        id: 2,
        method: "Console.enable"
    });
    console.log("Console enabled");

    // Enable Runtime domain for evaluation
    await send(page, {
        id: 3,
        method: "Runtime.enable"
    });
    console.log("Runtime enabled");

    // Collect console messages
    const consoleMessages = [];
    page.on("message", data => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "Console.messageAdded") {
            consoleMessages.push(msg.params.message);
        }
    });

    // Wait a bit for any initial console messages
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Evaluate: check scene rendering
    const evalScripts = [
        {
            name: "scene_check",
            expression: `
        (function() {
          const results = {};
          // Check if window.scene exists
          results.sceneExists = typeof scene !== 'undefined';
          
          if (typeof scene !== 'undefined') {
            results.sceneType = scene.constructor ? scene.constructor.name : 'unknown';
            results.sceneChildren = scene.children ? scene.children.length : 'N/A';
            
            // Check renderer
            if (typeof renderer !== 'undefined') {
              results.rendererExists = true;
              results.rendererType = renderer.constructor ? renderer.constructor.name : 'unknown';
              results.renderInfo = renderer.info ? {
                triangles: renderer.info.render && renderer.info.render.triangles,
                calls: renderer.info.render && renderer.info.render.calls,
                geometries: renderer.info.memory && renderer.info.memory.geometries,
                textures: renderer.info.memory && renderer.info.memory.textures
              } : 'N/A';
            } else {
              results.rendererExists = false;
            }
            
            // Find sunLight
            let sunLight = null;
            scene.traverse(function(obj) {
              if (obj.isDirectionalLight || obj.name === 'sunLight' || obj.name?.toLowerCase?.().includes('sun')) {
                sunLight = obj;
              }
            });
            
            if (sunLight) {
              results.sunLight = {
                name: sunLight.name,
                type: sunLight.type,
                intensity: sunLight.intensity,
                color: sunLight.color ? (sunLight.color.getHex ? '#' + sunLight.color.getHexString() : sunLight.color) : 'N/A',
                position: sunLight.position ? {x: sunLight.position.x, y: sunLight.position.y, z: sunLight.position.z} : 'N/A'
              };
            } else {
              results.sunLight = null;
            }
            
            // Find Celestia mesh/textures
            let celestiaObject = null;
            scene.traverse(function(obj) {
              if (obj.name === 'Celestia' || obj.name?.toLowerCase?.().includes('celestia')) {
                celestiaObject = obj;
              }
            });
            
            if (celestiaObject) {
              results.celestia = {
                name: celestiaObject.name,
                type: celestiaObject.type,
                isMesh: celestiaObject.isMesh,
                material: celestiaObject.material ? {
                  type: celestiaObject.material.type,
                  name: celestiaObject.material.name
                } : null
              };
              
              // Check textures on material
              if (celestiaObject.material) {
                const mat = celestiaObject.material;
                const textures = [];
                for (const key of Object.keys(mat)) {
                  if (mat[key] && mat[key].isTexture) {
                    textures.push({
                      key: key,
                      imageLoaded: mat[key].image ? true : false,
                      imageComplete: mat[key].image ? (mat[key].image.complete === undefined ? 'N/A' : mat[key].image.complete) : false,
                      wrapS: mat[key].wrapS,
                      wrapT: mat[key].wrapT,
                      magFilter: mat[key].magFilter,
                      minFilter: mat[key].minFilter
                    });
                  }
                }
                results.celestia.textures = textures;
              }
            } else {
              results.celestia = null;
            }
            
            // Check all lights
            const lights = [];
            scene.traverse(function(obj) {
              if (obj.isLight) {
                lights.push({
                  name: obj.name,
                  type: obj.type,
                  intensity: obj.intensity,
                  color: obj.color ? ('#' + obj.color.getHexString()) : 'N/A'
                });
              }
            });
            results.lights = lights;
            
            // Check all meshes
            const meshes = [];
            scene.traverse(function(obj) {
              if (obj.isMesh) {
                meshes.push({
                  name: obj.name,
                  type: obj.type,
                  materialType: obj.material?.type || 'N/A'
                });
              }
            });
            results.meshes = meshes;
          }
          
          return JSON.stringify(results, null, 2);
        })()
      `
        },
        {
            name: "three_globals",
            expression: `
        JSON.stringify({
          hasTHREE: typeof THREE !== 'undefined',
          hasScene: typeof scene !== 'undefined',
          hasRenderer: typeof renderer !== 'undefined',
          hasCamera: typeof camera !== 'undefined',
          threeVersion: typeof THREE !== 'undefined' ? THREE.REVISION : 'N/A'
        }, null, 2)
      `
        }
    ];

    const evalResults = {};
    for (const script of evalScripts) {
        try {
            const result = await send(page, {
                id: 100 + evalScripts.indexOf(script),
                method: "Runtime.evaluate",
                params: {
                    expression: script.expression,
                    returnByValue: true,
                    awaitPromise: true
                }
            });

            if (result.result?.result?.value) {
                evalResults[script.name] = JSON.parse(result.result.result.value);
            } else if (result.result?.result?.description) {
                evalResults[script.name] = { error: result.result.result.description };
            } else {
                evalResults[script.name] = { error: "No result", full: result };
            }
        } catch (err) {
            evalResults[script.name] = { error: err.message };
        }
    }

    // Wait a moment for any remaining console messages
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Close the target if we created it
    if (!existingTarget) {
        await send(browser, {
            id: 999,
            method: "Target.closeTarget",
            params: { targetId }
        });
    }

    // Close connections
    page.close();
    browser.close();

    // Output results
    console.log("\n======== CONSOLE MESSAGES ========");
    console.log(JSON.stringify(consoleMessages, null, 2));

    console.log("\n======== EVALUATION RESULTS ========");
    console.log(JSON.stringify(evalResults, null, 2));
}

main().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
