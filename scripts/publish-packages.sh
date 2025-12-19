#!/bin/sh -e

#
# Simple script that bundles the publishing of packages to be run from CI
#

# Create backup of devDependencies
echo "Backing up devDependencies..."
node "$(dirname "$0")/manage-devdeps.js" backup

# Clear devDependencies for publish
echo "Clearing devDependencies for publish..."
node "$(dirname "$0")/manage-devdeps.js" clear

# Ensure we restore devDependencies even if publish fails
trap 'echo "Restoring devDependencies..."; node "$(dirname "$0")/manage-devdeps.js" restore' EXIT

# Temporarily allow adding pnpm-lock.yaml during lerna publish
echo '//registry.npmjs.org/:_authToken=${NPM_TOKEN}' > ~/.npmrc
git config core.safecrlf false
lerna publish --no-private

# If we reach here, publish succeeded, so restore devDependencies
echo "Publish succeeded, restoring devDependencies..."
node "$(dirname "$0")/manage-devdeps.js" restore