import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * One directory for everything a run makes. The teardown removes it, so a run leaves nothing behind. Its
 * real path, since macOS's temp folder sits behind a link (/var is /private/var), and programs report the
 * real one.
 */
export default function globalSetup(): void {
  process.env.BLUEPRINT_E2E_ROOT = realpathSync(mkdtempSync(join(tmpdir(), 'blueprint-e2e-run-')))
}
