/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, Message, User } from "@vencord/discord-types";
import { findComponentLazy } from "@webpack";
import {
    ChannelStore,
    ContextMenuApi,
    createRoot,
    Menu,
    SelectedChannelStore,
    SelectedGuildStore,
    showToast,
    Toasts,
    useEffect,
    UserStore
} from "@webpack/common";
import type { ReactElement } from "react";
import type { Root } from "react-dom/client";

import { QuickCommand, QuickDestination, QuickPanel, QuickPanelResult } from "./QuickPanel";

type PunishmentCommand = "ban" | "kick" | "mute" | "warn";
type Destination = "current" | "private";

const COMMAND_OPTIONS = [
    { label: "Warn", value: "warn", default: true },
    { label: "Mute", value: "mute" },
    { label: "Kick", value: "kick" },
    { label: "Ban", value: "ban" }
] as const;

const DESTINATION_OPTIONS = [
    { label: "Current channel", value: "current", default: true },
    { label: "Private moderation channel", value: "private" }
] as const;

const NativeMessageEmbed = findComponentLazy<any>(module => module.prototype?.renderSuppressButton);

interface GuildConfig {
    prefix?: string;
    privateChannelId?: string;
}

interface UserContextProps {
    channel?: Channel;
    guildId?: string;
    user?: User;
}

const settings = definePluginSettings({
    defaultPrefix: {
        type: OptionType.STRING,
        description: "Prefix used in servers without a server-specific override",
        default: "?"
    },
    defaultToPrivateChannel: {
        type: OptionType.BOOLEAN,
        description: "Prefer the configured private moderation channel when one is available",
        default: false
    },
    defaultPrivateChannelId: {
        type: OptionType.STRING,
        description: "Channel ID used by default when private-channel sending is enabled",
        placeholder: "Right-click channel → Copy Channel ID",
        default: "",
        disabled: () => !settings.store.defaultToPrivateChannel
    },
    replaceUnusedActions: {
        type: OptionType.BOOLEAN,
        description: "Replace Start a Call and Add Note with Iolite's fast moderation actions",
        default: true
    },
    showWarnResponses: {
        type: OptionType.BOOLEAN,
        description: "Show Sapphire's response on screen when View Warns uses another channel",
        default: true
    },
    sapphireBotId: {
        type: OptionType.STRING,
        description: "Optional Sapphire bot ID for precise response matching (username matching is used when empty)",
        placeholder: "Optional bot user ID",
        default: ""
    },
    enableProfileShortcuts: {
        type: OptionType.BOOLEAN,
        description: "Enable preset shortcuts while a user's profile is open",
        default: true
    },
    preset1Shortcut: {
        type: OptionType.STRING,
        description: "Preset 1 shortcut, such as 1 or Ctrl+1",
        placeholder: "Ctrl+1",
        default: ""
    },
    preset1Command: {
        type: OptionType.SELECT,
        description: "Preset 1 action",
        options: COMMAND_OPTIONS
    },
    preset1Duration: {
        type: OptionType.STRING,
        description: "Preset 1 duration, when supported",
        placeholder: "e.g. 1h",
        default: ""
    },
    preset1Reason: {
        type: OptionType.STRING,
        description: "Preset 1 reason",
        placeholder: "Preset moderation reason",
        default: ""
    },
    preset1Destination: {
        type: OptionType.SELECT,
        description: "Preset 1 destination",
        options: DESTINATION_OPTIONS
    },
    preset2Shortcut: {
        type: OptionType.STRING,
        description: "Preset 2 shortcut, such as 2 or Ctrl+2",
        placeholder: "Ctrl+2",
        default: ""
    },
    preset2Command: {
        type: OptionType.SELECT,
        description: "Preset 2 action",
        options: [
            { label: "Warn", value: "warn" },
            { label: "Mute", value: "mute", default: true },
            { label: "Kick", value: "kick" },
            { label: "Ban", value: "ban" }
        ]
    },
    preset2Duration: {
        type: OptionType.STRING,
        description: "Preset 2 duration, when supported",
        placeholder: "e.g. 1h",
        default: ""
    },
    preset2Reason: {
        type: OptionType.STRING,
        description: "Preset 2 reason",
        placeholder: "Preset moderation reason",
        default: ""
    },
    preset2Destination: {
        type: OptionType.SELECT,
        description: "Preset 2 destination",
        options: DESTINATION_OPTIONS
    },
    preset3Shortcut: {
        type: OptionType.STRING,
        description: "Preset 3 shortcut, such as 3 or Ctrl+3",
        placeholder: "Ctrl+3",
        default: ""
    },
    preset3Command: {
        type: OptionType.SELECT,
        description: "Preset 3 action",
        options: [
            { label: "Warn", value: "warn" },
            { label: "Mute", value: "mute" },
            { label: "Kick", value: "kick" },
            { label: "Ban", value: "ban", default: true }
        ]
    },
    preset3Duration: {
        type: OptionType.STRING,
        description: "Preset 3 duration, when supported",
        placeholder: "e.g. 1h",
        default: ""
    },
    preset3Reason: {
        type: OptionType.STRING,
        description: "Preset 3 reason",
        placeholder: "Preset moderation reason",
        default: ""
    },
    preset3Destination: {
        type: OptionType.SELECT,
        description: "Preset 3 destination",
        options: DESTINATION_OPTIONS
    },
    guildConfigs: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, GuildConfig>
    }
});

