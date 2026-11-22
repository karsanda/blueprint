#!/bin/sh
# Checks the built .deb: what it installs, its version, and the postinstall step that links the command.
# Run after `pnpm package:linux`.
set -eu
deb=$(ls dist/*.deb 2>/dev/null | head -1)
[ -n "$deb" ] || { echo "no .deb in dist/"; exit 1; }
version=$(node -p "require('./package.json').version")
contents=$(dpkg-deb -c "$deb")
fail=0
need() {
  echo "$contents" | grep -q -- "$1" || { echo "missing in $deb: $1"; fail=1; }
}
need 'app.asar.unpacked/node_modules/node-pty/build/Release/pty.node'
need 'resources/app.asar$'
need 'usr/share/applications/blueprint.desktop'
need 'usr/share/icons/hicolor/.*/apps/blueprint.png'
[ "$(dpkg-deb -f "$deb" Version)" = "$version" ] || { echo "version is not $version"; fail=1; }
[ "$(dpkg-deb -f "$deb" Package)" = "blueprint" ] || { echo "package is not named blueprint"; fail=1; }
control=$(mktemp -d)
dpkg-deb -e "$deb" "$control"
grep -q "/usr/bin/blueprint" "$control/postinst" || { echo "postinst does not link /usr/bin/blueprint"; fail=1; }
rm -rf "$control"
[ "$fail" -eq 0 ] && echo "package-ok"
exit "$fail"
