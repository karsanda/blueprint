# Blueprint

A desktop app that puts Claude Code, terminals and a review of what Claude changed in one window, in a drafting-table look.

- Use cases first, in the Use-Case 3.0 format: [use cases](entries/usecase/index.md), [actors](entries/actors/index.md), [System](entries/system/blueprint.md).
- Concepts: [doc/guides.md](doc/guides.md). Entry template: [doc/template.md](doc/template.md).
- Agent guide: [AGENTS.md](AGENTS.md).

## Install and run

Blueprint needs [Claude Code](https://docs.anthropic.com/en/docs/claude-code), installed and signed in. Download the package for your system from the [releases](https://github.com/karsanda/blueprint/releases).

- **Ubuntu** (amd64):
  - `sudo apt install ./blueprint_<version>_amd64.deb`
  - if apt ends with "Download is performed unsandboxed as root", the install still worked. apt's own user can't read your home folder, so apt read the file as root.
  - then `blueprint ~/path/to/project`, or open Blueprint from the app menu and pick a folder.
- **macOS** (Apple Silicon):
  - open the `.dmg` and drag Blueprint into Applications;
  - it is not signed with a Developer ID, so allow its first open in System Settings › Privacy & Security;
  - for the `blueprint` command, link it once into a folder on your `PATH`, for example `mkdir -p ~/.local/bin && ln -s /Applications/Blueprint.app/Contents/Resources/bin/blueprint ~/.local/bin/blueprint` (a stock Mac has no `~/.local/bin` on its `PATH`: add it in `~/.zprofile`, or link into `/usr/local/bin` with `sudo`).

`blueprint <folder>` gives the prompt back at once, and each Folder opens in its own window. The keys are in the [release notes](doc/releases/v0.1.1.md#keys).

From source: `pnpm install`, then `pnpm dev -- <folder>`. `pnpm package:linux` and `pnpm package:mac` build the packages into `dist/`.

## License

[MIT](LICENSE).

The use case template, the `usecase` and `actor` skills and the link-check script are adapted from Vidio's `vidio-usecase` repository.
