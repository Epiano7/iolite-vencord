/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, Message, MessageComponent, User } from "@vencord/discord-types";
import {
    AuthenticationStore,
    ChannelStore,
    ContextMenuApi,
    createRoot,
    LocaleStore,
    Menu,
    NavigationRouter,
    Parser,
    RestAPI,
    SelectedChannelStore,
    SelectedGuildStore,
    showToast,
    SnowflakeUtils,
    Toasts,
    useEffect,
    UserSettingsProtoStore,
    UserStore
} from "@webpack/common";
import type { ReactElement } from "react";
import type { Root } from "react-dom/client";

import {
    ActionMenuEditor,
    DEFAULT_MENU_LAYOUTS,
    type MenuActionId,
    type MenuContext,
    type MenuLayouts,
    normalizeMenuLayout
} from "./MenuEditor";
import {
    QuickCommand,
    QuickDestination,
    QuickPanel,
    QuickPanelPreset,
    QuickPanelResult,
    RecentMessageItem,
    RecentMessagePage,
    RecentMessageScope,
    RecentMessagesPanel,
    RecentMessageTimestampFormat,
    SapphireConfirmationChoice,
    SapphireConfirmationPanel,
    SapphireLookupPanel
} from "./QuickPanel";

type PunishmentCommand = "ban" | "kick" | "mute" | "warn";
type Destination = "current" | "private";
type LookupType = "cases" | "userinfo" | "warns";

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

const RECENT_MESSAGE_TIMESTAMP_OPTIONS = [
    { label: "Smart (time today, age when older)", value: "smart", default: true },
    { label: "Relative age", value: "relative" },
    { label: "Exact date and time", value: "absolute" }
] as const;

interface GuildConfig {
    casesCommand?: string;
    prefix?: string;
    privateChannelId?: string;
    userinfoCommand?: string;
}

interface RecentReasons {
    ban: string[];
    mute: string[];
}

interface UserContextProps {
    channel?: Channel;
    guildId?: string;
    user?: User;
}

