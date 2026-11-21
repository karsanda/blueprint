#!/usr/bin/env bash
# PROTOTYPE: creates a small throwaway git repo for Claude to edit, so no real project is touched.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=".sandbox/${1:-demo-repo}"
rm -rf "$DIR"
mkdir -p "$DIR/src"
cd "$DIR"
cat > package.json <<'EOF'
{ "name": "demo-repo", "private": true, "type": "module", "scripts": { "test": "node --test" } }
EOF
cat > README.md <<'EOF'
# demo-repo

A tiny project for the Blueprint prototype. Ask Claude to fix the bug in `average`, or to add a `median` function with tests.
EOF
cat > src/math.js <<'EOF'
export function sum(xs) {
  return xs.reduce((a, b) => a + b, 0);
}

// Bug: returns NaN for an empty list.
export function average(xs) {
  return sum(xs) / xs.length;
}
EOF
cat > src/math.test.js <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum, average } from './math.js';

test('sum', () => assert.equal(sum([1, 2, 3]), 6));
test('average', () => assert.equal(average([2, 4]), 3));
EOF
git init -q -b main
git add -A
git -c user.name="Blueprint Prototype" -c user.email="prototype@localhost" commit -q -m "demo repo for the Blueprint prototype"
echo "sandbox ready: $(pwd)"
