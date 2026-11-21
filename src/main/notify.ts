import { type BrowserWindow, Notification } from 'electron'

/** Tells the Developer, from the desktop, that a Claude session needs them, and takes them back to it. */
export class NeedsYouNotifier {
  // A notification that gets garbage-collected loses its click handler, so the latest one per tab stays here.
  private readonly shown = new Map<string, Notification>()

  constructor(
    private readonly win: BrowserWindow,
    private readonly folderName: () => string,
    private readonly focusTab: (tabId: string) => void,
  ) {}

  notify(tabId: string, tabTitle: string): void {
    if (this.win.isFocused() || !Notification.isSupported()) return
    const notification = new Notification({
      title: `Needs you: ${tabTitle}`,
      body: `Claude Code is waiting for your answer in ${this.folderName()}.`,
    })
    notification.on('click', () => {
      if (this.win.isMinimized()) this.win.restore()
      this.win.show()
      this.win.focus()
      this.focusTab(tabId)
    })
    this.shown.get(tabId)?.close()
    this.shown.set(tabId, notification)
    notification.show()
  }
}
