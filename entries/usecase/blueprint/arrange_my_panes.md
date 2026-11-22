---
type: Usecase
title: Arrange my panes
labels: [workspace]
System: Blueprint
Primary Actor: Developer
Supporting Actors: none
status: draft
---

The Developer shapes the window to the task at hand and finds it the same way next time.

## Basic Flow

1. System shows the Folder in the default layout.
2. Developer drags the gap between two panes to resize them.
3. Developer drags a tab onto the middle of another pane to stack it there.
4. Developer drags a tab onto the edge of a pane to split that pane.
5. Developer switches between the tabs in a pane.
6. Developer closes Blueprint.
7. System restores the same layout when the Developer reopens the Folder.

## Alternative Flow 1: Pick a preset layout

At any step, Developer chooses a preset, such as Agent and review. System rearranges the panes to match.

## Alternative Flow 2: Zoom one pane

At any step, Developer zooms a pane. It fills the window until the Developer zooms out again.

## Alternative Flow 3: Use the keyboard

At steps 2 to 5, Developer uses keys instead of the mouse to move focus, move tabs and switch tabs.

## Alternative Flow 4: Float or pop out a tab

At step 4, Developer floats the tab above the layout, or opens it in its own window.

## Slice 1: Tabs, splits and resizing

Covers: Basic Flow steps 1 to 5, Alternative Flow 2.

Work items:

- [x] Tiled panes with tabs, in the Blueprint look ([#1](https://github.com/karsanda/blueprint/issues/1))
- [x] Resize by dragging the gap between panes ([#1](https://github.com/karsanda/blueprint/issues/1))
- [x] Drag a tab to stack it or to split a pane ([#1](https://github.com/karsanda/blueprint/issues/1))
- [x] Zoom a pane in and out ([#1](https://github.com/karsanda/blueprint/issues/1))

Test cases:

- Given two panes, when the Developer drags the gap, then both panes resize and their content fits.
- Given a tab, when the Developer drops it on the middle of another pane, then it joins that pane's tabs.
- Given a tab, when the Developer drops it on a pane's edge, then that pane splits on that side.
- Given a zoomed pane, when the Developer zooms out, then the previous layout returns.

## Slice 2: Remember the layout

Covers: Basic Flow steps 6 and 7.

Work items:

- [x] Save the layout of each Folder as it changes ([#7](https://github.com/karsanda/blueprint/issues/7))
- [x] Restore the layout and the window's size and place when the Folder opens again ([#7](https://github.com/karsanda/blueprint/issues/7))

Test cases:

- Given a changed layout, when the Developer reopens the Folder, then the layout is the same.

## Slice 3: Presets, keys and floating

Covers: Alternative Flow 1, Alternative Flow 3, Alternative Flow 4.

Work items:

- [x] Pick a preset from the top bar or with a key ([#14](https://github.com/karsanda/blueprint/issues/14))
- [x] Move focus, move and switch tabs, open tabs and zoom with keys ([#14](https://github.com/karsanda/blueprint/issues/14))
- [x] Float a pane, or pop it out into its own window ([#14](https://github.com/karsanda/blueprint/issues/14))

Test cases:

- Given any layout, when the Developer picks the Agent and review preset, then the panes match that preset.

## Resources

- Notes: [Workspace](../../domain/workspace/notes.md)
