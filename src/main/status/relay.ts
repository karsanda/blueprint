import type { StatusSignal } from '../../shared/api'
import { type HookInput, signalFromHook } from './hooks'
import { TranscriptFollower } from './transcript'

type Follower = Pick<TranscriptFollower, 'follow' | 'unfollow' | 'unfollowAll'>

/** Turns what Blueprint hears from Claude Code's hooks and transcripts into status signals for the right tab. */
export class StatusRelay {
  private readonly tabBySession = new Map<string, string>()
  private readonly sessionByTab = new Map<string, string>()
  private readonly follower: Follower

  constructor(
    private readonly send: (tabId: string, signal: StatusSignal) => void,
    makeFollower: (onInterrupt: (sessionId: string) => void) => Follower = (onInterrupt) =>
      new TranscriptFollower(onInterrupt),
  ) {
    this.follower = makeFollower((sessionId) => {
      const tabId = this.tabBySession.get(sessionId)
      if (tabId !== undefined) this.send(tabId, { kind: 'interrupted' })
    })
  }

  /** A tab's new session replaces its previous one, which is no longer followed. */
  register(tabId: string, sessionId: string): void {
    const previous = this.sessionByTab.get(tabId)
    if (previous !== undefined) {
      this.tabBySession.delete(previous)
      this.follower.unfollow(previous)
    }
    this.sessionByTab.set(tabId, sessionId)
    this.tabBySession.set(sessionId, tabId)
  }

  hook(e: HookInput): void {
    const tabId = this.tabBySession.get(e.session_id)
    if (tabId === undefined) return
    if (e.hook_event_name === 'UserPromptSubmit' && e.transcript_path) {
      this.follower.follow(e.session_id, e.transcript_path)
    }
    const signal = signalFromHook(e)
    if (signal) this.send(tabId, signal)
  }

  close(): void {
    this.follower.unfollowAll()
  }
}
