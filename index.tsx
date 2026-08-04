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
    React,
    SelectedChannelStore,
    showToast,
    Toasts,
    useState
} from "@webpack/common";

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
    const id = getGuildConfig(guildId).privateChannelId?.trim();
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

function TextControl({ id, label, placeholder, value, onChange }: {
    id: string;
    label: string;
    placeholder: string;
    value: string;
    onChange(value: string): void;
}) {
    return (
        <Menu.MenuControlItem
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

function DestinationItems({ destination, guildId, onChange }: {
    destination: Destination;
    guildId: string;
    onChange(destination: Destination): void;
}) {
    const privateChannel = getPrivateChannel(guildId);

    return (
        <Menu.MenuItem id="vc-iolite-destination" label="Destination">
            <Menu.MenuRadioItem
                id="vc-iolite-destination-current"
                group="vc-iolite-destination"
                label="Current channel"
                checked={destination === "current"}
                action={() => onChange("current")}
            />
            <Menu.MenuRadioItem
                id="vc-iolite-destination-private"
                group="vc-iolite-destination"
                label={privateChannel ? `#${privateChannel.name}` : "Private channel (not configured)"}
                checked={destination === "private"}
                disabled={!privateChannel}
                action={() => onChange("private")}
            />
        </Menu.MenuItem>
    );
}

function PunishmentComposer({ channel, command, guildId, user }: {
    channel?: Channel;
    command: PunishmentCommand;
    guildId: string;
    user: User;
}) {
    const privateChannel = getPrivateChannel(guildId);
    const initialDestination = settings.store.defaultToPrivateChannel && privateChannel ? "private" : "current";
    const [destination, setDestination] = useState<Destination>(initialDestination);
    const [duration, setDuration] = useState("");
    const [reason, setReason] = useState("");
    const [review, setReview] = useState(false);

    const supportsDuration = command !== "kick";
    const output = buildCommand(guildId, command, user.id, supportsDuration ? duration : "", reason, review);
    const destinationId = destination === "private"
        ? privateChannel?.id
        : getCurrentChannelId(channel);

    return (
        <>
            {supportsDuration && (
                <TextControl
                    id={`vc-iolite-${command}-duration`}
                    label="Duration (optional)"
                    placeholder="e.g. 1h, 7d"
                    value={duration}
                    onChange={setDuration}
                />
            )}
            <TextControl
                id={`vc-iolite-${command}-reason`}
                label="Reason (optional)"
                placeholder="Moderation reason"
                value={reason}
                onChange={setReason}
            />
            <DestinationItems destination={destination} guildId={guildId} onChange={setDestination} />
            <Menu.MenuCheckboxItem
                id={`vc-iolite-${command}-review`}
                label="Review with Sapphire (-r)"
                checked={review}
                action={() => setReview(!review)}
            />
            <Menu.MenuItem
                id={`vc-iolite-${command}-preview`}
                label={`Preview: ${output}`}
                disabled
            />
            <Menu.MenuItem
                id={`vc-iolite-${command}-submit`}
                label={`Send ${command}`}
                color={command === "ban" ? "danger" : undefined}
                disabled={!destinationId}
                action={() => void submitCommand(destinationId, output)}
            />
        </>
    );
}

function GuildConfiguration({ guildId }: { guildId: string; }) {
    const config = getGuildConfig(guildId);
    const [prefix, setPrefix] = useState(config.prefix ?? settings.store.defaultPrefix);
    const [privateChannelId, setPrivateChannelId] = useState(config.privateChannelId ?? "");

    function changePrefix(value: string) {
        setPrefix(value);
        updateGuildConfig(guildId, { prefix: value });
    }

    function changePrivateChannel(value: string) {
        const digitsOnly = value.replace(/\D/g, "");
        setPrivateChannelId(digitsOnly);
        updateGuildConfig(guildId, { privateChannelId: digitsOnly });
    }

    const configuredChannel = getPrivateChannel(guildId);

    return (
        <>
            <TextControl
                id="vc-iolite-config-prefix"
                label="Prefix for this server"
                placeholder="e.g. ?, !, s!"
                value={prefix}
                onChange={changePrefix}
            />
            <TextControl
                id="vc-iolite-config-channel"
                label="Private moderation channel ID"
                placeholder="Right-click channel → Copy Channel ID"
                value={privateChannelId}
                onChange={changePrivateChannel}
            />
            <Menu.MenuItem
                id="vc-iolite-config-channel-status"
                label={configuredChannel
                    ? `Private destination: #${configuredChannel.name}`
                    : privateChannelId
                        ? "Private channel ID is not from this server"
                        : "No private destination configured"}
                disabled
            />
        </>
    );
}

function IoliteMenu({ channel, guildId, user }: {
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
                    <PunishmentComposer channel={channel} command={command} guildId={guildId} user={user} />
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
                <GuildConfiguration guildId={guildId} />
            </Menu.MenuItem>
        </Menu.MenuItem>
    );
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, props: UserContextProps) => {
    if (!props.guildId || !props.user) return;

    children.push(
        <IoliteMenu
            channel={props.channel}
            guildId={props.guildId}
            user={props.user}
        />
    );
};

export default definePlugin({
    name: "Iolite",
    description: "A compact Sapphire moderation companion for Vencord.",
    authors: [{ name: "Epiano7", id: 0n }],
    settings,
    contextMenus: {
        "user-context": UserContextMenuPatch
    }
});
