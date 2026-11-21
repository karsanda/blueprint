import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** One directory for everything a run makes. The teardown removes it, so a run leaves nothing behind. */
export default function globalSetup(): void {
  process.env.BLUEPRINT_E2E_ROOT = mkdtempSync(join(tmpdir(), 'blueprint-e2e-run-'))
}
