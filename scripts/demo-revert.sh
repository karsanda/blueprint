#!/usr/bin/env bash
# PROTOTYPE: undoes demo-edit.sh in the sandbox repo.
set -e
case "$PWD" in */.sandbox/shots-repo) ;; *) echo "refusing: only runs in .sandbox/shots-repo" >&2; exit 1 ;; esac
git checkout -- src/math.js
rm -f src/median.js
