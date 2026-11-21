import type { StatusSignal } from '../../shared/api'
import { type HookInput, signalFromHook } from './hooks'
import { TranscriptFollower } from './transcript'

type Follower = Pick<TranscriptFollower, 'follow' | 'unfollow' | 'unfollowAll'>

interface Start {
  tabId: string
  /** The session whose transcript this start follows. `/clear` changes it. */
  sessionId?: string
}

/**
 * Turns what Blueprint hears from Claude Code's hooks and transcripts into status signals for the right tab.
 * Hooks are routed by the start key in their URL, because `/clear` gives a session a new id.
 */
export class StatusRelay {
  private readonly startByKey = new Map<string, Start>()
  private readonly keyByTab = new Map<string, string>()
  private readonly follower: Follower

  constructor(
    private readonly send: (tabId: string, signal: StatusSignal) => void,
    makeFollower: (onInterrupt: (sessionId: string) => void) => Follower = (onInterrupt) =>
      new TranscriptFollower(onInterrupt),
  ) {
    this.follower = makeFollower((sessionId) => {
      for (const start of this.startByKey.values()) {
        if (start.sessionId === sessionId) this.send(start.tabId, { kind: 'interrupted' })
      }
    })
  }

  /** A tab's new start replaces its previous one, whose transcript is no longer followed. */
  register(tabId: string, startKey: string): void {
    this.unregister(tabId)
    this.keyByTab.set(tabId, startKey)
    this.startByKey.set(startKey, { tabId })
  }

  /** Forgets a closed tab's start key and stops following its transcript. */
  unregister(tabId: string): void {
    const key = this.keyByTab.get(tabId)
    if (key === undefined) return
    const start = this.startByKey.get(key)
    if (start?.sessionId !== undefined) this.follower.unfollow(start.sessionId)
    this.startByKey.delete(key)
    this.keyByTab.delete(tabId)
  }

  hook(startKey: string, e: HookInput): void {
    const start = this.startByKey.get(startKey)
    if (start === undefined) return
    if (e.hook_event_name === 'UserPromptSubmit' && e.transcript_path && start.sessionId !== e.session_id) {
      if (start.sessionId !== undefined) this.follower.unfollow(start.sessionId)
      start.sessionId = e.session_id
      this.follower.follow(e.session_id, e.transcript_path)
    }
    const signal = signalFromHook(e)
    if (signal) this.send(start.tabId, signal)
  }

  close(): void {
    this.follower.unfollowAll()
  }
}
