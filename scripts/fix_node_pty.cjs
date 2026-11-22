// node-pty's macOS helper, which starts every terminal's program there, is published without its execute
// permission, so on macOS every terminal would fail with `posix_spawnp failed`. Run after each install.
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '../node_modules/node-pty')
const helpers = [path.join(root, 'build/Release/spawn-helper')]
const prebuilds = path.join(root, 'prebuilds')
if (fs.existsSync(prebuilds)) {
  for (const dir of fs.readdirSync(prebuilds)) helpers.push(path.join(prebuilds, dir, 'spawn-helper'))
}
for (const helper of helpers) if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755)
