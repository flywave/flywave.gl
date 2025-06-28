/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

const ncp = require("ncp");
const fs = require("fs");
const path = require("path");

function asyncCopyfiles(source, destination) {
    return new Promise((resolve, reject) => {
        ncp(source, destination, err => {
            if (err) {
                reject(err);
            }
            resolve();
        });
    });
}

function getModuleDir() {
    return path.resolve(path.dirname(__dirname), "../../");
}

const moduleDir = getModuleDir();
const threeModuleDir = require.resolve("three");

async function copyResources() {
    if (!fs.existsSync("dist")) fs.mkdirSync("dist");

    await asyncCopyfiles(moduleDir + "/@flywave/flywave-map-theme/resources", "dist/resources");
    await asyncCopyfiles("resources", "dist/resources");

    fs.copyFileSync(threeModuleDir, "dist/three.cjs");
}

copyResources().catch(err => {
    console.log("Error", err);
    process.exit(1);
});
