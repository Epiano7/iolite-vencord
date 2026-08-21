# Changelog

All notable changes to Iolite will be documented here.

## Unreleased

## 0.7.1 - 2026-08-20

- Fixed punishment presets being unreachable because Discord menu items discard custom right-click handlers.
- Punishments with matching presets now use a native Discord submenu containing a Custom action and preset names; punishments without presets retain their direct full-editor action.
- Updated Sapphire embed formatting for its newer warning-list output, including links and inline case IDs nested inside bold Markdown, escaped or invisibly separated syntax, and compact Discord message links.

## 0.7.0 - 2026-08-13

- Added a persistent chat-bar hammer for Moderation Mode. Its focused member menu keeps Iolite actions and Open in Mod View while hiding unrelated Discord and third-party rows.
- Replaced the three fixed preset blocks with a visual preset manager supporting unlimited named presets, ordering, punishment type, reason, duration, destination, review flag, and keyboard shortcut.
- Right-clicking an Iolite punishment row now opens its matching preset names for immediate execution while normal clicking still opens the full punishment panel.
- Added persistent all-server and per-server Iolite moderation statistics for successful warns, mutes, kicks, and bans.
- Added a share-card generator that exports the selected moderation statistics as a 1200×630 PNG.
- Fixed menu-editor drags appearing active but not moving an action when Discord swallowed the native drop event, and added reliable move, show, and hide buttons.
- Confirmed all Iolite configuration is stored in Vencord's persistent settings file, including menu layouts, presets, statistics, colors, and timeout preferences.
- Standardized lookup panels on a 60-second default, migrated the former five-second default, and retained the never-close option.
- Added Smart, Relative, and Exact Recent Messages timestamps, including Discord's 12/24-hour preference.
- Recent Messages now renders Discord mentions, channel links, link embeds, and image/file attachments.
- Sapphire lookups now render Discord timestamps, Markdown links, block quotes, mentions, channels, roles, custom emoji, and server context more faithfully.
- Made quick panels wider and more responsive, with adaptive type sizes, tighter short embeds, and improved narrow-window field layout.
- Updated the Windows installer, source-build integration, rollback handling, and CI checks to package the new preset and statistics components without affecting sibling user plugins.

## 0.6.0 - 2026-08-13

- Added configurable User Info and Cases lookups alongside View Warns.
- Added optional Iolite actions to message context menus.
- Added a visual drag-and-drop editor for independently reordering or hiding profile and message context-menu actions.
- Added a Recent Messages action with server/channel scopes, pagination, and jump-to-message controls in the bottom-right panel.
- Unified lookup response handling in Iolite's isolated panel and now renders every Sapphire embed in a response.
- Added a configurable lookup-panel countdown that truly pauses on hover, keyboard focus, Discord blur, and window hiding.
- Improved response matching with message timing and target-mention checks.
- Credited Eoka for feature prototypes and design contributions.

## 0.5.1 - 2026-08-05

- Updated the Windows installer to follow the system light or dark app theme automatically.
- Added modern Windows common-control styling, Segoe UI typography, improved spacing, and a larger progress-details area.
- Release pages now show the current version's actual changelog entries instead of generic generated notes.
- Corrected the installer's embedded executable version metadata.

## 0.5.0 - 2026-08-05

- Detects Sapphire's recent-punishment confirmation response and mirrors its real action buttons in Iolite's bottom-right panel.
- Sends the original Discord component interaction instead of repeating the punishment command, with one-click lockout and an original-message fallback.
- Added a setting to disable relayed Sapphire confirmations.
- Fixed commands sent to an unopened private moderation channel waiting indefinitely for Discord to load that channel.

## 0.4.0 - 2026-08-05

- Prevented quick-panel typing from leaking into Discord's channel message composer.
- Remembers the eight most recent successful ban and mute reasons separately, exposes them in the matching popup, and provides a clear-history setting.
- Added names to the three existing presets and shows matching presets as fast buttons in ban, mute, warn, and kick popups.
- Added optional solid `#RRGGBB` or two-color diagonal-gradient quick-panel backgrounds with automatic light/dark foreground selection.

## 0.3.5 - 2026-08-04

- Fixed a second **Patching Discord** delay caused by redirected pipe completion arriving long after the patcher process exited.
- Redirects patcher output directly to a temporary log file, eliminating asynchronous pipe waits while retaining error details.

## 0.3.4 - 2026-08-04

- Fixed the installer hanging at **Patching Discord** after the official Vencord CLI had already patched successfully.
- Continuously drains the hidden patcher's output and errors so it can exit normally.
- Adds a 60-second patch timeout with child-process cleanup, rollback, and visible error details.

## 0.3.3 - 2026-08-04

- Isolated the quick moderation panel from custom theme and global CSS overrides.
- Added opaque Discord-like dark and light palettes so server content cannot show through the form.
- Raised the panel above other client layers and locally styled its inputs, buttons, checkbox, and text.

## 0.3.2 - 2026-08-04

- Replaced transient confirmation boxes with a persistent installer window showing progress, errors, and an explicit completion screen.
- Added automatic source-build integration that compiles Iolite beside existing user plugins instead of replacing their active runtime.
- Added rollback backups for the previous source-built `dist` and installer-managed Iolite files.
- Added path-bound cleanup guards and automated tests proving sibling user plugins remain unchanged.
- Withdrew the v0.3.1 Windows installer after its managed runtime could hide other source-only plugins from Discord.

## 0.3.1 - 2026-08-04

- Prepared the repository, documentation, and installer messaging for public access.
- Replaced private-repository installation steps with public clone and download instructions.
- Added preventative ignore rules for environment files and common private-key formats.

## 0.3.0 - 2026-08-04

- Added a self-contained Windows x64 installer for pinned, tested Iolite/Vencord releases.
- Added settings backups, managed-runtime rollback, repair, uninstall, and payload integrity checks.
- Added an automated release workflow with executable checksums and exact corresponding-source archives.
- Replaced Discord's crash-prone private embed renderer with Iolite's safe Discord-styled Sapphire embed card.
- Added a complete installation guide and clarified how Iolite appears in Vencord's plugin list.
- Updated GitHub Actions dependencies to their current Node.js 24-based releases.

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
