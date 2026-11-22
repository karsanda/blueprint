import { Menu } from '@base-ui/react/menu'
import { ChevronDown } from 'lucide-react'
import { applyPreset, PRESETS } from './presets'
import { useWorkspaceApi } from './workspaceApi'

/** The Layout menu at the right end of the top bar: each preset with its key. */
export function LayoutMenu() {
  const api = useWorkspaceApi((s) => s.api)
  if (!api) return null
  return (
    <Menu.Root>
      <Menu.Trigger className="ml-auto flex items-center gap-1 self-center border border-bp-line-faint px-2 py-0.5 text-[11px] font-semibold tracking-[0.12em] text-bp-muted uppercase hover:text-bp-ink">
        Layout
        <ChevronDown size={12} strokeWidth={1.75} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4}>
          {/* The preset puts the keyboard where it belongs; the menu must not take it back to its button. */}
          <Menu.Popup
            finalFocus={false}
            className="min-w-56 border border-bp-line bg-bp-sheet py-1 text-xs text-bp-ink shadow-lg outline-none"
          >
            {PRESETS.map((preset) => (
              <Menu.Item
                key={preset.id}
                className="flex cursor-default items-center gap-6 px-3 py-1.5 outline-none select-none data-[highlighted]:bg-bp-line-soft"
                onClick={() => applyPreset(api, preset.id)}
              >
                <span className="flex-1">{preset.label}</span>
                <span className="font-mono text-[11px] text-bp-muted">{preset.key}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
