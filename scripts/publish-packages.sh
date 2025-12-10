#!/bin/sh -e

#
# Simple script that bundles the publishing of packages to be run from CI
#

# Temporarily allow adding pnpm-lock.yaml during lerna publish
echo '//registry.npmjs.org/:_authToken=${NPM_TOKEN}' > ~/.npmrc
git config core.safecrlf false
lerna publish --no-private
