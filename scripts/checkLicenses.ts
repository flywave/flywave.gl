/* Copyright (C) 2025 flywave.gl contributors */

import * as fs from "fs";

/**
 * Checks whether the specified source files contain a comment matching the
 * specified license RegExp and reports the ones that do not.
 *
 * The check intentionally does not validate the copyright year(s) against the
 * version history (the previous implementation shelled out to git for that);
 * only the presence and the shape of the header are verified.
 *
 * @param sourceFiles The source files to check
 * @param licenseRegEx RegExp to match the license. The RegExp should match the
 *        whole license header; there are no capture-group requirements.
 * @param callback The callback function to execute upon completion. An array
 *        of error strings is passed back, empty when every file matches.
 */
export function checkLicenses(
    sourceFiles: string[],
    licenseRegEx: RegExp,
    callback: (errors: string[]) => void
): void {
    const errors: string[] = [];
    for (const sourceFile of sourceFiles) {
        const content = fs.readFileSync(sourceFile, { encoding: "utf8" });
        if (licenseRegEx.exec(content) === null) {
            errors.push(`${sourceFile} has no valid copyright notice`);
        }
    }
    callback(errors);
}
