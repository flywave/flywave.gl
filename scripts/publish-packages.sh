#!/bin/sh -e

#
# Simple script that bundles the publishing of packages to be run from CI
#

echo '//registry.npmjs.org/:_authToken=${NPM_TOKEN}' > ~/.npmrc
pnpm publish -r --access public --tag alpha
