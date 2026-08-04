/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, User } from "@vencord/discord-types";
import {
    ChannelStore,
    ContextMenuApi,
    Menu,
    SelectedChannelStore,
    showToast,
    Toasts,
    UserStore
} from "@webpack/common";
import type { ReactElement } from "react";

type PunishmentCommand = "ban" | "kick" | "mute" | "warn";
type Destination = "current" | "private";

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
        return;
    }

    try {
        await sendMessage(channelId, { content: command });
        ContextMenuApi.closeContextMenu();
        showToast("Sapphire command sent.", Toasts.Type.SUCCESS);
    } catch (error) {
        console.error("[Iolite] Failed to send command", error);
        showToast("Sapphire command failed to send.", Toasts.Type.FAILURE);
    }
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

function makePunishmentItems({ channel, command, guildId, user }: {
    channel?: Channel;
    command: PunishmentCommand;
    guildId: string;
    user: User;
}) {
    const privateChannel = getPrivateChannel(guildId);
    const state = { duration: "", reason: "" };
    const supportsDuration = command !== "kick";
    const currentChannelId = getCurrentChannelId(channel);
    const defaultDestination: Destination = settings.store.defaultToPrivateChannel && privateChannel
        ? "private"
        : "current";

    const getDestinationId = (destination: Destination) => destination === "private"
        ? privateChannel?.id
        : currentChannelId;
    const send = (destination: Destination, review: boolean) => void submitCommand(
        getDestinationId(destination),
        buildCommand(
            guildId,
            command,
            user.id,
            supportsDuration ? state.duration : "",
            state.reason,
            review
        )
    );

    const items: ReactElement[] = [];
    if (supportsDuration) {
        items.push(makeTextControl({
            id: `vc-iolite-${command}-duration`,
            label: "Duration (optional)",
            placeholder: "e.g. 1h, 7d",
            value: state.duration,
            onChange: value => state.duration = value
        }));
    }

    items.push(
        makeTextControl({
            id: `vc-iolite-${command}-reason`,
            label: "Reason (optional)",
            placeholder: "Moderation reason",
            value: state.reason,
            onChange: value => state.reason = value
        }),
        <Menu.MenuItem
            key={`vc-iolite-${command}-send`}
            id={`vc-iolite-${command}-send`}
            label={`Send ${command}`}
            color={command === "ban" ? "danger" : undefined}
            disabled={!getDestinationId(defaultDestination)}
            action={() => send(defaultDestination, false)}
        />,
        <Menu.MenuItem
            key={`vc-iolite-${command}-more`}
            id={`vc-iolite-${command}-more`}
            label="More send options"
        >
            <Menu.MenuItem
                id={`vc-iolite-${command}-current`}
                label="Send to current channel"
                disabled={!currentChannelId}
                action={() => send("current", false)}
            />
            <Menu.MenuItem
                id={`vc-iolite-${command}-private`}
                label={privateChannel ? `Send to #${privateChannel.name}` : "Private channel not configured"}
                disabled={!privateChannel}
                action={() => send("private", false)}
            />
            <Menu.MenuItem
                id={`vc-iolite-${command}-review`}
                label="Send for Sapphire review (-r)"
                disabled={!getDestinationId(defaultDestination)}
                action={() => send(defaultDestination, true)}
            />
        </Menu.MenuItem>
    );

    return items;
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

function makeIoliteMenu({ channel, guildId, user }: {
    channel?: Channel;
    guildId: string;
    user: User;
}) {
    const privateChannel = getPrivateChannel(guildId);
    const warnsDestination = settings.store.defaultToPrivateChannel && privateChannel
        ? privateChannel.id
        : getCurrentChannelId(channel);

    return (
        <Menu.MenuItem id="vc-iolite" label="Iolite · Sapphire Actions">
            <Menu.MenuItem id="vc-iolite-target" label={`Target: ${user.username}`} disabled />
            {(["warn", "mute", "kick", "ban"] as const).map(command => (
                <Menu.MenuItem
                    id={`vc-iolite-${command}`}
                    key={command}
                    label={command[0].toUpperCase() + command.slice(1)}
                    color={command === "ban" ? "danger" : undefined}
                >
                    {makePunishmentItems({ channel, command, guildId, user })}
                </Menu.MenuItem>
            ))}
            <Menu.MenuItem
                id="vc-iolite-warns"
                label="View warns"
                disabled={!warnsDestination}
                action={() => void submitCommand(
                    warnsDestination,
                    buildCommand(guildId, "warns", user.id)
                )}
            />
            <Menu.MenuSeparator />
            <Menu.MenuItem id="vc-iolite-config" label="Configure this server">
                {makeGuildConfigurationItems(guildId)}
            </Menu.MenuItem>
        </Menu.MenuItem>
    );
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, props: UserContextProps) => {
    if (!props.guildId || !props.user) return;

    children.splice(-1, 0, (
        <Menu.MenuGroup>
            {makeIoliteMenu({
                channel: props.channel,
                guildId: props.guildId,
                user: props.user
            })}
        </Menu.MenuGroup>
    ));
};

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
    contextMenus: {
        "user-context": UserContextMenuPatch
    }
});
