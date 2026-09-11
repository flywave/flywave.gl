#!/bin/zsh
# P0 regression probe: checkout <commit>, run the 4 regressed fixtures, print values.
# Usage: scripts/p0-probe.sh <commit>
set -e
commit=$1
cd /Users/xuning/Work/flywave.gl
git checkout -q "$commit"
rm -rf /tmp/_karma_webpack_(N) 2>/dev/null || true
rm -rf rendering-test-results/p0-probe
MBSTYLE_REPORT=rendering-test-results/p0-probe \
CHROME_BIN=$HOME/.cache/puppeteer/chrome-headless-shell/mac_arm-131.0.6778.108/chrome-headless-shell-mac-arm64/chrome-headless-shell \
  node scripts/run-mbstyle-render-tests.js property-function-terrain with-ao data-driven-zero-alpha \
  > /tmp/p0-probe-$commit.log 2>&1
python3 - <<'EOF'
import json, glob
for f in sorted(glob.glob('rendering-test-results/p0-probe/web-*/**/*.ibct-result.json', recursive=True)):
    d = json.load(open(f))
    name = d['imageProps']['name']
    print(f"  {name:55s} {d['mismatchedPixels']:>10,d}  {'PASS' if d['passed'] else 'FAIL'}")
EOF