function getGuildConfig(guildId: string): GuildConfig {
    return settings.store.guildConfigs[guildId] ?? {};
}

function updateGuildConfig(guildId: string, patch: Partial<GuildConfig>) {
    settings.store.guildConfigs = {
        ...settings.store.guildConfigs,
        [guildId]: {
            ...getGuildConfig(guildId),
            ...patch
        }
    };
}

function getPrefix(guildId: string): string {
    return getGuildConfig(guildId).prefix?.trim() || settings.store.defaultPrefix.trim() || "?";
}

function getCurrentChannelId(channel?: Channel): string | undefined {
    return channel?.id ?? SelectedChannelStore.getChannelId();
}

function getPrivateChannel(guildId: string): Channel | undefined {
    const id = getGuildConfig(guildId).privateChannelId?.trim()
        || settings.store.defaultPrivateChannelId.trim();
    if (!id) return;

    const channel = ChannelStore.getChannel(id);
    return channel?.guild_id === guildId ? channel : undefined;
}

function buildCommand(
    guildId: string,
    command: PunishmentCommand | "warns",
    userId: string,
    duration = "",
    reason = "",
    review = false
): string {
    const parts = [`${getPrefix(guildId)}${command}`, `<@${userId}>`];

    if (duration.trim()) parts.push(duration.trim());
    if (reason.trim()) parts.push(reason.trim());
    if (review && command !== "warns") parts.push("-r");

    return parts.join(" ");
}

async function submitCommand(channelId: string | undefined, command: string) {
    if (!channelId) {
        showToast("Iolite could not find a destination channel.", Toasts.Type.FAILURE);
        return false;
    }

    try {
        await sendMessage(channelId, { content: command });
        ContextMenuApi.closeContextMenu();
        showToast("Sapphire command sent.", Toasts.Type.SUCCESS);
        return true;
    } catch (error) {
        console.error("[Iolite] Failed to send command", error);
        showToast("Sapphire command failed to send.", Toasts.Type.FAILURE);
        return false;
    }
}

interface ActiveProfileTarget {
    guildId?: string;
    user: User;
}

interface PendingWarnLookup {
    channelId: string;
    expiresAt: number;
    user: User;
}

interface Preset {
    command: PunishmentCommand;
    destination: Destination;
    duration: string;
    reason: string;
    shortcut: string;
}

let activeProfileTarget: ActiveProfileTarget | null = null;
let pendingWarnLookup: PendingWarnLookup | null = null;
let warnLookupTimeout: number | null = null;
let quickPanelContainer: HTMLDivElement | null = null;
let quickPanelRoot: Root | null = null;

function closeQuickPanel() {
    quickPanelRoot?.unmount();
    quickPanelContainer?.remove();
    quickPanelRoot = null;
    quickPanelContainer = null;
}

function clearPendingWarnLookup() {
    pendingWarnLookup = null;
    if (warnLookupTimeout != null) window.clearTimeout(warnLookupTimeout);
    warnLookupTimeout = null;
}

function getDefaultDestination(guildId: string): Destination {
    return settings.store.defaultToPrivateChannel && getPrivateChannel(guildId)
        ? "private"
        : "current";
}

function getDestinationId(guildId: string, destination: Destination, channel?: Channel): string | undefined {
    return destination === "private"
        ? getPrivateChannel(guildId)?.id
        : getCurrentChannelId(channel);
}

