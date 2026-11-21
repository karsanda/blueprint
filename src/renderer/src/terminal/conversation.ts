import type { DockviewApi } from 'dockview-react'
import { isClaudeTab } from '../workspace/sessions'

/**
 * Keeps each Claude tab's conversation as a panel parameter, so the layout save writes it.
 * Main pushes it after every start (null for a new conversation) and when a session first
 * shows its transcript; a tab that is gone, or is not Claude's, is ignored.
 */
export function installConversationSaving(api: DockviewApi): () => void {
  return window.blueprint.onConversation((tabId, conversation) => {
    if (!isClaudeTab(tabId)) return
    // dockview deletes a parameter set to undefined.
    api.getPanel(tabId)?.api.updateParameters({ conversation: conversation ?? undefined })
  })
}
