/**
 * Checks whether specified source files contain license matching the specified RegExp.
 * @param sourceFiles The source files to check
 * @param licenseRegEx RegExp to match the license.
 *                      IMPORTANT, RegExp match should match the whole license and in the match groups returns the
 *                      following:
 *                      - match[1] - copyright start year
 *                      - match[2] - copyright end year (if specified)
 * @param callback The callback function to execute upon completion. Array of errors strings is passed back,
 *                 in case not matching file is found.
 * @param [fix=false] Flag indicating whether correct licenses should be automatically fixed. Default is false.
 */
export declare function checkLicenses(sourceFiles: string[], licenseRegEx: RegExp, callback: (errors: string[]) => void, fix?: boolean): void;