function openQuickPanel(command: QuickCommand, user: User, guildId: string, channel?: Channel) {
    closeQuickPanel();
    ContextMenuApi.closeContextMenu();

    quickPanelContainer = document.createElement("div");
    quickPanelContainer.id = "vc-iolite-quick-panel";
    document.body.append(quickPanelContainer);
    quickPanelRoot = createRoot(quickPanelContainer);

    const defaultDestination = getDefaultDestination(guildId) as QuickDestination;
    quickPanelRoot.render(
        <QuickPanel
            command={command}
            defaultDestination={defaultDestination}
            hasPrivateChannel={Boolean(getPrivateChannel(guildId))}
            onClose={closeQuickPanel}
            user={user}
            onSubmit={(result: QuickPanelResult) => {
                const destinationId = getDestinationId(guildId, result.destination, channel);
                if (!destinationId) {
                    showToast("Iolite could not find that destination channel.", Toasts.Type.FAILURE);
                    return;
                }

                closeQuickPanel();
                void submitCommand(
                    destinationId,
                    buildCommand(guildId, command, user.id, result.duration, result.reason, result.review)
                );
            }}
        />
    );
}

function makeTextControl({ id, label, placeholder, value, onChange }: {
    id: string;
    label: string;
    placeholder: string;
    value: string;
    onChange(value: string): void;
}) {
    return (
        <Menu.MenuControlItem
            key={id}
            id={id}
            interactive
            label={label}
            control={(props, ref) => (
                <Menu.MenuSearchControl
                    {...props}
                    ref={ref}
                    query={value}
                    placeholder={placeholder}
                    onChange={onChange}
                />
            )}
        />
    );
}

function makeGuildConfigurationItems(guildId: string) {
    const config = getGuildConfig(guildId);
    let prefix = config.prefix ?? settings.store.defaultPrefix;
    let privateChannelId = config.privateChannelId ?? "";
    const configuredChannel = getPrivateChannel(guildId);

    return [
        makeTextControl({
            id: "vc-iolite-config-prefix",
            label: "Prefix for this server",
            placeholder: "e.g. ?, !, s!",
            value: prefix,
            onChange: value => {
                prefix = value;
                updateGuildConfig(guildId, { prefix: value });
            }
        }),
        makeTextControl({
            id: "vc-iolite-config-channel",
            label: "Private moderation channel ID",
            placeholder: "Right-click channel → Copy Channel ID",
            value: privateChannelId,
            onChange: value => {
                privateChannelId = value.replace(/\D/g, "");
                updateGuildConfig(guildId, { privateChannelId });
            }
        }),
        <Menu.MenuItem
            key="vc-iolite-config-channel-status"
            id="vc-iolite-config-channel-status"
            label={configuredChannel
                ? `Private destination: #${configuredChannel.name}`
                : privateChannelId
                    ? "Private channel ID is not from this server"
                    : "No private destination configured"}
            disabled
        />
    ];
}

async function viewWarns(user: User, guildId: string, channel?: Channel) {
    const destination = getDefaultDestination(guildId);
    const destinationId = getDestinationId(guildId, destination, channel);
    if (!destinationId) {
        showToast("Iolite could not find a destination channel.", Toasts.Type.FAILURE);
        return;
    }

    const isBackgroundLookup = destinationId !== SelectedChannelStore.getChannelId();
    if (settings.store.showWarnResponses && isBackgroundLookup) {
        clearPendingWarnLookup();
        pendingWarnLookup = {
            channelId: destinationId,
            expiresAt: Date.now() + 20_000,
            user
        };
        const lookup = pendingWarnLookup;
        warnLookupTimeout = window.setTimeout(() => {
            if (pendingWarnLookup !== lookup) return;
            clearPendingWarnLookup();
            showToast(
                "Iolite did not detect Sapphire's response. Configure Sapphire Bot ID if the bot has a different name.",
                Toasts.Type.FAILURE
            );
        }, 20_000);
    }

    const sent = await submitCommand(destinationId, buildCommand(guildId, "warns", user.id));
    if (!sent) clearPendingWarnLookup();
}

function makeQuickItems(user: User, guildId: string, channel?: Channel): ReactElement[] {
    const items = (["warn", "mute", "kick", "ban"] as const).map(command => (
        <Menu.MenuItem
            id={`vc-iolite-${command}`}
            key={`vc-iolite-${command}`}
            label={`Iolite - ${command[0].toUpperCase() + command.slice(1)}`}
            color={command === "ban" ? "danger" : undefined}
            action={() => openQuickPanel(command, user, guildId, channel)}
        />
    ));

    items.push(
        <Menu.MenuItem
            id="vc-iolite-warns"
            key="vc-iolite-warns"
            label="Iolite - View Warns"
            action={() => void viewWarns(user, guildId, channel)}
        />,
        <Menu.MenuItem
            id="vc-iolite-config"
            key="vc-iolite-config"
            label="Iolite - Server Settings"
        >
            {makeGuildConfigurationItems(guildId)}
        </Menu.MenuItem>
    );

    return items;
}

