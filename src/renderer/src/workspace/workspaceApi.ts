import type { DockviewApi } from 'dockview-react'
import { create } from 'zustand'

/** The dock's api, for parts of the window outside the dock, such as the Layout menu in the top bar. */
export const useWorkspaceApi = create<{ api: DockviewApi | null }>(() => ({ api: null }))
