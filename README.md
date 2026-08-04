# Iolite

Iolite is a QoL [Vencord](https://vencord.dev) plugin for [Sapphire](https://sapph.xyz) commands. It adds user-context-menu composers for common moderation commands without opening a screen-blocking modal.

> [!IMPORTANT]
> Iolite is a private user plugin. It requires building Vencord from source and is not part of Vencord's approved built-in plugin collection. Client modifications are against Discord's Terms of Service; use them at your own discretion.

## Features

- Warn, mute, kick, ban, and view warnings from a user's context menu.
- Enter a reason and optional duration inside the context submenu.
- Preview the exact command before sending it.
- Send to the current channel or a configured private moderation channel.
- Store a different Sapphire prefix for each server.
- Add Sapphire's `-r` punishment-review flag.

## Supported Sapphire commands

Iolite follows Sapphire's [official moderation command reference](https://docs.sapph.xyz/#/moderation?id=commands-overview):

```text
ban [user] [duration] [reason] [-r]
kick [user] [reason] [-r]
mute [user] [duration] [reason] [-r]
warn [user] [duration] [reason] [-r]
warns [user]
```

Sapphire supports server-defined prefixes. Iolite defaults to `?`, and the prefix can be changed separately for each server from its context menu.

## Requirements

- Windows, macOS, or Linux desktop Discord supported by Vencord
- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 22 or newer
- [pnpm](https://pnpm.io/installation)
- A Vencord source checkout

## Installation

### 1. Back up existing Vencord settings

Your approved-plugin settings are separate from the compiled build. On Windows they are normally in `%APPDATA%\Vencord`.

```powershell
$backup = Join-Path $env:APPDATA ("Vencord-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
Copy-Item -LiteralPath (Join-Path $env:APPDATA "Vencord") -Destination $backup -Recurse
```

Do not commit this backup: it can contain server IDs and personal settings.

### 2. Obtain Vencord source

```powershell
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
```

If you already have a Vencord source checkout, update it instead:

```powershell
git pull --ff-only
```

### 3. Clone Iolite as a user plugin

Because this repository is private, authenticate GitHub CLI first.

```powershell
cd src\userplugins
gh repo clone Epiano7/iolite-vencord iolite
cd ..\..
```

The final path should be `Vencord\src\userplugins\iolite\index.tsx`.

### 4. Build and inject Vencord

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm inject
```

Restart Discord. Open **Settings → Vencord → Plugins**, search for **Iolite**, enable it, and restart Discord once more if prompted.

## Configuration

Right-click a member inside a server and open **Iolite · Sapphire Actions → Configure this server**.

- **Prefix for this server:** Enter `?`, `!`, `s!`, or that server's configured Sapphire prefix.
- **Private moderation channel ID:** Enable Discord Developer Mode, right-click the private channel, and select **Copy Channel ID**.
- **Default private destination:** Enable **Default To Private Channel** in Iolite's normal Vencord plugin settings, then enter the destination in **Default Private Channel ID**.

Iolite verifies that the configured private destination belongs to the current server. A server-specific channel ID set from the context menu overrides the default channel ID.

## Updating

Update both Vencord and Iolite before rebuilding:

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

Restart Discord after reinjecting. Updating or reinjecting does not normally erase `%APPDATA%\Vencord\settings.json`, so approved-plugin settings should remain intact. Keep a recent backup before major updates.

## Uninstalling Iolite

1. Disable Iolite in Vencord settings.
2. Remove `Vencord\src\userplugins\iolite` from the source checkout.
3. Run `pnpm build` and `pnpm inject` again.

To return entirely to prebuilt Vencord, run the official Vencord installer and choose the normal install option. Your settings should remain in `%APPDATA%\Vencord`.

## Compatibility monitoring

The repository's scheduled GitHub Actions workflow checks Iolite against the latest Vencord source every Monday and can also be run manually. A failed check means the plugin may need an update; it does not automatically change or publish plugin code.

## Development checks

Place this repository at `Vencord/src/userplugins/iolite`, then run from the Vencord root:

```powershell
pnpm exec eslint src/userplugins/iolite/index.tsx
pnpm testTsc
pnpm build
```

## License

Iolite is licensed under GPL-3.0-or-later. See [LICENSE](LICENSE).