function isUnusedAction(child: ReactElement<any> | null | undefined): boolean {
    const id = String(child?.props?.id ?? "").toLowerCase();
    const label = typeof child?.props?.label === "string" ? child.props.label.toLowerCase() : "";
    return label === "start a call"
        || label === "add note"
        || id === "call"
        || id === "user-note"
        || id === "add-note";
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, props: UserContextProps) => {
    if (!props.guildId || !props.user) return;

    const quickItems = makeQuickItems(props.user, props.guildId, props.channel);
    const fastActionGroup = findGroupChildrenByChildId(["message", "call", "note"], children, true);
    if (!fastActionGroup) {
        children.splice(1, 0, <Menu.MenuGroup>{quickItems}</Menu.MenuGroup>);
        return;
    }

    if (settings.store.replaceUnusedActions) {
        for (let index = fastActionGroup.length - 1; index >= 0; index--) {
            if (isUnusedAction(fastActionGroup[index])) fastActionGroup.splice(index, 1);
        }
    }

    const messageIndex = fastActionGroup.findIndex(child =>
        String(child?.props?.id ?? "").toLowerCase().includes("message")
    );
    fastActionGroup.splice(messageIndex + 1, 0, ...quickItems);
};

function extractSapphireResponse(message: Message): string {
    const embedText = (message.embeds ?? []).flatMap((embed: any) => [
        embed.title,
        embed.description,
        ...(embed.fields ?? []).flatMap((field: any) => [field.name, field.value])
    ]);
    return [message.content, ...embedText].filter(Boolean).join("\n").trim();
}

function normalizeEmbedMedia(media: any) {
    if (!media) return undefined;
    return {
        ...media,
        proxyURL: media.proxyURL ?? media.proxy_url,
        placeholderVersion: media.placeholderVersion ?? media.placeholder_version,
        contentType: media.contentType ?? media.content_type,
        srcIsAnimated: media.srcIsAnimated ?? false
    };
}

function normalizeSapphireEmbed(embed: any) {
    if (!embed) return undefined;

    const numericColor = typeof embed.color === "number"
        ? embed.color
        : /^\d+$/.test(embed.color ?? "")
            ? Number(embed.color)
            : undefined;
    const color = numericColor == null
        ? embed.color
        : `#${(numericColor & 0xffffff).toString(16).padStart(6, "0")}`;

    return {
        ...embed,
        rawTitle: embed.rawTitle ?? embed.title ?? "",
        rawDescription: embed.rawDescription ?? embed.description ?? "",
        color,
        timestamp: typeof embed.timestamp === "string" ? new Date(embed.timestamp) : embed.timestamp,
        author: embed.author && {
            ...embed.author,
            iconURL: embed.author.iconURL ?? embed.author.icon_url,
            iconProxyURL: embed.author.iconProxyURL ?? embed.author.proxy_icon_url
        },
        footer: embed.footer && {
            ...embed.footer,
            iconURL: embed.footer.iconURL ?? embed.footer.icon_url,
            iconProxyURL: embed.footer.iconProxyURL ?? embed.footer.proxy_icon_url
        },
        thumbnail: normalizeEmbedMedia(embed.thumbnail),
        image: normalizeEmbedMedia(embed.image),
        images: embed.images?.map(normalizeEmbedMedia),
        video: normalizeEmbedMedia(embed.video),
        fields: (embed.fields ?? []).map((field: any) => ({
            ...field,
            rawName: field.rawName ?? field.name ?? "",
            rawValue: field.rawValue ?? field.value ?? ""
        }))
    };
}

function handleMessageCreate({ message, optimistic }: { message: Message; optimistic: boolean; }) {
    const lookup = pendingWarnLookup;
    if (!lookup || optimistic) return;
    if (Date.now() > lookup.expiresAt) {
        clearPendingWarnLookup();
        return;
    }
    if (message.channel_id !== lookup.channelId || !message.author?.bot) return;

    const configuredBotId = settings.store.sapphireBotId.trim();
    const isSapphire = configuredBotId
        ? message.author.id === configuredBotId
        : message.author.username.toLowerCase().includes("sapphire");
    if (!isSapphire) return;

    clearPendingWarnLookup();
    const sapphireEmbed = normalizeSapphireEmbed(message.embeds?.[0]);
    showNotification({
        title: `Sapphire warns · ${lookup.user.username}`,
        body: extractSapphireResponse(message) || "Sapphire responded without text.",
        richBody: sapphireEmbed
            ? <div style={{ maxHeight: "min(65vh, 640px)", overflow: "auto", width: "100%" }}>
                <NativeMessageEmbed embed={sapphireEmbed} />
            </div>
            : undefined,
        permanent: true,
        color: "var(--brand-500)"
    });
}

