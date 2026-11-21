#!/usr/bin/env bash
# PROTOTYPE: simulates Claude's edit in the SANDBOX repo for screenshots. demo-revert.sh undoes it.
set -e
case "$PWD" in */.sandbox/shots-repo) ;; *) echo "refusing: only runs in .sandbox/shots-repo" >&2; exit 1 ;; esac
cat > src/math.js <<'JS'
export function sum(xs) {
  return xs.reduce((a, b) => a + b, 0);
}

export function average(xs) {
  if (xs.length === 0) return 0;
  return sum(xs) / xs.length;
}
JS
cat > src/median.js <<'JS'
export function median(xs) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
JS
