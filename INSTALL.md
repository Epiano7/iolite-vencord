# Installing Iolite

Iolite is a custom Vencord plugin. It is not included with standard Vencord. The Windows installer supports both standard Vencord and existing source-built installations; manual source instructions are also provided.

## Recommended Windows installation

For Windows x64 Discord Desktop users:

1. Open the public [Iolite Releases page](https://github.com/Epiano7/iolite-vencord/releases).
2. Download the newest `IoliteSetup-v...-win-x64.exe` and its `.sha256` file.
3. Fully close Discord from the system tray.
4. Run the installer, select **Install**, and leave its progress window open until it reports completion.
5. Open **Discord Settings → Vencord → Plugins**, search for **Iolite**, and enable it.

The installer selects a safe mode automatically:

| Existing installation | Installer behavior |
| --- | --- |
| No Vencord or standard/prebuilt Vencord | Installs the pinned, compatibility-tested runtime under `%LOCALAPPDATA%\Iolite\Vencord`. No development tools are required. |
| Active source-built Vencord | Adds Iolite under that checkout's `src\userplugins`, preserves every sibling user plugin, backs up the old compiled `dist`, rebuilds everything together, and keeps the same checkout active. Node.js 22+ and pnpm must be available. |
| Independently managed Iolite checkout with different local source | Stops before overwriting anything and directs the user to update manually. |

Source-build rollback copies are stored under `%LOCALAPPDATA%\Iolite\SourceBackups`. If dependency installation, validation, compilation, or injection fails, the previous compiled `dist` and prior Iolite files are restored.

> [!WARNING]
> The v0.3.1 installer was withdrawn because it could replace an active source-built runtime and make its other custom plugins disappear from Discord. Use v0.3.2 or newer.

The executable is currently unsigned, so Windows SmartScreen may identify it as coming from an unknown publisher. Confirm that its SHA-256 hash matches the release's `.sha256` file before running it.

### Updating an installation

When a new Iolite release is available, download and run its newer installer. Managed installations replace the pinned runtime as one tested unit. Installer-managed source integrations update only Iolite's files and rebuild the existing checkout with its other plugins. Independently Git-managed Iolite checkouts should be updated with `git pull` and rebuilt manually.

### Repairing or uninstalling

Run the installer from PowerShell or Command Prompt with one of these options:

```powershell
.\IoliteSetup-v0.3.3-win-x64.exe --repair
.\IoliteSetup-v0.3.3-win-x64.exe --uninstall
```

For a managed installation, uninstalling removes the managed runtime. For an installer-managed source integration, it moves Iolite into a rollback backup and rebuilds the same checkout with every other user plugin still present. Vencord settings and backups are kept in both modes.

The manual source instructions below remain useful for Vesktop, non-Windows systems, locally modified Iolite checkouts, or source environments without the required toolchain.

## Before you begin

You need:

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 22 or newer
- [pnpm](https://pnpm.io/installation)
- Discord Desktop or Vesktop on Windows, macOS, or Linux

The commands below use PowerShell on Windows. On macOS or Linux, use `/` in paths instead of `\`.

## Does Iolite appear in Vencord's Plugin Browser?

Not as a plugin that a standard Vencord user can discover and install. Vencord's normal build only contains plugins bundled with Vencord.

After Iolite is added to the source and the custom build is installed, **Iolite will appear in Settings → Vencord → Plugins** on that installation. At that point it can be enabled and configured like the bundled plugins. Its presence there means it was compiled into that local build; it is not a public Plugin Browser listing.

## Choose your starting point

| Your current setup | Follow |
| --- | --- |
| You do not have Vencord | [A. New Vencord installation](#a-new-vencord-installation) |
| You use normal/prebuilt Vencord | [B. Move from prebuilt to a custom build](#b-move-from-prebuilt-to-a-custom-build) |
| You already compile Vencord or use other custom plugins | [C. Add Iolite to an existing source checkout](#c-add-iolite-to-an-existing-source-checkout) |
| You use Vesktop | Follow A, B, or C, then use the [Vesktop step](#vesktop) instead of `pnpm inject` |

## A. New Vencord installation

1. Clone Vencord and Iolite:

   ```powershell
   git clone https://github.com/Vendicated/Vencord.git
   cd Vencord
   New-Item -ItemType Directory -Force -Path src\userplugins
   cd src\userplugins
   git clone https://github.com/Epiano7/iolite-vencord.git iolite
   cd ..\..
   ```

2. Build Vencord and install it into Discord:

   ```powershell
   pnpm install --frozen-lockfile
   pnpm build
   pnpm inject
   ```

3. Follow the installer prompts, fully restart Discord, and complete [Enable and verify Iolite](#enable-and-verify-iolite).

## B. Move from prebuilt to a custom build

Your Vencord settings are normally kept separately from its compiled code, so moving to a source build should preserve your existing plugin settings. Back them up first in case your installation differs.

1. Fully close Discord. On Windows, back up the usual Vencord settings folder:

   ```powershell
   $backup = Join-Path $env:APPDATA ("Vencord-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
   Copy-Item -LiteralPath (Join-Path $env:APPDATA "Vencord") -Destination $backup -Recurse
   ```

   Do not upload this backup. It can contain personal settings and server IDs.

2. Clone the source and add Iolite:

   ```powershell
   git clone https://github.com/Vendicated/Vencord.git
   cd Vencord
   New-Item -ItemType Directory -Force -Path src\userplugins
   cd src\userplugins
   git clone https://github.com/Epiano7/iolite-vencord.git iolite
   cd ..\..
   ```

3. Build and inject the custom copy over the normal Vencord installation:

   ```powershell
   pnpm install --frozen-lockfile
   pnpm build
   pnpm inject
   ```

4. Follow the installer prompts, fully restart Discord, and complete [Enable and verify Iolite](#enable-and-verify-iolite).

## C. Add Iolite to an existing source checkout

These steps preserve any other user plugins already under `src\userplugins`.

1. Open PowerShell in the root of your existing Vencord checkout and update it:

   ```powershell
   git pull --ff-only
   New-Item -ItemType Directory -Force -Path src\userplugins
   cd src\userplugins
   ```

2. Clone Iolite alongside your other custom plugins:

   ```powershell
   git clone https://github.com/Epiano7/iolite-vencord.git iolite
   cd ..\..
   ```

3. Rebuild and reinject Vencord:

   ```powershell
   pnpm install --frozen-lockfile
   pnpm build
   pnpm inject
   ```

4. Fully restart Discord and complete [Enable and verify Iolite](#enable-and-verify-iolite).

## Vesktop

Run `pnpm install --frozen-lockfile` and `pnpm build`, but do not run `pnpm inject`. In Vesktop settings, set **Vencord Location** to the `dist` folder inside your Vencord source checkout, then restart Vesktop.

## Enable and verify Iolite

1. Open **Discord Settings → Vencord → Plugins**.
2. Search for **Iolite**.
3. Enable it and restart Discord if prompted.
4. Right-click a server member. The menu should include rows such as **Iolite - Warn** and **Iolite - Mute**.

## Updating

Update both repositories, then rebuild and reinject:

```powershell
cd path\to\Vencord
git pull --ff-only

cd src\userplugins\iolite
git pull --ff-only

cd ..\..\..
pnpm install --frozen-lockfile
pnpm build
pnpm inject
```

Restart Discord afterward. For Vesktop, rebuild and restart Vesktop instead of running `pnpm inject`.

## Uninstalling or returning to normal Vencord

To remove only Iolite:

1. Disable Iolite in Vencord settings.
2. Remove the `Vencord\src\userplugins\iolite` folder.
3. Run `pnpm build` and `pnpm inject` again, then restart Discord.

To return entirely to prebuilt Vencord, use the official Vencord installer to install the normal build. Existing settings should normally remain, but keep your backup until you have confirmed everything works.

## Troubleshooting

### Iolite is missing from the Plugins page

- Confirm the file exists at `Vencord\src\userplugins\iolite\index.tsx`.
- Make sure you ran the build from the Vencord root, not from the Iolite folder.
- Rebuild, reinject, and fully restart Discord.
- Seeing no public install button for Iolite in a standard Vencord build is expected.

### Git cannot download Iolite

Confirm that `https://github.com/Epiano7/iolite-vencord` opens in a browser, then retry the `git clone` command. A GitHub account is not required for a public clone.

### The build reports missing packages

From the Vencord root, run:

```powershell
pnpm install --frozen-lockfile
pnpm build
```

Use pnpm for the Vencord checkout rather than npm or Yarn.