function getPreset(index: 1 | 2 | 3): Preset {
    const store = settings.store as unknown as Record<string, string>;
    return {
        shortcut: store[`preset${index}Shortcut`] ?? "",
        command: (store[`preset${index}Command`] ?? "warn") as PunishmentCommand,
        duration: store[`preset${index}Duration`] ?? "",
        reason: store[`preset${index}Reason`] ?? "",
        destination: (store[`preset${index}Destination`] ?? "current") as Destination
    };
}

function normalizeShortcut(shortcut: string): string {
    const tokens = shortcut.toLowerCase().replaceAll(" ", "").split("+").filter(Boolean);
    const aliases: Record<string, string> = { control: "ctrl", cmd: "meta", command: "meta", option: "alt" };
    const normalized = tokens.map(token => aliases[token] ?? token);
    const key = normalized.find(token => !["ctrl", "alt", "shift", "meta"].includes(token)) ?? "";
    return ["ctrl", "alt", "shift", "meta"].filter(modifier => normalized.includes(modifier)).concat(key).filter(Boolean).join("+");
}

function shortcutFromEvent(event: KeyboardEvent): string {
    const modifiers = [
        event.ctrlKey && "ctrl",
        event.altKey && "alt",
        event.shiftKey && "shift",
        event.metaKey && "meta"
    ].filter(Boolean) as string[];
    const key = event.key.toLowerCase();
    if (!["control", "alt", "shift", "meta"].includes(key)) modifiers.push(key);
    return modifiers.join("+");
}

function onPresetKeyDown(event: KeyboardEvent) {
    if (!settings.store.enableProfileShortcuts || !activeProfileTarget || event.repeat) return;
    const { target } = event;
    if (target instanceof HTMLElement && target.closest("input, textarea, [contenteditable='true']")) return;

    const eventShortcut = shortcutFromEvent(event);
    const preset = ([1, 2, 3] as const)
        .map(getPreset)
        .find(candidate => candidate.shortcut.trim() && normalizeShortcut(candidate.shortcut) === eventShortcut);
    if (!preset) return;

    event.preventDefault();
    event.stopPropagation();

    const guildId = activeProfileTarget.guildId ?? SelectedGuildStore.getGuildId();
    if (!guildId) {
        showToast("Open the profile from a server before using an Iolite preset.", Toasts.Type.FAILURE);
        return;
    }

    const destinationId = getDestinationId(guildId, preset.destination);
    if (!destinationId) {
        showToast("That preset's destination channel is not configured.", Toasts.Type.FAILURE);
        return;
    }

    void submitCommand(
        destinationId,
        buildCommand(
            guildId,
            preset.command,
            activeProfileTarget.user.id,
            preset.duration,
            preset.reason
        )
    );
}

function ProfileTargetTracker({ guildId, user }: { guildId?: string; user: User; }) {
    useEffect(() => {
        const target = { guildId, user };
        activeProfileTarget = target;
        return () => {
            if (activeProfileTarget === target) activeProfileTarget = null;
        };
    }, [guildId, user]);
    return null;
}

function profileTargetTracker(props: { guildId?: string; user?: User; }) {
    return props.user ? <ProfileTargetTracker guildId={props.guildId} user={props.user} /> : null;
}

const author = {
    name: "Epiano7",
    get id() {
        return BigInt(UserStore?.getCurrentUser()?.id ?? "0");
    }
};

export default definePlugin({
    name: "Iolite",
    description: "A QoL vencord plugin for Sapphire commands",
    authors: [author],
    settings,
    patches: [{
        find: '"UserProfilePopout");',
        replacement: {
            match: /user:(\i),widgets:.{0,100}?\}\),/,
            replace: "$&$self.profileTargetTracker({user:$1,guildId:arguments[0].guildId}),"
        }
    }],
    flux: {
        MESSAGE_CREATE: handleMessageCreate
    },
    contextMenus: {
        "user-context": UserContextMenuPatch
    },
    profileTargetTracker,
    start() {
        window.addEventListener("keydown", onPresetKeyDown, true);
    },
    stop() {
        window.removeEventListener("keydown", onPresetKeyDown, true);
        activeProfileTarget = null;
        clearPendingWarnLookup();
        closeQuickPanel();
    }
});
