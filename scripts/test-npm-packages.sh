#!/usr/bin/env bash

#
# This test checks if `npm` packages we are about to publish to `npmjs.org`
# actually work with sample client application - where this application is
# just output of our `yo @flywave/harp.gl`.
#
set -e

# direct and indirect harp.gl dependencies of our test app
# (TODO, read it from package.json)
packages="\
    @flywave/flywave-datasource-protocol \
    @flywave/flywave-fetch \
    @flywave/flywave-geometry \
    @flywave/flywave-geoutils \
    @flywave/flywave-lines \
    @flywave/flywave-lrucache \
    @flywave/flywave-map-controls \
    @flywave/flywave-map-theme \
    @flywave/flywave-mapview \
    @flywave/flywave-mapview-decoder \
    @flywave/flywave-materials \
    @flywave/flywave-vectortile-datasource \
    @flywave/flywave-text-canvas \
    @flywave/flywave-transfer-manager \
    @flywave/flywave-utils \
    @flywave/flywave-webpack-utils"


# ensure we have clean environment before and after test
rootDir=`pwd`
exampleDir=harp.gl-example
function cleanup() {
    cd $rootDir
    rm -f @flywave/*/*.tgz
    rm -fr $exampleDir
}
trap cleanup EXIT

set -x
cleanup

# build the npm packages
for package in $packages ; do
    # lerna exec "npm pack" is smarter and, parallel i guess but packages everything
    # and we don't want examples and other stuff
    ( cd $package && npm pack )
done

# generate test app using our local packages
yes "" | HARP_PACKAGE_ROOT="../" npm init @flywave/harpgl-app
cd $exampleDir

set +x
for package in $packages ; do
    packageArchives="$packageArchives ../$package/here-$(basename $package)-*.tgz"
done
set -x

# force use of our local versions
npm install --no-save $packageArchives

# build it
npm run build

# cleanup will be called automatically
