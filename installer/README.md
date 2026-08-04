# Iolite Windows Installer

The installer is a self-contained Windows x64 executable with a persistent progress/result window. It contains a pinned, compatibility-tested Iolite and Vencord runtime for standard installations, and can integrate Iolite into an active source-built Vencord checkout without replacing its other user plugins.

## User commands

- Double-click or `IoliteSetup.exe --install`: install in managed or detected source-integration mode.
- `IoliteSetup.exe --repair`: repair or update the detected installation mode.
- `IoliteSetup.exe --uninstall`: remove the managed runtime or installer-managed source integration.
- `IoliteSetup.exe --version`: display the packaged Iolite version.
- `IoliteSetup.exe --extract-only <empty-folder>`: verify and extract the payload without modifying Discord. This is intended for testing.

The managed runtime is installed under `%LOCALAPPDATA%\Iolite\Vencord`. Up to three settings backups are kept under `%LOCALAPPDATA%\Iolite\SettingsBackups`, and source-build rollback copies are kept under `%LOCALAPPDATA%\Iolite\SourceBackups`. The live Vencord settings under `%APPDATA%\Vencord` are not intentionally removed during installation, repair, updates, or uninstall.

When an active source-built loader is detected, the installer uses the existing checkout instead of replacing it. It requires Node.js 22+ and pnpm, adds or updates only an installer-managed `src\userplugins\iolite` directory, validates and rebuilds all user plugins together, and restores the previous `dist` if any step fails. An independently managed Iolite checkout with different source is never overwritten.

## Release model

`VERSION` identifies the Iolite release. `VENCORD_REF` and `VENCORD_INSTALLER_VERSION` pin the exact upstream components. The release workflow:

1. checks out the pinned Vencord revision;
2. adds Iolite as a user plugin;
3. lints, type-checks, and builds with Vencord's updater disabled;
4. embeds the runtime and official Vencord installer CLI into a Native AOT executable;
5. tests payload extraction, source-loader detection, sibling-plugin preservation, pnpm invocation, and the progress window;
6. publishes checksums and exact corresponding-source archives with a version tag.

The custom build deliberately disables Vencord's normal updater. Updates are complete Iolite releases so that the Iolite and Vencord versions are tested together. Users update by downloading and rerunning the newer installer.

## Limitations

- Version 1 supports Windows x64 Discord Desktop.
- The executable is currently unsigned, so Windows SmartScreen may show an unknown-publisher warning.
- Automatic source integration requires Node.js 22 or newer and pnpm in the current user's PATH.
- Vesktop and non-Windows source integrations should use the manual installation described in `INSTALL.md`.
