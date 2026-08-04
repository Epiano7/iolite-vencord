# Iolite

**Pronounced:** “EYE-uh-lite”

Iolite is a QoL [Vencord](https://vencord.dev) plugin for [Sapphire](https://sapph.xyz) commands. It provides fast moderation actions without opening a screen-blocking modal.

> [!IMPORTANT]
> Iolite is a custom user plugin. It is not part of Vencord's approved built-in plugin collection. Manual installations require building Vencord from source, while the Windows release includes a pinned prebuilt Vencord runtime. Client modifications are against Discord's Terms of Service; use them at your own discretion.

## Features

- Use clearly labeled **Iolite - Warn**, **Iolite - Mute**, **Iolite - Kick**, **Iolite - Ban**, and **Iolite - View Warns** rows directly from a user's context menu—no Iolite dropdown.
- Optionally replace **Start a Call** and **Add Note** with the fast moderation rows.
- Enter a reason and optional duration in a small floating editor while the rest of Discord stays usable.
- Send to the current channel or a configured private moderation channel.
- Show Sapphire's original warnings embed as a persistent in-app card when the command runs elsewhere.
- Configure three keyboard presets with an action, duration, reason, destination, and shortcut. Presets only work while a user's profile is open.
- Store a different Sapphire prefix for each server.
- Add Sapphire's `-r` punishment-review flag.

## Screenshots

| Fast actions | Background warning lookup |
| --- | --- |
| <img src="docs/images/action-menu.png" alt="Iolite actions in Discord's user context menu" width="242"> | <img src="docs/images/warning-card-susbusamogus.png" alt="Iolite displaying Sapphire's warning response on screen" width="416"> |
| Plugin settings | Keyboard preset settings |
| <img src="docs/images/plugin-settings-redacted.png" alt="Iolite's Vencord plugin settings" width="620"> | <img src="docs/images/shortcut-settings.png" alt="Iolite's configurable profile shortcut settings" width="620"> |

The screenshots redact private identifiers and avatars. `susbusamogus` is a consented demo account.

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

## Plugin Browser and installation

Iolite does not appear as a discoverable plugin in a standard Vencord installation. After the Windows installer or a manual source build adds it, Iolite appears in **Settings → Vencord → Plugins** and can be enabled normally.

The [full installation guide](INSTALL.md) covers:

- installing the Windows release into standard or source-built Vencord;
- installing Vencord and Iolite from scratch;
- moving from normal/prebuilt Vencord without intentionally losing existing plugin settings;
- adding Iolite alongside other custom plugins;
- Vesktop, updates, removal, and troubleshooting.

For most Windows users, the recommended route is the latest `IoliteSetup-...exe` from the public [Releases page](https://github.com/Epiano7/iolite-vencord/releases). It uses a managed runtime for standard Vencord, or detects an active source build and compiles Iolite beside its existing user plugins. Source integration requires Node.js and pnpm; the manual guide remains available when the automatic source path cannot be used.

## Configuration

Right-click a member inside a server and open **Iolite - Server Settings**.

- **Prefix for this server:** Enter `?`, `!`, `s!`, or that server's configured Sapphire prefix.
- **Private moderation channel ID:** Enable Discord Developer Mode, right-click the private channel, and select **Copy Channel ID**.
- **Default private destination:** Enable **Default To Private Channel** in Iolite's normal Vencord plugin settings, then enter the destination in **Default Private Channel ID**.

Iolite verifies that the configured private destination belongs to the current server. A server-specific channel ID set from the context menu overrides the default channel ID.

### Keyboard presets

Open Iolite's normal Vencord settings and configure **Preset 1**, **Preset 2**, or **Preset 3**. A shortcut can be a single key such as `1` or a combination such as `Ctrl+1`.

Left-click a member to open their profile, then press the configured shortcut. Iolite ignores preset shortcuts while you are typing in chat, a reason field, or another text input. A private preset fails safely instead of sending publicly when its private channel is unavailable.

### Background warning lookups

When **Iolite - View Warns** sends to a channel other than the one currently open, Iolite waits for Sapphire's reply and renders Sapphire's original embed in a persistent on-screen card, including its title, description, fields, color, images, and footer. If a server uses a differently named Sapphire application, enter its bot user ID in **Sapphire Bot ID** for exact matching.

## Compatibility monitoring

The repository's scheduled GitHub Actions workflow checks Iolite against the latest Vencord source every Monday and can also be run manually. A failed check means the plugin may need an update; it does not automatically change or publish plugin code.

## Development checks

Place this repository at `Vencord/src/userplugins/iolite`, then run from the Vencord root:

```powershell
pnpm exec eslint src/userplugins/iolite/index.tsx src/userplugins/iolite/QuickPanel.tsx
pnpm testTsc
pnpm build
```

## License

Iolite is licensed under GPL-3.0-or-later. See [LICENSE](LICENSE).
