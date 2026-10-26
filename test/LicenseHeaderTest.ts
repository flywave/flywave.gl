/* Copyright (C) 2025 flywave.gl contributors */

import { assert } from "chai";
import * as glob from "glob";
import * as path from "path";

import { checkLicenses } from "../scripts/checkLicenses";

/**
 * Matches the standard flywave.gl Apache 2.0 license header. Accepted forms:
 *
 * - Single line (canonical): `/* Copyright (C) 2025 flywave.gl contributors *` + `/`
 * - Line comment:            `// Copyright (C) 2025 flywave.gl contributors`
 * - Multi-line block containing "Copyright (C) <year> flywave.gl contributors"
 *   together with an explicit Apache mention, e.g. an
 *   "SPDX-License-Identifier: Apache-2.0" or "Licensed under ... Apache" line.
 *
 * The year must be 2024-2030. An optional shebang line before the header is
 * tolerated. The decoration around the copyright line is matched loosely
 * (`/*` or `//` start), but the header must always contain
 * "flywave.gl contributors" and, for multi-line blocks, "Apache".
 */
const APACHE_LICENSE = new RegExp(
    [
        // Single-line block comment (canonical one-liner):
        "^\\s*(?:#![^\n]*\n)?\\s*/\\*[ \\t]*Copyright \\(C\\) (?:202[4-9]|2030) " +
            "flywave\\.gl contributors\\.?[ \\t]*\\*/",
        // Single-line `//` comment:
        "|^\\s*(?:#![^\n]*\n)?\\s*//[ \\t]*Copyright \\(C\\) (?:202[4-9]|2030) " +
            "flywave\\.gl contributors",
        // Multi-line block comment with an explicit Apache mention:
        "|^\\s*(?:#![^\n]*\n)?\\s*/\\*[\\s\\S]{0,200}?Copyright \\(C\\) (?:202[4-9]|2030) " +
            "flywave\\.gl contributors[\\s\\S]{0,300}?Apache[\\s\\S]{0,200}?\\*/"
    ].join("")
);

describe("LicenseHeaderCheck", function () {
    it("Contains correct license header", function (done) {
        // In some cases (coverage run on CI) --no-timeouts flag is not passed,
        // so we have to set it here specifically.
        this.timeout(180000); // 3 mins
        const sourceFiles = glob
            .sync(path.join(__dirname, "..", "**/*.ts"))
            .filter(file => !file.includes("/node_modules/"))
            .filter(file => !file.includes("/lib/"))
            .filter(file => !file.includes("/dist/"))
            .filter(file => !file.includes("/docs/"))
            .filter(file => !file.includes("/scripts/"))
            .filter(file => !file.endsWith(".d.ts"))
            .sort();

        checkLicenses(sourceFiles, APACHE_LICENSE, errors => {
            assert.deepEqual(errors, []);
            done();
        });
    });
});
