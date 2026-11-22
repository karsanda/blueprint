/**
 * A line for the e2e tests' launch log, which keeps what the app prints: only when they run the app
 * (BLUEPRINT_E2E=1). It shows how far a start or a quit got, when one hangs in CI.
 */
export function e2eLog(line: string): void {
  if (process.env['BLUEPRINT_E2E'] === '1') console.log(`[blueprint] ${line}`)
}
