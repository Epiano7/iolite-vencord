# Iolite Windows Installer

The installer is a self-contained Windows x64 executable containing a pinned, compatibility-tested Iolite and Vencord runtime. Users do not need Git, Node.js, pnpm, or a Vencord source checkout.

## User commands

- Double-click or `IoliteSetup.exe --install`: install the managed build.
- `IoliteSetup.exe --repair`: reinstall the managed build.
- `IoliteSetup.exe --uninstall`: unpatch Discord and remove the managed runtime.
- `IoliteSetup.exe --version`: display the packaged Iolite version.
- `IoliteSetup.exe --extract-only <empty-folder>`: verify and extract the payload without modifying Discord. This is intended for testing.

The managed runtime is installed under `%LOCALAPPDATA%\Iolite\Vencord`. Up to three settings backups are kept under `%LOCALAPPDATA%\Iolite\SettingsBackups`. The live Vencord settings under `%APPDATA%\Vencord` are not intentionally removed during installation, repair, updates, or uninstall.

## Release model

`VERSION` identifies the Iolite release. `VENCORD_REF` and `VENCORD_INSTALLER_VERSION` pin the exact upstream components. The release workflow:

1. checks out the pinned Vencord revision;
2. adds Iolite as a user plugin;
3. lints, type-checks, and builds with Vencord's updater disabled;
4. embeds the runtime and official Vencord installer CLI into a Native AOT executable;
5. tests the executable using `--extract-only`;
6. publishes checksums and exact corresponding-source archives with a version tag.

The custom build deliberately disables Vencord's normal updater. Updates are complete Iolite releases so that the Iolite and Vencord versions are tested together. Users update by downloading and rerunning the newer installer.

## Limitations

- Version 1 supports Windows x64 Discord Desktop.
- The executable is currently unsigned, so Windows SmartScreen may show an unknown-publisher warning.
- Other source-only custom plugins are not compiled into the managed build. Those users should keep the manual source installation described in `INSTALL.md`.
- The repository and its Releases are private. A user needs GitHub repository access to download an installer update.