interface MessageContextProps {
    channel?: Channel;
    guildId?: string;
    message?: Message;
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
        description: "Show Sapphire's Warns, User Info, and Cases responses in Iolite's on-screen panel",
        default: true
    },
    lookupPanelTimeoutSeconds: {
        type: OptionType.NUMBER,
        description: "Seconds before lookup panels close; hover, keyboard focus, and leaving Discord pause the timer (0 keeps them open)",
        default: 5
    },
    recentMessagesPanelTimeoutSeconds: {
        type: OptionType.NUMBER,
        description: "Seconds before Recent Messages closes; hover, keyboard focus, and leaving Discord pause the timer (0 keeps it open)",
        default: 60
    },
    recentMessageTimestampFormat: {
        type: OptionType.SELECT,
        description: "Timestamp style used by Recent Messages",
        options: RECENT_MESSAGE_TIMESTAMP_OPTIONS
    },
    userinfoCommand: {
        type: OptionType.STRING,
        description: "Default Sapphire command name for User Info lookups",
        placeholder: "userinfo",
        default: "userinfo"
    },
    casesCommand: {
        type: OptionType.STRING,
        description: "Default Sapphire command name for Cases lookups",
        placeholder: "cases",
        default: "cases"
    },
    enableMessageActions: {
        type: OptionType.BOOLEAN,
        description: "Show Iolite actions when right-clicking a message",
        default: true
    },
    actionMenuEditor: {
        type: OptionType.COMPONENT,
        component: () => (
            <ActionMenuEditor
                layouts={settings.store.menuLayouts ?? DEFAULT_MENU_LAYOUTS}
                onChange={(context, layout) => {
                    settings.store.menuLayouts = {
                        ...settings.store.menuLayouts,
                        [context]: layout
                    };
                }}
            />
        )
    },
    relaySapphireConfirmations: {
        type: OptionType.BOOLEAN,
        description: "Show Sapphire's recent-punishment confirmation buttons in Iolite's quick panel",
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
    rememberRecentReasons: {
        type: OptionType.BOOLEAN,
        description: "Remember the eight most recently sent ban and mute reasons for quick reuse",
        default: true
    },
    clearRecentReasons: {
        type: OptionType.COMPONENT,
        component: () => (
            <Button onClick={() => {
                settings.store.recentReasons = { ban: [], mute: [] };
                showToast("Iolite's saved ban and mute reasons were cleared.", Toasts.Type.SUCCESS);
            }}>
                Clear saved ban and mute reasons
            </Button>
        )
    },
    quickPanelColor1: {
        type: OptionType.STRING,
        description: "Optional quick-panel background color in #RRGGBB format",
        placeholder: "#111214",
        default: ""
    },
    quickPanelColor2: {
        type: OptionType.STRING,
        description: "Optional second #RRGGBB color; when set, the quick panel uses a diagonal gradient",
        placeholder: "#5865F2",
        default: ""
    },
    preset1Name: {
        type: OptionType.STRING,
        description: "Preset 1 name shown in moderation popups",
        placeholder: "Preset 1",
        default: "Preset 1"
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
    preset2Name: {
        type: OptionType.STRING,
        description: "Preset 2 name shown in moderation popups",
        placeholder: "Preset 2",
        default: "Preset 2"
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
    preset3Name: {
        type: OptionType.STRING,
        description: "Preset 3 name shown in moderation popups",
        placeholder: "Preset 3",
        default: "Preset 3"
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
    },
    menuLayouts: {
        type: OptionType.CUSTOM,
        default: DEFAULT_MENU_LAYOUTS as MenuLayouts
    },
    recentReasons: {
        type: OptionType.CUSTOM,
        default: { ban: [], mute: [] } as RecentReasons
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

const LOOKUP_LABELS: Record<LookupType, { action: string; title: string; }> = {
    warns: { action: "View Warns", title: "Sapphire warns" },
    userinfo: { action: "View User Info", title: "Sapphire user info" },
    cases: { action: "View Cases", title: "Sapphire cases" }
};

function getLookupCommand(guildId: string, type: LookupType): string {
    if (type === "warns") return "warns";
    const config = getGuildConfig(guildId);
    return type === "userinfo"
        ? config.userinfoCommand?.trim() || settings.store.userinfoCommand.trim()
        : config.casesCommand?.trim() || settings.store.casesCommand.trim();
}

function buildCommand(
    guildId: string,
    command: string,
    userId: string,
    duration = "",
    reason = "",
    review = false
): string {
    const parts = [`${getPrefix(guildId)}${command}`, `<@${userId}>`];

    if (duration.trim()) parts.push(duration.trim());
    if (reason.trim()) parts.push(reason.trim());
    if (review && ["ban", "kick", "mute", "warn"].includes(command)) parts.push("-r");

    return parts.join(" ");
}

async function submitCommand(channelId: string | undefined, command: string) {
    if (!channelId) {
        showToast("Iolite could not find a destination channel.", Toasts.Type.FAILURE);
        return false;
    }

    try {
        const isBackgroundChannel = channelId !== SelectedChannelStore.getChannelId();
        await sendMessage(channelId, { content: command }, !isBackgroundChannel);
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

interface PendingLookup {
    channelId: string;
    expiresAt: number;
    sentAt: number;
    type: LookupType;
    user: User;
}

interface PendingModerationCommand {
    channelId: string;
    command: PunishmentCommand;
    expiresAt: number;
    guildId: string;
    user: User;
}

interface Preset {
    command: PunishmentCommand;
    destination: Destination;
    duration: string;
    name: string;
    reason: string;
    shortcut: string;
}

let activeProfileTarget: ActiveProfileTarget | null = null;
let pendingModerationCommand: PendingModerationCommand | null = null;
let moderationCommandTimeout: number | null = null;
let pendingLookup: PendingLookup | null = null;
let lookupTimeout: number | null = null;
let quickPanelContainer: HTMLDivElement | null = null;
let quickPanelRoot: Root | null = null;

function closeQuickPanel() {
    quickPanelRoot?.unmount();
    quickPanelContainer?.remove();
    quickPanelRoot = null;
    quickPanelContainer = null;
}

function mountQuickPanel(element: ReactElement) {
    closeQuickPanel();
    quickPanelContainer = document.createElement("div");
    quickPanelContainer.id = "vc-iolite-quick-panel";
    const containPanelEvent = (event: Event) => event.stopPropagation();
    for (const eventName of ["beforeinput", "input", "keydown", "keypress", "keyup"])
        quickPanelContainer.addEventListener(eventName, containPanelEvent);
    document.body.append(quickPanelContainer);
    const shadowRoot = quickPanelContainer.attachShadow({ mode: "closed" });
    const mountPoint = document.createElement("div");
    shadowRoot.append(mountPoint);
    quickPanelRoot = createRoot(mountPoint);
    quickPanelRoot.render(element);
}

function clearPendingModerationCommand() {
    pendingModerationCommand = null;
    if (moderationCommandTimeout != null) window.clearTimeout(moderationCommandTimeout);
    moderationCommandTimeout = null;
}

function beginPendingModerationCommand(command: PunishmentCommand, channelId: string, guildId: string, user: User) {
    clearPendingModerationCommand();
    pendingModerationCommand = {
        channelId,
        command,
        expiresAt: Date.now() + 45_000,
        guildId,
        user
    };
    moderationCommandTimeout = window.setTimeout(clearPendingModerationCommand, 45_000);
}

function clearPendingLookup() {
    pendingLookup = null;
    if (lookupTimeout != null) window.clearTimeout(lookupTimeout);
    lookupTimeout = null;
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
    ContextMenuApi.closeContextMenu();

    const defaultDestination = getDefaultDestination(guildId) as QuickDestination;
    const presets = ([1, 2, 3] as const)
        .map(getPreset)
        .filter(preset => preset.command === command && Boolean(preset.reason.trim() || preset.duration.trim()))
        .map((preset): QuickPanelPreset => ({
            name: preset.name.trim() || "Unnamed preset",
            destination: preset.destination,
            duration: preset.duration,
            reason: preset.reason
        }));
    mountQuickPanel(
        <QuickPanel
            command={command}
            defaultDestination={defaultDestination}
            gradientColor1={normalizeHexColor(settings.store.quickPanelColor1)}
            gradientColor2={normalizeHexColor(settings.store.quickPanelColor2)}
            hasPrivateChannel={Boolean(getPrivateChannel(guildId))}
            onClose={closeQuickPanel}
            presets={presets}
            recentReasons={getRecentReasons(command)}
            user={user}
            onSubmit={(result: QuickPanelResult) => {
                const destinationId = getDestinationId(guildId, result.destination, channel);
                if (!destinationId) {
                    showToast("Iolite could not find that destination channel.", Toasts.Type.FAILURE);
                    return;
                }

                closeQuickPanel();
                void (async () => {
                    beginPendingModerationCommand(command, destinationId, guildId, user);
                    const sent = await submitCommand(
                        destinationId,
                        buildCommand(guildId, command, user.id, result.duration, result.reason, result.review)
                    );
                    if (sent) rememberRecentReason(command, result.reason);
                    else clearPendingModerationCommand();
                })();
            }}
        />
    );
}

function normalizeHexColor(value: string): string | undefined {
    const trimmed = value.trim();
    const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    return /^#[\da-f]{6}$/i.test(normalized) ? normalized : undefined;
}

function getRecentReasons(command: QuickCommand): string[] {
    if (!settings.store.rememberRecentReasons || (command !== "ban" && command !== "mute")) return [];
    return settings.store.recentReasons[command] ?? [];
}

function rememberRecentReason(command: QuickCommand, reason: string) {
    const normalized = reason.trim();
    if (!settings.store.rememberRecentReasons || !normalized || (command !== "ban" && command !== "mute")) return;

    const recent = settings.store.recentReasons;
    settings.store.recentReasons = {
        ...recent,
        [command]: [normalized, ...(recent[command] ?? []).filter(saved => saved !== normalized)].slice(0, 8)
    };
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
    let userinfoCommand = config.userinfoCommand ?? "";
    let casesCommand = config.casesCommand ?? "";
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
        makeTextControl({
            id: "vc-iolite-config-userinfo-command",
            label: "User Info command for this server",
            placeholder: `Default: ${settings.store.userinfoCommand.trim() || "userinfo"}`,
            value: userinfoCommand,
            onChange: value => {
                userinfoCommand = value.replace(/\s/g, "");
                updateGuildConfig(guildId, { userinfoCommand });
            }
        }),
        makeTextControl({
            id: "vc-iolite-config-cases-command",
            label: "Cases command for this server",
            placeholder: `Default: ${settings.store.casesCommand.trim() || "cases"}`,
            value: casesCommand,
            onChange: value => {
                casesCommand = value.replace(/\s/g, "");
                updateGuildConfig(guildId, { casesCommand });
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

async function viewLookup(type: LookupType, user: User, guildId: string, channel?: Channel) {
    const destination = getDefaultDestination(guildId);
    const destinationId = getDestinationId(guildId, destination, channel);
    if (!destinationId) {
        showToast("Iolite could not find a destination channel.", Toasts.Type.FAILURE);
        return;
    }

    const command = getLookupCommand(guildId, type);
    if (!command) {
        showToast(`${LOOKUP_LABELS[type].action} is disabled because its command name is empty.`, Toasts.Type.FAILURE);
        return;
    }

    clearPendingLookup();
    if (settings.store.showWarnResponses) {
        pendingLookup = {
            channelId: destinationId,
            expiresAt: Date.now() + 20_000,
            sentAt: Date.now(),
            type,
            user
        };
        const lookup = pendingLookup;
        lookupTimeout = window.setTimeout(() => {
            if (pendingLookup !== lookup) return;
            clearPendingLookup();
            showToast(
                "Iolite did not detect Sapphire's response. Configure Sapphire Bot ID if the bot has a different name.",
                Toasts.Type.FAILURE
            );
        }, 20_000);
    }

    const sent = await submitCommand(destinationId, buildCommand(guildId, command, user.id));
    if (!sent) clearPendingLookup();
}

async function searchRecentMessages(
    scope: RecentMessageScope,
    guildId: string,
    channelId: string,
    userId: string,
    offset: number
): Promise<RecentMessagePage> {
    const response = await RestAPI.get({
        url: scope === "server"
            ? `/guilds/${guildId}/messages/search`
            : `/channels/${channelId}/messages/search`,
        query: {
            author_id: userId,
            offset
        },
        retries: 1
    });
    const body = response.body ?? {};
    if (body.retry_after) throw new Error(`Discord is still indexing messages; retry after ${body.retry_after} seconds.`);

    const groups = Array.isArray(body.messages) ? body.messages : [];
    const rawMessages = groups.flatMap((group: unknown) => Array.isArray(group) ? group : [group]);
    const seen = new Set<string>();
    const messages = rawMessages
        .filter((message: any) => message?.id && message.author?.id === userId && !seen.has(message.id) && seen.add(message.id))
        .sort((left: any, right: any) => String(right.id).localeCompare(String(left.id)))
        .map((message: any): RecentMessageItem => ({
            attachments: Array.isArray(message.attachments) ? message.attachments.map((attachment: any) => ({
                contentType: attachment.content_type ?? attachment.contentType,
                filename: String(attachment.filename ?? "attachment"),
                height: attachment.height,
                url: String(attachment.proxy_url ?? attachment.proxyURL ?? attachment.url ?? ""),
                width: attachment.width
            })).filter((attachment: any) => attachment.url) : [],
            channelId: message.channel_id,
            channelName: ChannelStore.getChannel(message.channel_id)?.name ?? "unknown-channel",
            content: String(message.content ?? ""),
            embeds: Array.isArray(message.embeds) ? message.embeds : [],
            id: message.id,
            timestamp: message.timestamp ?? new Date(SnowflakeUtils.extractTimestamp(message.id)).toISOString()
        }));

    return {
        messages,
        nextOffset: groups.length > 0 ? offset + groups.length : Number(body.total_results) || offset,
        total: Math.max(Number(body.total_results) || messages.length, offset + messages.length)
    };
}

function openRecentMessages(user: User, guildId: string, channel?: Channel) {
    ContextMenuApi.closeContextMenu();
    const channelId = getCurrentChannelId(channel);
    if (!channelId) {
        showToast("Iolite could not find the current channel.", Toasts.Type.FAILURE);
        return;
    }
    const currentChannel = ChannelStore.getChannel(channelId);
    const { timestampHourCycle } = UserSettingsProtoStore.settings.appearance;
    const hour12 = timestampHourCycle === 1 ? true : timestampHourCycle === 2 ? false : undefined;
    mountQuickPanel(
        <RecentMessagesPanel
            currentChannelName={currentChannel?.name ?? "current-channel"}
            defaultScope="server"
            gradientColor1={normalizeHexColor(settings.store.quickPanelColor1)}
            gradientColor2={normalizeHexColor(settings.store.quickPanelColor2)}
            hour12={hour12}
            loadPage={(scope, offset) => searchRecentMessages(scope, guildId, channelId, user.id, offset)}
            locale={LocaleStore.locale || navigator.language}
            onClose={closeQuickPanel}
            onJump={message => {
                NavigationRouter.transitionTo(`/channels/${guildId}/${message.channelId}/${message.id}`);
                closeQuickPanel();
            }}
            renderMessage={message => <RecentMessageContent message={message} />}
            timestampFormat={settings.store.recentMessageTimestampFormat as RecentMessageTimestampFormat}
            timeoutMs={getPanelTimeoutMs(settings.store.recentMessagesPanelTimeoutSeconds)}
            user={user}
        />
    );
}

function makeActionItem(actionId: MenuActionId, user: User, guildId: string, channel?: Channel): ReactElement {
    if (["warn", "mute", "kick", "ban"].includes(actionId)) {
        const command = actionId as PunishmentCommand;
        return (
            <Menu.MenuItem
                id={`vc-iolite-${command}`}
                key={`vc-iolite-${command}`}
                label={`Iolite - ${command[0].toUpperCase() + command.slice(1)}`}
                color={command === "ban" ? "danger" : undefined}
                action={() => openQuickPanel(command, user, guildId, channel)}
            />
        );
    }

    if (actionId === "recentMessages") {
        return (
            <Menu.MenuItem
                id="vc-iolite-recent-messages"
                key="vc-iolite-recent-messages"
                label="Iolite - Recent Messages"
                action={() => openRecentMessages(user, guildId, channel)}
            />
        );
    }

    const type = actionId as LookupType;
    return (
        <Menu.MenuItem
            id={`vc-iolite-${type}`}
            key={`vc-iolite-${type}`}
            label={`Iolite - ${LOOKUP_LABELS[type].action}`}
            action={() => void viewLookup(type, user, guildId, channel)}
        />
    );
}

function makeQuickItems(user: User, guildId: string, channel: Channel | undefined, context: MenuContext, includeSettings = true): ReactElement[] {
    const layout = normalizeMenuLayout(settings.store.menuLayouts?.[context]);
    const items = layout.order.map(actionId => makeActionItem(actionId, user, guildId, channel));

    if (includeSettings) items.push(
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

    const quickItems = makeQuickItems(props.user, props.guildId, props.channel, "profile");
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

const MessageContextMenuPatch: NavContextMenuPatchCallback = (children, props: MessageContextProps) => {
    if (!settings.store.enableMessageActions || !props.channel || !props.message?.author) return;
    const guildId = props.guildId ?? props.channel.guild_id;
    if (!guildId) return;
    children.push(
        <Menu.MenuGroup key="vc-iolite-message-actions">
            {makeQuickItems(props.message.author, guildId, props.channel, "message", false)}
        </Menu.MenuGroup>
    );
};

function extractSapphireResponse(message: Message): string {
    const embedText = (message.embeds ?? []).flatMap((embed: any) => [
        embed.title,
        embed.description,
        ...(embed.fields ?? []).flatMap((field: any) => [field.name, field.value])
    ]);
    return [message.content, ...embedText].filter(Boolean).join("\n").trim();
}

function embedMediaUrl(media: any): string | undefined {
    return media?.proxyURL ?? media?.proxy_url ?? media?.url;
}

function embedColor(color: unknown): string {
    if (typeof color === "number") return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
    if (typeof color === "string" && (/^#[\da-f]{6}$/i.test(color) || color.startsWith("var("))) return color;
    return "var(--brand-500)";
}

function EmbedText({ channelId, children }: { channelId?: string; children: unknown; }) {
    const text = typeof children === "string" ? children : String(children ?? "");
    return text ? <>{Parser.parse(text, false, {
        allowEmojiLinks: true,
        allowHeading: true,
        allowLinks: true,
        allowList: true,
        channelId,
        viewingChannelId: channelId
    })}</> : null;
}

function SapphireEmbedCard({ channelId, embed }: { channelId?: string; embed: any; }) {
    const authorIcon = embedMediaUrl({
        proxyURL: embed.author?.iconProxyURL ?? embed.author?.proxy_icon_url,
        url: embed.author?.iconURL ?? embed.author?.icon_url
    });
    const thumbnail = embedMediaUrl(embed.thumbnail);
    const image = embedMediaUrl(embed.image) ?? embedMediaUrl(embed.images?.[0]);
    const footerIcon = embedMediaUrl({
        proxyURL: embed.footer?.iconProxyURL ?? embed.footer?.proxy_icon_url,
        url: embed.footer?.iconURL ?? embed.footer?.icon_url
    });

    return (
        <div style={{
            background: "var(--background-secondary)",
            borderRadius: 4,
            display: "grid",
            gridTemplateColumns: "4px minmax(0, 1fr)",
            maxWidth: 520,
            overflow: "hidden",
            width: "100%"
        }}>
            <div style={{ background: embedColor(embed.color) }} />
            <div style={{ minWidth: 0, padding: "12px 16px 16px" }}>
                {embed.author?.name && <div style={{ alignItems: "center", display: "flex", fontSize: 12, fontWeight: 600, gap: 8, marginBottom: 8 }}>
                    {authorIcon && <img alt="" src={authorIcon} style={{ borderRadius: "50%", height: 24, width: 24 }} />}
                    <EmbedText channelId={channelId}>{embed.author.name}</EmbedText>
                </div>}
                <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {embed.title && <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                            {embed.url
                                ? <a href={embed.url} rel="noreferrer" style={{ color: "var(--text-link)", textDecoration: "none" }} target="_blank">
                                    <EmbedText channelId={channelId}>{embed.title}</EmbedText>
                                </a>
                                : <EmbedText channelId={channelId}>{embed.title}</EmbedText>}
                        </div>}
                        {embed.description && <div style={{ fontSize: 14, lineHeight: "18px", whiteSpace: "pre-wrap" }}>
                            <EmbedText channelId={channelId}>{embed.description}</EmbedText>
                        </div>}
                    </div>
                    {thumbnail && <img alt="" src={thumbnail} style={{ borderRadius: 4, height: 80, objectFit: "cover", width: 80 }} />}
                </div>
                {!!embed.fields?.length && <div style={{ display: "grid", gap: "8px 16px", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 12 }}>
                    {embed.fields.map((field: any, index: number) => <div key={index} style={{ gridColumn: field.inline ? "span 1" : "1 / -1", minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}><EmbedText channelId={channelId}>{field.name}</EmbedText></div>
                        <div style={{ fontSize: 14, lineHeight: "18px", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                            <EmbedText channelId={channelId}>{field.value}</EmbedText>
                        </div>
                    </div>)}
                </div>}
                {image && <img alt="" src={image} style={{ borderRadius: 4, display: "block", marginTop: 16, maxHeight: 300, maxWidth: "100%", objectFit: "contain" }} />}
                {(embed.footer?.text || embed.timestamp) && <div style={{ alignItems: "center", display: "flex", fontSize: 12, gap: 8, marginTop: 8, opacity: 0.8 }}>
                    {footerIcon && <img alt="" src={footerIcon} style={{ borderRadius: "50%", height: 20, width: 20 }} />}
                    <span>{[embed.footer?.text, embed.timestamp && new Date(embed.timestamp).toLocaleString()].filter(Boolean).join(" • ")}</span>
                </div>}
            </div>
        </div>
    );
}

function RecentMessageContent({ message }: { message: RecentMessageItem; }) {
    const hasContent = Boolean(message.content.trim());
    const hasMedia = message.embeds.length > 0 || message.attachments.length > 0;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hasContent && <div style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                <EmbedText channelId={message.channelId}>{message.content}</EmbedText>
            </div>}
            {message.embeds.map((embed, index) => (
                <SapphireEmbedCard channelId={message.channelId} embed={embed} key={`embed-${index}`} />
            ))}
            {message.attachments.map((attachment, index) => {
                const isImage = attachment.contentType?.startsWith("image/")
                    || /\.(?:avif|gif|jpe?g|png|webp)(?:\?|$)/i.test(attachment.url);
                return isImage
                    ? <a href={attachment.url} key={`attachment-${index}`} rel="noreferrer" target="_blank">
                        <img
                            alt={attachment.filename}
                            src={attachment.url}
                            style={{ borderRadius: 6, display: "block", maxHeight: 260, maxWidth: "100%", objectFit: "contain" }}
                        />
                    </a>
                    : <a
                        href={attachment.url}
                        key={`attachment-${index}`}
                        rel="noreferrer"
                        style={{ color: "var(--text-link)", overflowWrap: "anywhere" }}
                        target="_blank"
                    >
                        {attachment.filename}
                    </a>;
            })}
            {!hasContent && !hasMedia && <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No text content</span>}
        </div>
    );
}

function isSapphireMessage(message: Message): boolean {
    if (!message.author?.bot) return false;
    const configuredBotId = settings.store.sapphireBotId.trim();
    return configuredBotId
        ? message.author.id === configuredBotId
        : String(message.author.username ?? "").toLowerCase().includes("sapphire");
}

function responseMatchesLookup(message: Message, lookup: PendingLookup): boolean {
    if (SnowflakeUtils.extractTimestamp(message.id) < lookup.sentAt - 1_000) return false;

    const mentionedIds = Array.from(extractSapphireResponse(message).matchAll(/<@!?(\d+)>/g), match => match[1]);
    return mentionedIds.length === 0 || mentionedIds.includes(lookup.user.id);
}

function getPanelTimeoutMs(value: unknown): number {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    return Math.min(seconds, 3_600) * 1_000;
}

function getLookupPanelTimeoutMs(): number {
    return getPanelTimeoutMs(settings.store.lookupPanelTimeoutSeconds);
}

function showLookupResponse(message: Message, lookup: PendingLookup) {
    const embeds = message.embeds ?? [];
    const responseText = extractSapphireResponse(message) || "Sapphire responded without text.";
    mountQuickPanel(
        <SapphireLookupPanel
            gradientColor1={normalizeHexColor(settings.store.quickPanelColor1)}
            gradientColor2={normalizeHexColor(settings.store.quickPanelColor2)}
            onClose={closeQuickPanel}
            timeoutMs={getLookupPanelTimeoutMs()}
            title={LOOKUP_LABELS[lookup.type].title}
            user={lookup.user}
        >
            {embeds.length > 0
                ? <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {embeds.map((embed, index) => <SapphireEmbedCard channelId={lookup.channelId} key={index} embed={embed} />)}
                </div>
                : <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    <EmbedText channelId={lookup.channelId}>{responseText}</EmbedText>
                </div>}
        </SapphireLookupPanel>
    );
}

function flattenMessageComponents(components: MessageComponent[] = []): MessageComponent[] {
    return components.flatMap(component => [
        component,
        ...flattenMessageComponents(component.components ?? [])
    ]);
}

function getConfirmationChoices(message: Message): SapphireConfirmationChoice[] {
    const buttons = flattenMessageComponents(message.components)
        .filter(component => component.type === 2 && component.custom_id && !component.disabled && component.style !== 5);
    if (!buttons.length) return [];

    const responseText = extractSapphireResponse(message);
    const confirmationWords = /approv|confirm|continue|proceed|punish anyway|yes|cancel|deny|decline|\bno\b|recent (?:case|punishment)/i;
    if (!confirmationWords.test(responseText) && !buttons.some(button => confirmationWords.test(button.label ?? ""))) return [];

    return buttons.slice(0, 4).map((button, index) => ({
        customId: button.custom_id!,
        label: button.label?.trim() || `Option ${index + 1}`,
        style: button.style,
        type: button.type
    }));
}

function showSapphireConfirmation(message: Message, pending: PendingModerationCommand, choices: SapphireConfirmationChoice[]) {
    clearPendingModerationCommand();
    const body = extractSapphireResponse(message)
        || `Sapphire found a recent punishment for ${pending.user.username} and needs confirmation.`;

    mountQuickPanel(
        <SapphireConfirmationPanel
            body={body}
            choices={choices}
            gradientColor1={normalizeHexColor(settings.store.quickPanelColor1)}
            gradientColor2={normalizeHexColor(settings.store.quickPanelColor2)}
            onClose={closeQuickPanel}
            user={pending.user}
            onOpenOriginal={() => {
                NavigationRouter.transitionTo(`/channels/${pending.guildId}/${message.channel_id}/${message.id}`);
                closeQuickPanel();
            }}
            onChoose={async choice => {
                try {
                    await RestAPI.post({
                        url: "/interactions",
                        body: {
                            type: 3,
                            nonce: SnowflakeUtils.fromTimestamp(Date.now()),
                            guild_id: pending.guildId,
                            channel_id: message.channel_id,
                            message_flags: Number(message.flags ?? 0),
                            message_id: message.id,
                            application_id: message.applicationId ?? message.author.id,
                            session_id: AuthenticationStore.getSessionId(),
                            data: {
                                component_type: choice.type,
                                custom_id: choice.customId
                            }
                        }
                    });
                    closeQuickPanel();
                    showToast(`Sapphire: ${choice.label} sent.`, Toasts.Type.SUCCESS);
                    return true;
                } catch (error) {
                    console.error("[Iolite] Failed to submit Sapphire confirmation", error);
                    showToast("Sapphire confirmation failed. Open the original message and try there.", Toasts.Type.FAILURE);
                    return false;
                }
            }}
        />
    );
}

function handleMessageCreate({ message, optimistic }: { message: Message; optimistic: boolean; }) {
    const moderation = pendingModerationCommand;
    if (moderation && !optimistic) {
        if (Date.now() > moderation.expiresAt) {
            clearPendingModerationCommand();
        } else if (message.channel_id === moderation.channelId && isSapphireMessage(message)) {
            const choices = settings.store.relaySapphireConfirmations
                ? getConfirmationChoices(message)
                : [];
            if (choices.length) showSapphireConfirmation(message, moderation, choices);
            else clearPendingModerationCommand();
        }
    }

    const lookup = pendingLookup;
    if (!lookup || optimistic) return;
    if (Date.now() > lookup.expiresAt) {
        clearPendingLookup();
        return;
    }
    if (message.channel_id !== lookup.channelId || !isSapphireMessage(message) || !responseMatchesLookup(message, lookup)) return;

    clearPendingLookup();
    showLookupResponse(message, lookup);
}

function getPreset(index: 1 | 2 | 3): Preset {
    const store = settings.store as unknown as Record<string, string>;
    return {
        name: store[`preset${index}Name`] ?? `Preset ${index}`,
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
    if (quickPanelContainer || !settings.store.enableProfileShortcuts || !activeProfileTarget || event.repeat) return;
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

    beginPendingModerationCommand(preset.command, destinationId, guildId, activeProfileTarget.user);
    void submitCommand(
        destinationId,
        buildCommand(
            guildId,
            preset.command,
            activeProfileTarget.user.id,
            preset.duration,
            preset.reason
        )
    ).then(sent => {
        if (!sent) clearPendingModerationCommand();
    });
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

const eoka = {
    name: "Eoka",
    id: 1119704211291115561n
};

export default definePlugin({
    name: "Iolite",
    description: "A QoL vencord plugin for Sapphire commands",
    authors: [author, eoka],
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
        "user-context": UserContextMenuPatch,
        "message": MessageContextMenuPatch
    },
    profileTargetTracker,
    start() {
        window.addEventListener("keydown", onPresetKeyDown, true);
    },
    stop() {
        window.removeEventListener("keydown", onPresetKeyDown, true);
        activeProfileTarget = null;
        clearPendingModerationCommand();
        clearPendingLookup();
        closeQuickPanel();
    }
});
