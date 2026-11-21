#!/bin/sh
# Check relative Markdown links and PlantUML [[links]]. Prints only "check-done" when all resolve.
cd "$(dirname "$0")/.." || exit 1
for f in README.md AGENTS.md entries/system/*.md entries/usecase/*.md entries/usecase/*/*.md entries/actors/*.md entries/domain/*.md entries/domain/*/*.md doc/*.md doc/*/*.md; do
  [ -e "$f" ] || continue
  [ "$f" = doc/template.md ] && continue
  grep -o '](\([^)h#][^)]*\))' "$f" | sed 's/^](//;s/)$//;s/#.*$//' | while read -r l; do
    [ -e "$(dirname "$f")/$l" ] || echo "BROKEN $f -> $l"
  done
done
for f in entries/diagram/*.puml; do
  [ -e "$f" ] || continue
  grep -o '\[\[[^]]*\]\]' "$f" | sed 's/^\[\[//;s/\]\]$//' | while read -r l; do
    [ -e "$(dirname "$f")/$l" ] || echo "BROKEN $f -> $l"
  done
done
echo check-done
