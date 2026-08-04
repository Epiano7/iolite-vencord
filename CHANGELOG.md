# Changelog

All notable changes to Iolite will be documented here.

## 0.2.0 - 2026-08-04

- Moved Warn, Mute, Kick, Ban, and View Warns directly into the native user context menu.
- Added an option to replace Start a Call and Add Note with Iolite's fast actions.
- Replaced punishment submenus with a non-blocking floating editor.
- Added persistent on-screen Sapphire responses for background warning lookups.
- Rendered background warning responses using Sapphire's original Discord embed.
- Normalized raw gateway embeds for Discord's renderer and added feedback when no Sapphire reply is detected.
- Added an `Iolite -` marker to every plugin-owned user-menu row.
- Added three configurable profile-targeted keyboard presets.

## 0.1.1 - 2026-08-04

- Fixed a context-menu validation error that crashed Discord when right-clicking a user.
- Rebuilt every Iolite menu level using Discord's native items, groups, and controls.
- Matched the Vencord plugin description to the GitHub repository description.
- Made the author avatar and profile resolve to the currently logged-in Discord account.
- Added a default private-channel ID setting that becomes available with private-channel sending.

## 0.1.0 - 2026-08-04

- Added warn, mute, kick, ban, and view-warns actions.
- Added compact reason and duration controls inside user context menus.
- Added command previews and Sapphire's `-r` review option.
- Added per-server prefix and private-channel settings.
- Added scheduled compatibility testing against current Vencord.
