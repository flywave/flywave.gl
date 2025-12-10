/* Copyright (C) 2025 flywave.gl contributors */

/* eslint-disable no-console */

import { ncp } from "ncp";
import * as path from "path";

function onCopyError(err: Error[] | null) {
    if (err === null) {
        return;
    }

    console.error("Unable to copy files:", err);
    process.exitCode = 1;
}

const fontDir = path.dirname(require.resolve("@here/harp-fontcatalog/package.json"));

ncp(path.join(fontDir, "resources"), path.join(__dirname, "..", "resources", "fonts"), onCopyError);
